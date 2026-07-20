const MAP_VIEW_PARAM = "view";
const MAP_VIEW_3D = "3d";

export function is3DViewRequested(search: string = window.location.search): boolean {
    return new URLSearchParams(search).get(MAP_VIEW_PARAM) === MAP_VIEW_3D;
}

export function update3DViewUrl(href: string, enabled: boolean): string {
    const url = new URL(href);
    if (enabled) url.searchParams.set(MAP_VIEW_PARAM, MAP_VIEW_3D);
    else url.searchParams.delete(MAP_VIEW_PARAM);
    return `${url.pathname}${url.search}${url.hash}`;
}

export function set3DViewRequested(enabled: boolean): void {
    const nextUrl = update3DViewUrl(window.location.href, enabled);
    history.replaceState(history.state, "", nextUrl);
}
