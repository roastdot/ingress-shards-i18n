import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("curved links meet both portal elevations without overshooting", async () => {
    const {
        getLinkArcOffsetMeters,
        getSeriesGlobeCenter,
        getTerrainRingCoordinates,
        interpolateLongitude,
        leafletRadiusToTerrainMeters,
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
    assert.ok(leafletRadiusToTerrainMeters(10, 60, 20) < 1);
    assert.equal(leafletRadiusToTerrainMeters(10, 0, 1), 24);
    const ring = getTerrainRingCoordinates(24.94, 60.17, 4, 32);
    assert.equal(ring.length, 33);
    assert.deepEqual(ring[0], ring[ring.length - 1]);

    const renderer = readFileSync(new URL("../src/js/ui/map/map-3d.ts", import.meta.url), "utf8");
    assert.match(renderer, /Cartesian3\.fromDegrees/);
    assert.match(renderer, /getLinkArcOffsetMeters/);
    assert.match(renderer, /arcType:\s*ArcType\.NONE/);
    assert.doesNotMatch(renderer, /PolylineDashMaterialProperty/);
    assert.match(renderer, /camera\.lookAt\(target, offset\)/);
});

test("3D renderer uses Cesium World Terrain with an ellipsoid fallback", () => {
    const renderer = readFileSync(new URL("../src/js/ui/map/map-3d.ts", import.meta.url), "utf8");
    const webpack = readFileSync(new URL("../webpack.common.js", import.meta.url), "utf8");
    const productionWebpack = readFileSync(new URL("../webpack.prod.js", import.meta.url), "utf8");

    assert.match(renderer, /from ["']cesium["']/);
    assert.match(renderer, /EllipsoidTerrainProvider/);
    assert.match(renderer, /createWorldTerrainAsync/);
    assert.match(renderer, /resolveTerrainProvider/);
    assert.match(renderer, /__CESIUM_ION_TOKEN__/);
    assert.doesNotMatch(renderer, /CustomHeightmapTerrainProvider|getTerrariumHeightmap|getElevationForLatLng/);
    assert.match(renderer, /UrlTemplateImageryProvider/);
    assert.doesNotMatch(renderer, /maplibre|deck\.gl|map3d-link-overlay/i);
    assert.match(webpack, /CESIUM_BASE_URL/);
    for (const asset of ["Workers", "ThirdParty", "Assets", "Widgets"]) {
        assert.match(webpack, new RegExp(`Build.*Cesium.*${asset}`, "s"));
    }
    assert.match(productionWebpack, /filename:\s*["']\[name\]\.\[contenthash:8\]\.js["']/);
});

test("3D view mode survives refresh without changing the active route", async () => {
    const {
        is3DViewRequested,
        update3DViewUrl,
    } = await import("../src/js/ui/map/map-view-state.js");

    const overview = update3DViewUrl("https://example.test/?lang=zh-HK#/2026-apollo", true);
    const city = update3DViewUrl("https://example.test/#/2026-apollo/helsinki/wave-5", true);
    assert.equal(overview, "/?lang=zh-HK&view=3d#/2026-apollo");
    assert.equal(city, "/?view=3d#/2026-apollo/helsinki/wave-5");
    assert.equal(is3DViewRequested("?view=3d"), true);
    assert.equal(is3DViewRequested("?view=2d"), false);
    assert.equal(
        update3DViewUrl(`https://example.test${city}`, false),
        "/#/2026-apollo/helsinki/wave-5",
    );

    const index = readFileSync(new URL("../src/js/index.tsx", import.meta.url), "utf8");
    const manager = readFileSync(new URL("../src/js/ui/map/map-manager.ts", import.meta.url), "utf8");
    const renderer = readFileSync(new URL("../src/js/ui/map/map-3d.ts", import.meta.url), "utf8");
    assert.match(index, /restoreRequested3DView\(map\)/);
    assert.match(manager, /set3DViewRequested\(true\)/);
    assert.match(renderer, /set3DViewRequested\(false\)/);
});

test("2D shard motion restarts after a synchronous refresh move", async () => {
    const { restartShardMotionAfterMapMove } = await import("../src/js/ui/map/shard-motion.js");
    let moveEnd: ((event: { target: unknown }) => void) | undefined;
    let starts = 0;
    const layers = [
        { startShardMotion: () => { starts++; } },
        {},
    ];
    const map = {
        once: (event: string, listener: (event: { target: unknown }) => void) => {
            assert.equal(event, "moveend");
            moveEnd = listener;
        },
        eachLayer: (visitor: (layer: unknown) => void) => layers.forEach(visitor),
    };

    restartShardMotionAfterMapMove(map, () => {
        assert.ok(moveEnd, "moveend must be registered before a synchronous fitBounds");
        moveEnd({ target: map });
    });

    assert.equal(starts, 1);
});

test("3D shard icons finish ground-clamped at their destination portal", () => {
    const source = readFileSync(new URL("../src/js/ui/map/map-3d.ts", import.meta.url), "utf8");

    assert.match(source, /createShardEntity/);
    assert.match(source, /motionShardEntities/);
    assert.match(source, /HeightReference\.CLAMP_TO_GROUND/);
    assert.match(source, /progress\s*>=\s*1/);
    assert.match(source, /shardIconUrl/);
});

test("3D target images align with the terrain plane", () => {
    const source = readFileSync(new URL("../src/js/ui/map/map-3d.ts", import.meta.url), "utf8");

    assert.match(source, /marker\.options\.pane\s*===\s*["']targetPane["']/);
    assert.match(source, /ImageMaterialProperty/);
    assert.match(source, /rectangle:/);
    assert.match(source, /height:\s*0/);
    assert.match(source, /heightReference:\s*HeightReference\.CLAMP_TO_GROUND/);
});

test("3D portal rings drape over terrain instead of using a planar or screen-facing shape", () => {
    const source = readFileSync(new URL("../src/js/ui/map/map-3d.ts", import.meta.url), "utf8");
    const portalRenderer = source.slice(
        source.indexOf("private mirrorCircleMarker"),
        source.indexOf("private mirrorPolyline"),
    );

    assert.match(portalRenderer, /polyline:/);
    assert.match(portalRenderer, /getTerrainRingCoordinates/);
    assert.match(portalRenderer, /clampToGround:\s*true/);
    assert.doesNotMatch(portalRenderer, /point:/);
    assert.doesNotMatch(portalRenderer, /ellipse:/);
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
