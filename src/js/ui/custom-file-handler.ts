import { CUSTOM_SERIES_ID } from "../constants.js";
import { addCustomData } from "../data/data-store.js";
import { navigate } from "../router.js";
import { updateCustomSeriesLayer } from "./series-renderer.js";
import { t } from "../i18n/index.js";
import type { DetailsPanelContent } from "./series-renderer.js";

export async function handleCustomFile(event: Event): Promise<void> {
    const files = (event.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;

    for (const file of files) {
        await processSingleFile(file);
    }
}

export async function processSingleFile(customFile: File): Promise<void> {
    if (!customFile) return;

    const reader = new FileReader();
    reader.onload = async function (e: ProgressEvent<FileReader>) {
        const localRawJsonString = e.target!.result as string;

        const jsonParserWorker = new Worker(
            new URL(
                /* webpackChunkName: "json-parser.worker" */
                '../data/json-parser-worker.js',
                import.meta.url
            ),
            { type: "module" }
        );
        jsonParserWorker.postMessage({
            seriesId: CUSTOM_SERIES_ID,
            customFile: {
                fileName: customFile.name,
                rawData: localRawJsonString,
            }
        });
        jsonParserWorker.onmessage = async (workerEvent: MessageEvent) => {
            if (workerEvent.data.status === "complete") {
                addCustomData(workerEvent.data.processedData);
                updateCustomSeriesLayer(CUSTOM_SERIES_ID);

                navigate(`#/${CUSTOM_SERIES_ID}`);

                jsonParserWorker.terminate();
            }
        };
    };
    reader.readAsText(customFile);
}

export function getDetailsPanelContent(): DetailsPanelContent {
    const content = `<input id="${CUSTOM_SERIES_ID}-file-input" class="series" type="file" accept="application/json" />`;

    return {
        title: t('custom.season_details'),
        content,
    };
}
