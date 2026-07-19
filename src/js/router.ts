export interface ViewDispatchers {
    displaySeriesDetails(seriesId: string): void;
    displaySiteDetails(seriesId: string, siteNavigationId: string): void;
    displayWaveDetails(seriesId: string, siteNavigationId: string, waveId: string): void;
    showDefaultView(): void;
}

interface RouteHistoryState {
    path?: string;
    historyIndex?: number;
}

let viewDispatchers: ViewDispatchers | null = null;

let lastHistoryIndex: number = (history.state as RouteHistoryState | null)?.historyIndex || 0;

export let IS_NAVIGATING_BACK = false;

export function setViewDispatchers(dispatchers: ViewDispatchers): void {
    viewDispatchers = dispatchers;
    updateViewFromHash();
}

export function navigate(url: string): void {
    const hash = window.location.hash;
    if (hash === url && url !== '#/custom') return;

    lastHistoryIndex++;
    const newState: RouteHistoryState = { path: url, historyIndex: lastHistoryIndex };

    if (hash == '/' && url !== '#/custom') {
        history.replaceState(newState, '', url);
    } else {
        history.pushState(newState, '', url);
    }
    IS_NAVIGATING_BACK = false;

    updateViewFromHash();
}

function updateViewFromHash(): void {
    if (!viewDispatchers) return;

    const hash = window.location.hash;
    const segments = hash.replace('#', '').split('/').filter(s => s.length > 0);

    const [seriesId, siteId, waveId] = segments
    switch (segments.length) {
        case 1:
            viewDispatchers.displaySeriesDetails(seriesId);
            break;
        case 2:
            viewDispatchers.displaySiteDetails(seriesId, siteId);
            break;
        case 3:
            viewDispatchers.displayWaveDetails(seriesId, siteId, waveId);
            break;
        default:
            viewDispatchers.showDefaultView();
            break;
    }
}

window.addEventListener('popstate', function (e: PopStateEvent) {
    const newIndex = (e.state as RouteHistoryState | null)?.historyIndex || 0;

    IS_NAVIGATING_BACK = (newIndex < lastHistoryIndex);
    lastHistoryIndex = newIndex;

    updateViewFromHash();
});
