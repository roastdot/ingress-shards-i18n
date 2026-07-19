import { CUSTOM_SERIES_ID, SITE_AGGREGATION_DISTANCE } from '../constants.js';
import { processSeriesData } from './shard-jumps/data-processor.js';
import { calculateCentroid, getCoordsForFragment, getFragmentSpawnTimeMs } from './shard-jumps/data-helpers.js';
import { haversineDistance, roundToDecimalPlaces } from "../shared/math-helpers.js";
import { formatEpochToSerializationString, isWithin24Hours } from '../shared/date-helpers.js';
import eventBlueprints from '../../../conf/event_blueprints.json' with { type: 'json' };

const workerSelf = self as unknown as WorkerGlobalScopeLike;

const siteCounter = Symbol("siteCounter");
const rawFragments = Symbol("rawFragments");

workerSelf.onmessage = function (event: MessageEvent) {
    const { seriesId, customFile } = event.data;

    try {
        console.log(`Processing custom file: ${customFile.fileName}`);
        const parsedData = JSON.parse(customFile.rawData);
        const rawDataMap: Record<string, any[]> = {}; rawDataMap['shardJumpTimes'] = [parsedData];
        const customGeocode = getCustomGeocode({ fileName: customFile.fileName, parsedData });
        const seriesDataPackage = {
            config: { name: 'Custom Season' },
            geocode: customGeocode,
            blueprints: eventBlueprints,
            rawData: rawDataMap,
        }
        const processedData = processSeriesData(seriesDataPackage);
        const customProcessedData = {
            geocode: customGeocode,
            data: processedData,
        }
        workerSelf.postMessage({ status: "complete", processedData: customProcessedData, seriesId });
    } catch (error) {
        console.error('Error during processing:', error);
        workerSelf.postMessage({ status: "error", message: (error as Error).message });
    }
};

function getCustomGeocode({ fileName, parsedData }: { fileName: string; parsedData: any }): any {
    const customGeocode: any = {
        sites: [],

        [siteCounter]: 1,
    };

    const artifacts = parsedData.artifact.filter((d: any) => d.fragment);
    artifacts.sort((a: any, b: any) => a.name.localeCompare(b.name));

    for (const artifact of artifacts) {
        const sortedFragments = artifact.fragment.sort((a: any, b: any) => a.id.localeCompare(b.id));
        for (const fragment of sortedFragments) {
            const fragmentCoords = getCoordsForFragment(fragment);
            const matchedSite = customGeocode.sites.find((site: any) => {
                const siteCoords = {
                    latitude: site.lat,
                    longitude: site.lng,
                };

                const distance = roundToDecimalPlaces(haversineDistance(fragmentCoords, siteCoords), 2);
                const siteDate = new Date(site.date).getTime();
                const matchingDate = isWithin24Hours(getFragmentSpawnTimeMs(fragment) ?? 0, siteDate);

                return (distance < SITE_AGGREGATION_DISTANCE && matchingDate);
            });

            if (matchedSite) {
                matchedSite[rawFragments].push(fragment);
            } else {
                const siteId = `${CUSTOM_SERIES_ID}-${fileName}-${customGeocode[siteCounter]}`;
                const fragmentSpawnTimeMs = getFragmentSpawnTimeMs(fragment) ?? 0;
                const newSite: any = {
                    id: siteId,
                    lat: fragmentCoords.latitude,
                    lng: fragmentCoords.longitude,
                    eventType: 'UNKNOWN',
                    date: formatEpochToSerializationString(fragmentSpawnTimeMs),
                    name: `${fileName}-${customGeocode[siteCounter]}`,

                    [rawFragments]: []
                };
                customGeocode.sites.push(newSite);
                customGeocode[siteCounter]++;
                newSite[rawFragments].push(fragment);
            }
        }
    }
    for (const site of customGeocode.sites) {
        site.eventType = site[rawFragments].length > 1 ? 'MULTIPLE_SHARDS' : 'SINGLE_SHARD';
        const centroid = calculateCentroid(site[rawFragments]);
        site.lat = centroid!.lat;
        site.lng = centroid!.lng;
    }

    return customGeocode;
}
