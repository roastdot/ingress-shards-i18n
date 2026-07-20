import * as L from "leaflet";
import "leaflet-providers";
import "leaflet.motion";
import "leaflet-relief";
import { IS_TOUCH_SUPPORTED } from "../event-handler.js";
import { decodeElevation, getTileElevationGrid, hsvToRgb, computeHillshadeIntensity } from "./elevation.js";
import { getColorMode, subscribeColorMode } from "../react/colorModeStore.js";
import { t } from "../../i18n/index.js";

// leaflet-providers has no type declarations of its own — `.provider(...)` is
// a runtime augmentation of L.tileLayer.
const tileLayerProvider = (L.tileLayer as unknown as { provider: (name: string) => L.TileLayer }).provider;
const CONFIGURED_MIN_ZOOM = 2;
const WEB_MERCATOR_TILE_SIZE = 256;
const WEB_MERCATOR_MAX_LATITUDE = 85.05112878;
// Leaflet has no latitude-only maxBounds option. A deliberately broad finite
// longitude range preserves practical horizontal world wrapping while still
// allowing maxBounds to constrain the non-wrapping vertical axis.
const VERTICAL_WORLD_BOUNDS: L.LatLngBoundsExpression = [
    [-WEB_MERCATOR_MAX_LATITUDE, -1_000_000_000],
    [WEB_MERCATOR_MAX_LATITUDE, 1_000_000_000],
];

export function initMap(): L.Map {
    const map = L.map("map", {
        worldCopyJump: true,
        minZoom: CONFIGURED_MIN_ZOOM,
        doubleClickZoom: !IS_TOUCH_SUPPORTED,
        maxBounds: VERTICAL_WORLD_BOUNDS,
        maxBoundsViscosity: 1,
    }).setView([0, 0], 2);

    // The React details panel owns the bottom-right corner. Keep Leaflet's
    // attribution visible in the opposite corner instead of allowing the two
    // independently positioned overlays to cover each other.
    map.attributionControl.setPosition('bottomleft');
    map.attributionControl.addAttribution(
        `<span class="project-credits"><a href="https://github.com/ingress-shards/ingress-shards.github.io" target="_blank" rel="noreferrer">${t('credits.based_on_original')} Ingress Shards Map</a>` +
        ` · ♥ <a href="https://github.com/Yeggstry" target="_blank" rel="noreferrer">${t('credits.thanks_yeggstry')}</a>` +
        ` · ♥ <a href="https://github.com/neon-ninja" target="_blank" rel="noreferrer">${t('credits.thanks_nick_young')}</a></span>`,
    );

    createCustomPanes(map);
    keepMapSizedToViewport(map);

    const lightThemeLayer = tileLayerProvider("CartoDB.Positron");
    const darkThemeLayer = tileLayerProvider("CartoDB.DarkMatter");
    const baseMaps: Record<string, L.Layer> = {
        OSM: tileLayerProvider("OpenStreetMap.Mapnik"),
        "CartoDB Positron": lightThemeLayer,
        "CartoDB Dark Matter": darkThemeLayer,
        "ESRI WorldImagery": tileLayerProvider("Esri.WorldImagery"),
        "ESRI WorldTopoMap": tileLayerProvider('Esri.WorldTopoMap'),
        "Google Hybrid": L.tileLayer("https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}", {
            maxZoom: 20,
            subdomains: ["mt0", "mt1", "mt2", "mt3"],
        }),
    };

    const setThemeBaseLayer = () => {
        // Read the actual layer state instead of maintaining a parallel flag:
        // Leaflet can change base layers without keeping that flag in sync.
        const usesThemeBase = map.hasLayer(lightThemeLayer) || map.hasLayer(darkThemeLayer);
        if (!usesThemeBase) return;
        const nextLayer = getColorMode() === 'light' ? lightThemeLayer : darkThemeLayer;
        const previousLayer = nextLayer === lightThemeLayer ? darkThemeLayer : lightThemeLayer;
        if (map.hasLayer(previousLayer)) map.removeLayer(previousLayer);
        if (!map.hasLayer(nextLayer)) nextLayer.addTo(map);
    };
    (getColorMode() === 'light' ? lightThemeLayer : darkThemeLayer).addTo(map);
    subscribeColorMode(setThemeBaseLayer);

    let currentMin = 0, currentMax = 1000;

    // --- Dynamic Elevation Legend ---
    const ElevationLegend = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: function (this: any) {
            this._div = L.DomUtil.create('div', 'elevation-legend');
            this._div.style.background = 'rgba(255, 255, 255, 0.9)';
            this._div.style.border = '1px solid #ccc';
            this._div.style.borderRadius = '2px';
            this._div.style.fontSize = '12px';
            this._div.style.fontFamily = 'monospace';
            this._div.style.fontWeight = 'bold';
            this._div.style.marginTop = '10px';
            this._div.style.width = '75px';
            // Start visible if the layer is on, otherwise hidden until data confirms visibility
            this._div.style.display = 'none';
            this.update(currentMin, currentMax);
            return this._div;
        },
        update: function (this: any, min: number, max: number) {
            const steps = 19;
            let html = '';
            for (let i = steps; i >= 0; i--) {
                const ratio = i / steps;
                const val = min + ratio * (max - min);
                const hue = 210 - ratio * 180;
                const rgb = hsvToRgb(hue, 1, 1);

                html += `
                    <div style="background: rgb(${rgb[0]},${rgb[1]},${rgb[2]}); color: #000; text-align: center; white-space: nowrap; overflow: hidden; padding: 1px 0;">
                        ${val.toFixed(0)} m
                    </div>`;
            }
            this._div.innerHTML = html;
        },
        show: function (this: any) { this._div.style.display = 'block'; },
        hide: function (this: any) { this._div.style.display = 'none'; }
    });
    const legend: any = new (ElevationLegend as any)();

    // --- Relief Layer Customization ---
    // Typed loosely (`any`) below: this hooks into leaflet-relief's internal,
    // undocumented tile cache/hillshade APIs, which aren't part of its public types.
    const reliefLayer: any = (L as any).gridLayer.relief({
        mode: 'hillshade',
        opacity: 0,
        maxNativeZoom: 15,
        minNativeZoom: 6,
        maxZoom: 20,
        minZoom: 6,
        elevationExtractor: decodeElevation
    });

    reliefLayer._createHillshadeColor = function (t: number[]) {
        const h = t[4];
        const intensity = computeHillshadeIntensity(t, this._state);
        // CRITICAL SCALE PARITY: Ensure divisor matches legend exactly
        const span = (currentMax - currentMin) || 1;
        const ratio = Math.max(0, Math.min(1, (h - currentMin) / span));
        const hue = 210 - ratio * 180;
        const [r, g, b] = hsvToRgb(hue, 1, 1);
        return [Math.round(r * intensity), Math.round(g * intensity), Math.round(b * intensity), 255];
    };

    const tileRangeCache = new Map<string, { grid: Float32Array; points: L.LatLng[] }>();
    const sampleCtx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;

    let updateTimer: ReturnType<typeof setTimeout> | null = null;
    const updateViewRange = (force = false) => {
        if (updateTimer) clearTimeout(updateTimer);
        const delay = force ? 10 : 100;

        updateTimer = setTimeout(() => {
            const viewBounds = map.getBounds();

            let allTilesReady = true;
            let activeTileCount = 0;
            for (const key in reliefLayer._tiles) {
                const tileObj = reliefLayer._tiles[key];
                if (!tileObj.active) continue;
                activeTileCount++;
                if (!tileRangeCache.has(key)) {
                    allTilesReady = false;
                    break;
                }
            }

            // Ensure we only proceed if we have data, unless it's a force update where we might be waiting for first tiles
            if (!force && (!allTilesReady || activeTileCount === 0)) return;

            let min = 100000, max = -100000, found = false;
            for (const key in reliefLayer._tiles) {
                const tileObj = reliefLayer._tiles[key];
                if (!tileObj.active) continue;

                const cachedData = tileRangeCache.get(key);
                if (!cachedData) continue;

                const { grid, points } = cachedData;
                for (let i = 0; i < grid.length; i++) {
                    const h = grid[i];
                    if (h === -99999) continue;
                    if (viewBounds.contains(points[i])) {
                        if (h < -10) continue;
                        if (h < min) min = h;
                        if (h > max) max = h;
                        found = true;
                    }
                }
            }

            // Always attempt to show legend/layer if force or found
            if (map.hasLayer(reliefLayer)) {
                if (found) {
                    const currentSpan = currentMax - currentMin;
                    const threshold = Math.max(10, currentSpan * 0.1);
                    const significantShift = Math.abs(min - currentMin) > threshold || Math.abs(max - currentMax) > threshold || force;

                    if (significantShift) {
                        currentMin = min;
                        currentMax = max;
                        legend.update(min, max);
                        reliefLayer.redraw();
                    } else if (force) {
                        legend.update(currentMin, currentMax);
                        reliefLayer.redraw();
                    }
                    reliefLayer.setOpacity(0.6);
                    legend.show();
                } else if (force) {
                    // Even if no terrain points found yet (tiles loading), reveal the legend if forced
                    reliefLayer.setOpacity(0.6);
                    legend.show();
                }
            }
        }, delay);
    };

    reliefLayer.on('tileload', (event: L.TileEvent) => {
        const url = L.Util.template('https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png', event.coords as any);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const grid = getTileElevationGrid(img, sampleCtx);
            if (grid) {
                const { z, x, y } = event.coords;
                const points: L.LatLng[] = [];
                for (let i = 0; i < 256; i++) {
                    const px = (i % 16) * 16 + 8;
                    const py = Math.floor(i / 16) * 16 + 8;
                    const worldX = x * 256 + px;
                    const worldY = y * 256 + py;
                    points.push(map.unproject([worldX, worldY], z));
                }
                const key = reliefLayer._tileCoordsToKey(event.coords);
                tileRangeCache.set(key, { grid, points });
                updateViewRange();
            }
        };
        img.src = url;
    });

    map.on('overlayadd', (e: L.LayersControlEvent) => {
        if (e.layer === reliefLayer) {
            legend.addTo(map);
            // Use a short delay to ensure layer state is settled
            setTimeout(() => updateViewRange(true), 50);
        }
    });

    map.on('overlayremove', (e: L.LayersControlEvent) => {
        if (e.layer === reliefLayer) {
            legend.remove();
        }
    });

    map.on('movestart zoomstart', () => {
        if (map.hasLayer(reliefLayer)) {
            reliefLayer.setOpacity(0);
            legend.hide();
        }
    });

    map.on('moveend zoomend', () => updateViewRange());

    const overlays = { [t('map.elevation')]: reliefLayer };
    L.control.layers(baseMaps, overlays, { position: "topleft" }).addTo(map);
    map.addControl(createView3DToggle(map));

    return map;
}

function createView3DToggle(map: L.Map): L.Control {
    const View3DToggle = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: () => {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            const button = L.DomUtil.create('a', 'map-view-toggle-button', container);
            button.href = '#';
            button.textContent = '3D';
            button.title = t('map.view_3d');
            button.setAttribute('role', 'button');
            button.setAttribute('aria-label', t('map.view_3d'));
            L.DomEvent.on(button, 'click', async (event: Event) => {
                L.DomEvent.preventDefault(event);
                L.DomEvent.stopPropagation(event);
                if (button.getAttribute('aria-busy') === 'true') return;
                button.setAttribute('aria-busy', 'true');
                button.title = t('map.view_3d');
                button.setAttribute('aria-label', t('map.view_3d'));
                // Lazily loaded so CesiumJS stays out of the main bundle
                // until someone actually opens the 3D view.
                try {
                    const { show3DView } = await import('./map-3d.js');
                    show3DView(map);
                } catch (error) {
                    console.error('Unable to load the 3D map', error);
                    button.title = t('map.view_3d_error');
                    button.setAttribute('aria-label', t('map.view_3d_error'));
                } finally {
                    button.removeAttribute('aria-busy');
                }
            });
            return container;
        },
    });
    return new View3DToggle();
}

function keepMapSizedToViewport(map: L.Map): void {
    const container = map.getContainer();
    let animationFrame: number | null = null;

    const refreshSize = () => {
        if (animationFrame !== null) cancelAnimationFrame(animationFrame);
        animationFrame = requestAnimationFrame(() => {
            animationFrame = null;
            map.invalidateSize({ pan: false, debounceMoveend: true });

            // Web Mercator wraps horizontally but not vertically. On a tall
            // viewport, a fixed low minimum zoom can make the projected world
            // shorter than the map, exposing empty bands beyond both poles.
            const requiredWorldScale = (container.clientHeight + 1) / WEB_MERCATOR_TILE_SIZE;
            const viewportMinZoom = Math.max(CONFIGURED_MIN_ZOOM, Math.ceil(Math.log2(requiredWorldScale)));
            map.setMinZoom(viewportMinZoom);
            if (map.getZoom() < viewportMinZoom) map.setZoom(viewportMinZoom);
            map.panInsideBounds(VERTICAL_WORLD_BOUNDS, { animate: false });
        });
    };

    // Leaflet measures its container only during initialisation and ordinary
    // window resize events. Dynamic/mobile viewports and embedded browsers can
    // change the rendered container without producing the size Leaflet expects.
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(refreshSize).observe(container);
    }
    window.visualViewport?.addEventListener('resize', refreshSize);
    window.addEventListener('orientationchange', refreshSize);
    requestAnimationFrame(refreshSize);
}

function createCustomPanes(map: L.Map): void {
    map.createPane('ornamentPane');
    map.getPane('ornamentPane')!.style.zIndex = '350';
    map.getPane('ornamentPane')!.style.pointerEvents = 'none';

    map.createPane('ornamentFrontPane');
    map.getPane('ornamentFrontPane')!.style.zIndex = '625';
    map.getPane('ornamentFrontPane')!.style.pointerEvents = 'none';

    map.createPane('targetPane');
    map.getPane('targetPane')!.style.zIndex = '630';
    map.getPane('targetPane')!.style.pointerEvents = 'none';

    map.createPane('shardPane');
    map.getPane('shardPane')!.style.zIndex = '640';
    map.getPane('shardPane')!.style.pointerEvents = 'none';
}
