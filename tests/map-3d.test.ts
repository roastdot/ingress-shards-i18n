import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("curved links meet both portal elevations without overshooting", async () => {
    const {
        getLinkArcOffsetMeters,
        getSeriesGlobeCenter,
        interpolateLongitude,
    } = await import("../src/js/ui/map/map-3d-geometry.js");

    assert.equal(getLinkArcOffsetMeters(0, 2_000), 0);
    assert.equal(getLinkArcOffsetMeters(1, 2_000), 0);
    assert.equal(getLinkArcOffsetMeters(0.5, 2_000), 160);
    assert.equal(
        getLinkArcOffsetMeters(0.25, 2_000),
        getLinkArcOffsetMeters(0.75, 2_000),
    );
    assert.equal(interpolateLongitude(179, -179, 0.5), -180);
    assert.deepEqual(
        getSeriesGlobeCenter([{ lat: 20, lng: 170 }, { lat: 40, lng: -170 }]).map(Math.round),
        [180, 30],
    );

    const renderer = readFileSync(new URL("../src/js/ui/map/map-3d.ts", import.meta.url), "utf8");
    assert.match(renderer, /Cartesian3\.fromDegrees/);
    assert.match(renderer, /getElevationForLatLng/);
    assert.match(renderer, /getLinkArcOffsetMeters/);
    assert.match(renderer, /arcType:\s*ArcType\.NONE/);
    assert.doesNotMatch(renderer, /PolylineDashMaterialProperty/);
    assert.match(renderer, /camera\.lookAt\(target, offset\)/);
});

test("3D renderer is CesiumJS with local static assets and custom terrain", () => {
    const renderer = readFileSync(new URL("../src/js/ui/map/map-3d.ts", import.meta.url), "utf8");
    const webpack = readFileSync(new URL("../webpack.common.js", import.meta.url), "utf8");

    assert.match(renderer, /from ["']cesium["']/);
    assert.match(renderer, /CustomHeightmapTerrainProvider/);
    assert.match(renderer, /UrlTemplateImageryProvider/);
    assert.doesNotMatch(renderer, /maplibre|deck\.gl|map3d-link-overlay/i);
    assert.match(webpack, /CESIUM_BASE_URL/);
    for (const asset of ["Workers", "ThirdParty", "Assets", "Widgets"]) {
        assert.match(webpack, new RegExp(`Build.*Cesium.*${asset}`, "s"));
    }
});

test("coarse 3D terrain stays flat while city tiles cold-load", async () => {
    const { getTerrariumHeightmap } = await import("../src/js/ui/map/elevation.js");
    const originalFetch = globalThis.fetch;
    let terrainRequests = 0;
    globalThis.fetch = async () => {
        terrainRequests++;
        throw new Error("coarse terrain must not hit the network");
    };

    try {
        const heightmap = await getTerrariumHeightmap(0, 0, 0, 32, 32);
        assert.equal(terrainRequests, 0);
        assert.equal(heightmap.length, 32 * 32);
        assert.ok(heightmap.every(height => height === 0));
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("3D terrain does not render tile skirts through the city view", () => {
    const renderer = readFileSync(new URL("../src/js/ui/map/map-3d.ts", import.meta.url), "utf8");

    assert.match(renderer, /scene\.globe\.showSkirts\s*=\s*false/);
});

test("3D shard icons finish ground-clamped at their destination portal", () => {
    const source = readFileSync(new URL("../src/js/ui/map/map-3d.ts", import.meta.url), "utf8");

    assert.match(source, /createShardEntity/);
    assert.match(source, /motionShardEntities/);
    assert.match(source, /HeightReference\.CLAMP_TO_GROUND/);
    assert.match(source, /point\.groundHeight/);
    assert.match(source, /progress\s*>=\s*1/);
    assert.match(source, /shardIconUrl/);
});

test("3D target images align with the terrain plane", () => {
    const source = readFileSync(new URL("../src/js/ui/map/map-3d.ts", import.meta.url), "utf8");

    assert.match(source, /marker\.options\.pane\s*===\s*["']targetPane["']/);
    assert.match(source, /ImageMaterialProperty/);
    assert.match(source, /rectangle:/);
    assert.match(source, /heightReference:\s*HeightReference\.CLAMP_TO_GROUND/);
});

test("series overview markers use event artwork, controls, and hemisphere culling", () => {
    const source = readFileSync(new URL("../src/js/ui/map/map-3d.ts", import.meta.url), "utf8");
    const seriesRenderer = readFileSync(new URL("../src/js/ui/series-renderer.ts", import.meta.url), "utf8");

    assert.match(source, /event-composite-marker/);
    assert.match(source, /_map3dImageUrl/);
    assert.match(source, /createSeriesMarkerImage/);
    assert.match(source, /_map3dAccentColor/);
    assert.match(source, /_map3dLabel/);
    assert.match(source, /_map3dNavigate/);
    assert.match(source, /_map3dWinnerImageUrl/);
    assert.match(source, /CallbackProperty/);
    assert.match(source, /Cartesian3\.dot\(surfaceNormal, toCamera\)\s*>\s*0/);
    assert.match(source, /map3d-leaflet-controls/);
    assert.match(source, /map3d-season-toggle/);
    assert.match(source, /map3d-season-option/);
    assert.match(source, /map3d-wave-toggle/);
    assert.match(source, /map3d-wave-option/);
    assert.match(source, /getAllSeriesIds/);
    assert.match(source, /getSiteLayers/);
    assert.match(source, /navigate\(`#\/\$\{seriesId\}`\)/);
    assert.match(source, /LabelStyle\.FILL_AND_OUTLINE/);
    assert.match(source, /SERIES_GLOBE_CAMERA_HEIGHT_METERS/);
    assert.match(source, /getSeriesGlobeCenter/);
    assert.match(seriesRenderer, /siteMarker\._map3dImageUrl\s*=\s*eventLogoUrl/);
    assert.match(seriesRenderer, /siteMarker\._map3dBadge\s*=\s*isAnomalyMarker\s*\?\s*''\s*:\s*eventTypeLabel/);
    assert.match(seriesRenderer, /siteMarker\._map3dWinnerImageUrl\s*=\s*factionLogoUrl/);
    assert.match(seriesRenderer, /siteMarker\._map3dNavigate\s*=\s*Boolean\(siteData\)\s*&&\s*!isUpcoming/);
    assert.doesNotMatch(source, /marker\.listens\(["']click["']\)/);
    assert.match(source, /marker\.fire\(["']click["']\)/);
    assert.match(source, /getBoundTooltipHtml/);
    assert.match(seriesRenderer, /series\.upcoming_status/);
});
