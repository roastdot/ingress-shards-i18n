import assert from "node:assert/strict";
import { test } from "node:test";

test("missing Cesium ion token uses the fallback terrain without a network attempt", async () => {
    const { resolveTerrainProvider } = await import("../src/js/ui/map/map-3d-terrain.js");
    const fallback = { name: "ellipsoid" };
    let worldTerrainAttempts = 0;

    const provider = await resolveTerrainProvider("", {
        configureToken: () => assert.fail("an empty token must not be configured"),
        createWorldTerrain: async () => {
            worldTerrainAttempts++;
            return { name: "world" };
        },
        createFallbackTerrain: () => fallback,
    });

    assert.equal(provider, fallback);
    assert.equal(worldTerrainAttempts, 0);
});

test("configured Cesium ion token loads World Terrain", async () => {
    const { resolveTerrainProvider } = await import("../src/js/ui/map/map-3d-terrain.js");
    const worldTerrain = { name: "world" };
    let configuredToken = "";

    const provider = await resolveTerrainProvider("  public-domain-token  ", {
        configureToken: token => { configuredToken = token; },
        createWorldTerrain: async () => worldTerrain,
        createFallbackTerrain: () => ({ name: "ellipsoid" }),
    });

    assert.equal(provider, worldTerrain);
    assert.equal(configuredToken, "public-domain-token");
});

test("World Terrain initialization failure reports the error and uses fallback terrain", async () => {
    const { resolveTerrainProvider } = await import("../src/js/ui/map/map-3d-terrain.js");
    const fallback = { name: "ellipsoid" };
    const terrainError = new Error("terrain unavailable");
    let reportedError: unknown;

    const provider = await resolveTerrainProvider("public-domain-token", {
        configureToken: () => undefined,
        createWorldTerrain: async () => { throw terrainError; },
        createFallbackTerrain: () => fallback,
        onError: error => { reportedError = error; },
    });

    assert.equal(provider, fallback);
    assert.equal(reportedError, terrainError);
});

test("Cesium token configuration failure also uses fallback terrain", async () => {
    const { resolveTerrainProvider } = await import("../src/js/ui/map/map-3d-terrain.js");
    const fallback = { name: "ellipsoid" };
    const tokenError = new Error("token rejected");
    let reportedError: unknown;

    const provider = await resolveTerrainProvider("public-domain-token", {
        configureToken: () => { throw tokenError; },
        createWorldTerrain: async () => assert.fail("terrain must not load after token failure"),
        createFallbackTerrain: () => fallback,
        onError: error => { reportedError = error; },
    });

    assert.equal(provider, fallback);
    assert.equal(reportedError, tokenError);
});

test("webpack exposes the configured public terrain token to the browser build", async () => {
    const originalToken = process.env.CESIUM_ION_TOKEN;
    process.env.CESIUM_ION_TOKEN = "domain-restricted-test-token";

    try {
        const { default: createWebpackConfig } = await import("../webpack.common.js");
        const config = createWebpackConfig({}, { appVersion: "test" });
        const definePlugin = config.plugins?.find(
            plugin => plugin?.constructor.name === "DefinePlugin",
        ) as { definitions?: Record<string, string> } | undefined;

        assert.equal(
            definePlugin?.definitions?.__CESIUM_ION_TOKEN__,
            JSON.stringify("domain-restricted-test-token"),
        );
    } finally {
        if (originalToken === undefined) delete process.env.CESIUM_ION_TOKEN;
        else process.env.CESIUM_ION_TOKEN = originalToken;
    }
});

test("sampled route keeps its arc above terrain and meets both ground endpoints", async () => {
    const { sampleRouteTerrain } = await import("../src/js/ui/map/map-3d-terrain.js");
    const route = [
        { lng: 24.93, lat: 60.17, arcHeight: 0 },
        { lng: 24.94, lat: 60.18, arcHeight: 30 },
        { lng: 24.95, lat: 60.19, arcHeight: 0 },
    ];

    const sampled = await sampleRouteTerrain(route, async locations => {
        assert.deepEqual(locations, route.map(({ lng, lat }) => ({ lng, lat })));
        return [12, 15, 20];
    });

    assert.deepEqual(
        sampled.map(point => point.groundHeight + point.arcHeight),
        [12, 45, 20],
    );
});

test("multiple routes share one terrain sampling request and preserve route boundaries", async () => {
    const { sampleRoutesTerrain } = await import("../src/js/ui/map/map-3d-terrain.js");
    const routes = [
        [
            { lng: 24.93, lat: 60.17, arcHeight: 0 },
            { lng: 24.94, lat: 60.18, arcHeight: 30 },
        ],
        [
            { lng: 24.95, lat: 60.19, arcHeight: 0 },
        ],
    ];
    let calls = 0;

    const sampled = await sampleRoutesTerrain(routes, async locations => {
        calls++;
        assert.deepEqual(locations, [
            { lng: 24.93, lat: 60.17 },
            { lng: 24.94, lat: 60.18 },
            { lng: 24.95, lat: 60.19 },
        ]);
        return [12, 15, 20];
    });

    assert.equal(calls, 1);
    assert.deepEqual(sampled.map(route => route.map(point => point.groundHeight)), [
        [12, 15],
        [20],
    ]);
});

test("terrain sampling failure preserves the route on the ellipsoid fallback", async () => {
    const { sampleRouteTerrain } = await import("../src/js/ui/map/map-3d-terrain.js");
    const route = [
        { lng: -73.99, lat: 40.73, arcHeight: 0 },
        { lng: -73.98, lat: 40.74, arcHeight: 40 },
    ];
    const samplingError = new Error("tile failed");
    let reportedError: unknown;

    const sampled = await sampleRouteTerrain(
        route,
        async () => { throw samplingError; },
        error => { reportedError = error; },
    );

    assert.deepEqual(sampled.map(point => point.groundHeight), [0, 0]);
    assert.equal(reportedError, samplingError);
});

test("one missing terrain height falls back the whole route instead of creating a spike", async () => {
    const { sampleRouteTerrain } = await import("../src/js/ui/map/map-3d-terrain.js");
    const route = [
        { lng: 24.93, lat: 60.17, arcHeight: 0 },
        { lng: 24.94, lat: 60.18, arcHeight: 30 },
        { lng: 24.95, lat: 60.19, arcHeight: 0 },
    ];
    let reportedError: unknown;

    const sampled = await sampleRouteTerrain(
        route,
        async () => [12, undefined, 20],
        error => { reportedError = error; },
    );

    assert.deepEqual(sampled.map(point => point.groundHeight), [0, 0, 0]);
    assert.ok(reportedError instanceof Error);
});
