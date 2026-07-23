import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("curved links meet both portal elevations without overshooting", async () => {
    const {
        getLinkArcOffsetMeters,
        PORTAL_CONTROL_RADIUS_METERS,
        getSeriesGlobeCenter,
        getTerrainRingCoordinates,
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
    assert.equal(PORTAL_CONTROL_RADIUS_METERS, 20);
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

test("animation controls preserve one-shot playback while supporting pause and loop", async () => {
    const controls = await import("../src/js/ui/react/animationControlStore.js");

    assert.deepEqual(controls.getAnimationControlState(), {
        available: false,
        playback: "ended",
        loop: false,
        speed: 1,
        linkSelectionEnabled: false,
        selectedLinkKey: null,
        commandVersion: 0,
    });

    controls.setAnimationAvailable(true);
    assert.equal(controls.getAnimationControlState().playback, "playing");

    controls.toggleAnimationPlayback();
    assert.equal(controls.getAnimationControlState().playback, "paused");
    assert.equal(controls.getAnimationControlState().commandVersion, 1);

    controls.toggleAnimationLoop();
    assert.equal(controls.getAnimationControlState().loop, true);
    assert.equal(controls.getAnimationControlState().commandVersion, 2);

    controls.toggleAnimationPlayback();
    controls.setAnimationSpeed(2);
    assert.equal(controls.getAnimationControlState().speed, 2);

    controls.toggleAnimationLinkSelection();
    controls.selectAnimationLink("101-202");
    assert.equal(controls.getAnimationControlState().selectedLinkKey, "101-202");
    assert.equal(controls.getAnimationControlState().playback, "playing");

    controls.toggleAnimationLinkSelection();
    assert.equal(controls.getAnimationControlState().linkSelectionEnabled, false);
    assert.equal(controls.getAnimationControlState().selectedLinkKey, null);

    controls.reportAnimationPlayback("ended");
    assert.equal(controls.getAnimationControlState().playback, "ended");
    assert.equal(controls.getAnimationControlState().commandVersion, 7);
});

test("3D shards use a terrain-aware crystal model instead of a billboard alone", async () => {
    const source = readFileSync(new URL("../src/js/ui/map/map-3d.ts", import.meta.url), "utf8");
    const { SHARD_MODEL_URI, SHARD_MODEL_GROUND_OFFSET_METERS } = await import(
        "../src/js/ui/map/map-3d-shard-model.js"
    );

    assert.match(source, /createShardEntity/);
    assert.match(source, /motionShardEntities/);
    assert.match(source, /model:/);
    assert.match(source, /uri:\s*SHARD_MODEL_URI/);
    assert.doesNotMatch(source, /silhouetteColor/);
    assert.match(source, /distanceDisplayCondition:\s*new DistanceDisplayCondition/);
    assert.match(source, /groundHeight\s*\+\s*point\.arcHeight\s*\+\s*SHARD_MODEL_GROUND_OFFSET_METERS/);
    assert.match(source, /staticShards/);
    assert.match(source, /staticShardOffset/);
    assert.match(source, /progress\s*>=\s*1/);
    assert.match(source, /shardIconUrl/);
    assert.match(SHARD_MODEL_URI, /^data:model\/gltf\+json;base64,/);
    const encodedModel = SHARD_MODEL_URI.split(",")[1];
    const gltf = JSON.parse(Buffer.from(encodedModel, "base64").toString("utf8"));
    assert.equal(SHARD_MODEL_GROUND_OFFSET_METERS, 11);
    assert.ok(gltf.meshes[0].primitives.length >= 3);
    assert.ok(gltf.materials.some((material: { name?: string }) => material.name === "Faceted crystal"));
    assert.ok(gltf.materials.some((material: { name?: string }) => material.name === "XM beam outer"));
    assert.ok(gltf.materials.some((material: { name?: string }) => material.name === "XM beam core"));
    assert.deepEqual(gltf.extensionsUsed, ["KHR_materials_unlit"]);
    assert.deepEqual(gltf.accessors[0].max, [0.85, 0.45, 0.85]);
    assert.deepEqual(gltf.accessors[3].min, [-0.85, -0.95, -0.85]);
    assert.deepEqual(gltf.accessors[6].min, [-0.13, -2.2, -0.13]);
    assert.ok(
        gltf.materials[0].pbrMetallicRoughness.baseColorFactor[0]
        < gltf.materials[1].pbrMetallicRoughness.baseColorFactor[0],
    );
});

test("3D target images stay just above the terrain instead of z-fighting with it", () => {
    const source = readFileSync(new URL("../src/js/ui/map/map-3d.ts", import.meta.url), "utf8");

    assert.match(source, /marker\.options\.pane\s*===\s*["']targetPane["']/);
    assert.match(source, /ImageMaterialProperty/);
    assert.match(source, /rectangle:/);
    assert.match(source, /const TARGET_SIZE_METERS = 32/);
    assert.match(source, /const TARGET_TERRAIN_OFFSET_METERS = 1\.5/);
    assert.match(source, /height:\s*TARGET_TERRAIN_OFFSET_METERS/);
    assert.match(source, /heightReference:\s*HeightReference\.RELATIVE_TO_GROUND/);
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
    assert.match(portalRenderer, /arcType:\s*ArcType\.GEODESIC/);
    assert.doesNotMatch(portalRenderer, /arcType:\s*ArcType\.NONE/);
    assert.doesNotMatch(portalRenderer, /ellipse:/);
});

test("3D portals include a generous invisible center hit target", () => {
    const source = readFileSync(new URL("../src/js/ui/map/map-3d.ts", import.meta.url), "utf8");
    const portalRenderer = source.slice(
        source.indexOf("private mirrorCircleMarker"),
        source.indexOf("private mirrorPolyline"),
    );

    assert.match(portalRenderer, /point:/);
    assert.match(portalRenderer, /pixelSize:\s*PORTAL_HIT_SIZE_PIXELS/);
    assert.match(portalRenderer, /heightReference:\s*HeightReference\.CLAMP_TO_GROUND/);
    assert.match(portalRenderer, /disableDepthTestDistance:\s*Number\.POSITIVE_INFINITY/);
});

test("interactive 3D entities show a pointer cursor on hover", () => {
    const source = readFileSync(new URL("../src/js/ui/map/map-3d.ts", import.meta.url), "utf8");

    assert.match(source, /ScreenSpaceEventType\.MOUSE_MOVE/);
    assert.match(source, /style\.cursor\s*=\s*interactive\s*\?\s*["']pointer["']\s*:\s*["']["']/);
});

test("series overview labels are rasterized into marker art instead of Cesium glyph atlases", () => {
    const source = readFileSync(new URL("../src/js/ui/map/map-3d.ts", import.meta.url), "utf8");

    assert.doesNotMatch(source, /label:\s*seriesMarker/);
    assert.match(source, /createSeriesMarkerImage\([\s\S]*?_map3dLabel/);
    assert.match(source, /context\.strokeText\(label/);
    assert.match(source, /context\.fillText\(label/);
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
    assert.doesNotMatch(source, /LabelStyle\.FILL_AND_OUTLINE/);
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
