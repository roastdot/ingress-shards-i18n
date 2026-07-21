export interface TerrainProviderDependencies<T> {
    configureToken: (token: string) => void;
    createWorldTerrain: () => Promise<T>;
    createFallbackTerrain: () => T;
    onError?: (error: unknown) => void;
}

export interface TerrainRoutePoint {
    lng: number;
    lat: number;
    arcHeight: number;
}

export interface GroundedTerrainRoutePoint extends TerrainRoutePoint {
    groundHeight: number;
}

export type TerrainHeightSampler = (
    locations: ReadonlyArray<{ lng: number; lat: number }>,
) => Promise<ReadonlyArray<number | null | undefined>>;

export async function resolveTerrainProvider<T>(
    token: string,
    dependencies: TerrainProviderDependencies<T>,
): Promise<T> {
    const configuredToken = token.trim();
    if (!configuredToken) return dependencies.createFallbackTerrain();

    try {
        dependencies.configureToken(configuredToken);
        return await dependencies.createWorldTerrain();
    } catch (error) {
        dependencies.onError?.(error);
        return dependencies.createFallbackTerrain();
    }
}

export async function sampleRouteTerrain(
    route: ReadonlyArray<TerrainRoutePoint>,
    sampleHeights: TerrainHeightSampler,
    onError?: (error: unknown) => void,
): Promise<GroundedTerrainRoutePoint[]> {
    let heights: ReadonlyArray<number | null | undefined>;
    let samplingFailed = false;
    try {
        heights = await sampleHeights(route.map(({ lng, lat }) => ({ lng, lat })));
    } catch (error) {
        onError?.(error);
        heights = [];
        samplingFailed = true;
    }
    if (
        !samplingFailed
        && (
            heights.length !== route.length
            || heights.some(height => !Number.isFinite(height))
        )
    ) {
        onError?.(new Error("Terrain sampling returned incomplete heights"));
        heights = [];
    }
    return route.map((point, index) => ({
        ...point,
        groundHeight: Number.isFinite(heights[index]) ? heights[index]! : 0,
    }));
}

export async function sampleRoutesTerrain(
    routes: ReadonlyArray<ReadonlyArray<TerrainRoutePoint>>,
    sampleHeights: TerrainHeightSampler,
    onError?: (error: unknown) => void,
): Promise<GroundedTerrainRoutePoint[][]> {
    const flattened = routes.flat();
    const grounded = await sampleRouteTerrain(flattened, sampleHeights, onError);
    let offset = 0;

    return routes.map(route => {
        const sampledRoute = grounded.slice(offset, offset + route.length);
        offset += route.length;
        return sampledRoute;
    });
}
