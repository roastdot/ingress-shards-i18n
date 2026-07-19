import seriesMetadataFile from "../../../conf/series_metadata.json" with { type: "json" };
import seriesGeocodeFile from "../../../gen/series_geocode.json" with { type: "json" };
import seriesDataFile from "../../../gen/processed_series_data.json" with { type: "json" };
import seriesResultsFile from "../../../conf/series_results.json" with { type: "json" };
import { CUSTOM_SERIES_ID } from "../constants.js";
import type { SeriesResult, SeriesMetadata, SeriesGeocode, SeriesSiteData, SiteData } from "../types/domain.js";

const seriesMetadata = seriesMetadataFile as unknown as { series: SeriesMetadata[] };
const seriesGeocode = seriesGeocodeFile as unknown as Record<string, { sites: Array<{ id: string; [key: string]: unknown }> }>;
const seriesData = seriesDataFile as unknown as Record<string, SeriesSiteData>;
const seriesResults = seriesResultsFile as unknown as { series: SeriesResult[] };
const seriesResultsById = new Map(seriesResults.series.map((result) => [result.seriesId, result]));

interface SeriesCacheEntry {
    metadata: SeriesMetadata;
    geocode: SeriesGeocode | null;
    data: SeriesSiteData | null;
}

const seriesCache: Record<string, SeriesCacheEntry> = {};
let defaultSeriesId: string | null = null;

export async function initDataStore(): Promise<void> {
    seriesCache[CUSTOM_SERIES_ID] = {
        metadata: {
            id: CUSTOM_SERIES_ID,
            name: "Custom",
        },
        geocode: {
            sites: {},
        },
        data: {},
    };

    for (const sm of seriesMetadata.series) {
        seriesCache[sm.id] = {
            metadata: sm,
            geocode: null,
            data: null,
        };
        if (sm.defaultView) {
            defaultSeriesId = sm.id;
        }
    }

    for (const [seriesId, geo] of Object.entries(seriesGeocode)) {
        if (seriesCache[seriesId]) {
            const sitesMap = geo.sites.reduce<Record<string, unknown>>((acc, site) => {
                acc[site.id] = site;
                return acc;
            }, {});

            seriesCache[seriesId].geocode = {
                sites: sitesMap,
            } as unknown as SeriesGeocode;
        }
    }

    for (const [seriesId, data] of Object.entries(seriesData)) {
        if (seriesCache[seriesId]) {
            seriesCache[seriesId].data = data;
        }
    }

    if (!defaultSeriesId && seriesMetadata.series.length > 0) {
        defaultSeriesId = seriesMetadata.series[0].id;
    }
}

export function getAllSeriesIds(): string[] {
    return Object.keys(seriesCache);
}

export function getDefaultSeriesId(): string | null {
    return defaultSeriesId;
}

export function getSeriesMetadata(seriesId: string): SeriesMetadata | undefined {
    return seriesCache[seriesId]?.metadata;
}

export function getSeriesGeocode(seriesId: string): SeriesGeocode | null | undefined {
    return seriesCache[seriesId]?.geocode;
}

export function getSiteData(seriesId: string, siteId: string): SiteData | undefined {
    const seriesEntry = seriesCache[seriesId];
    return seriesEntry?.data?.[siteId];
}

export function getSeriesResult(seriesId: string): SeriesResult | null {
    return seriesResultsById.get(seriesId) ?? null;
}

export interface CustomProcessedData {
    geocode: { sites: Array<{ id: string; [key: string]: unknown }> };
    data: SeriesSiteData;
}

export function addCustomData(processedData: CustomProcessedData): void {
    const { geocode, data } = processedData;

    for (const site of geocode.sites) {
        (seriesCache[CUSTOM_SERIES_ID].geocode as SeriesGeocode).sites[site.id] = site as unknown as import("../types/domain.js").SiteGeocodeEntry;
    }

    for (const [siteId, siteData] of Object.entries(data)) {
        seriesCache[CUSTOM_SERIES_ID].data![siteId] = siteData;
    }
}
