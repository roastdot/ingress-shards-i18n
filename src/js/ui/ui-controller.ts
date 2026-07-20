import type * as L from "leaflet";
import { IS_INITIAL_ROUTE_RENDER, IS_NAVIGATING_BACK, navigate, setViewDispatchers } from "../router.js";
import { getSeriesLayer, getDetailsPanelContent as getSeriesDetailsContent, setupMarkerHover, getSeriesControl, initSeriesLayers, getLocalizedSeriesName } from "./series-renderer.js";
import { getSiteLayers, getDetailsPanelContent as getSiteDetailsContent, updateAllPolylineStyles, setActiveSiteLayer, getSiteControl } from "./site-renderer.js";
import { updateDetailsPanel } from "./react/detailsPanelStore.js";
import { handleCustomFile, getDetailsPanelContent as getCustomDetailsContent } from "./custom-file-handler.js";
import { getDefaultSeriesId, getSeriesMetadata, getSeriesGeocode, getSeriesResult } from "../data/data-store.js";
import { CUSTOM_SERIES_ID } from "../constants.js";
import { t } from "../i18n/index.js";
import { updateSeasonScore } from "./react/seasonScoreStore.js";
import { restartShardMotionAfterMapMove } from "./map/shard-motion.js";

let IS_MAP_INTERACTION_ACTIVE = false;

let map: L.Map | null = null;
let waveControlPanel: L.Control.Layers | null = null;
let isOrnamentVisible = false;

interface MapLayer extends L.Layer {
    _layerType?: string;
    _seriesId?: string;
    _siteId?: string;
    _waveId?: string;
    startShardMotion?: () => void;
}

const mapDispatchers = {
    displaySeriesDetails: (seriesId: string) => {
        if (!map) return;
        updateSeasonScoreBanner(seriesId);
        cleanupLayers({ seriesId });

        const seriesLayer = getSeriesLayer(seriesId);
        if (seriesLayer && !map.hasLayer(seriesLayer)) {
            map.addLayer(seriesLayer);
        }

        const metadata = getSeriesMetadata(seriesId);
        document.title = t('ui.title_series', { name: getLocalizedSeriesName(seriesId, metadata?.name) });

        let detailsPanelContent = getSeriesDetailsContent(seriesId);
        if (seriesId === CUSTOM_SERIES_ID) {
            const customDetailsContent = getCustomDetailsContent();
            detailsPanelContent = {
                title: customDetailsContent.title,
                content: customDetailsContent.content + "<br />" + detailsPanelContent.content,
                footer: detailsPanelContent.footer,
                flagHtml: detailsPanelContent.flagHtml,
            };
        }
        updateDetailsPanel(detailsPanelContent);

        setupMarkerHover(seriesLayer);

        const flyAction = () => { map!.flyTo([0, 0], 2, { duration: 1 }); }
        const viewAction = () => { map!.setView([0, 0], 2, { duration: 0 }); }
        performMapMoveAction(flyAction, viewAction);
    },
    displaySiteDetails: (seriesId: string, siteNavigationId: string) => {
        if (!map) return;
        updateSeasonScoreBanner(seriesId);
        const siteId = seriesId + "-" + siteNavigationId;
        cleanupLayers({ siteId });

        const siteLayers = getSiteLayers(seriesId, siteId);
        if (!siteLayers) return;

        const defaultLayerDetails = siteLayers.find(l => l.id === "all");
        if (defaultLayerDetails) {
            map.addLayer(defaultLayerDetails.layer);
            setActiveSiteLayer(defaultLayerDetails.layer);
        }

        const ornamentLayerDetails = siteLayers.find(l => l.id === "ornaments");
        if (ornamentLayerDetails && (isOrnamentVisible || ornamentLayerDetails.showByDefault)) {
            map.addLayer(ornamentLayerDetails.layer);
        }

        if (siteLayers.length > 0) {
            waveControlPanel = getSiteControl(siteId);
            if (waveControlPanel) {
                map.addControl(waveControlPanel);
                const controlContainer = waveControlPanel.getContainer();
                controlContainer?.classList.add('ingress-wave-control');
            }
        }

        const seriesMetadata = getSeriesMetadata(seriesId);
        const seriesName = seriesMetadata?.name;
        const siteGeocode = getSeriesGeocode(seriesId)?.sites?.[siteId];
        const siteName = siteGeocode?.name;
        document.title = t('ui.title_site', { name: seriesName, site: siteName });
        updateDetailsPanel(getSiteDetailsContent(seriesId, siteId));

        // Calculate bounds accurately: merge shards (all) and ornaments if present
        let siteBounds: L.LatLngBounds | null = null;
        if (defaultLayerDetails && (defaultLayerDetails.layer as L.FeatureGroup).getLayers().length > 0) {
            siteBounds = (defaultLayerDetails.layer as L.FeatureGroup).getBounds();
        }
        if (ornamentLayerDetails && map.hasLayer(ornamentLayerDetails.layer)) {
            const oBounds = (ornamentLayerDetails.layer as L.FeatureGroup).getBounds();
            if (oBounds.isValid()) {
                siteBounds = siteBounds ? siteBounds.extend(oBounds) : oBounds;
            }
        }

        if (siteBounds && siteBounds.isValid()) {
            const flyAction = () => { map!.flyToBounds(siteBounds!, { duration: 1 }); }
            const viewAction = () => { (map!.fitBounds as (bounds: L.LatLngBounds, extraArg: number, options: L.FitBoundsOptions) => void)(siteBounds!, 2, { duration: 0 }); }
            restartShardMotionAfterMapMove(map, () => performMapMoveAction(flyAction, viewAction));
        }
    },
    displayWaveDetails: (seriesId: string, siteNavigationId: string, waveId: string) => {
        if (!map) return;
        updateSeasonScoreBanner(seriesId);

        const siteId = seriesId + "-" + siteNavigationId;
        cleanupLayers({ siteId, waveId });

        const siteLayers = getSiteLayers(seriesId, siteId);
        if (!siteLayers) return;

        const waveLayerDetails = siteLayers.find(l => l.id === waveId);
        if (waveLayerDetails) {
            map.addLayer(waveLayerDetails.layer);
            setActiveSiteLayer(waveLayerDetails.layer);
        }

        const ornamentLayerDetails = siteLayers.find(l => l.id === "ornaments");
        if (ornamentLayerDetails && (isOrnamentVisible || ornamentLayerDetails.showByDefault)) {
            map.addLayer(ornamentLayerDetails.layer);
        }

        if (siteLayers.length > 1) {
            waveControlPanel = getSiteControl(siteId);
            if (waveControlPanel) {
                map.addControl(waveControlPanel);
                const controlContainer = waveControlPanel.getContainer();
                controlContainer?.classList.add('ingress-wave-control');
            }
        }

        const seriesMetadata = getSeriesMetadata(seriesId);
        const seriesName = seriesMetadata?.name;
        const siteGeocode = getSeriesGeocode(seriesId)?.sites?.[siteId];
        const siteName = siteGeocode?.name;
        document.title = t('ui.title_site', { name: seriesName, site: siteName });
        updateDetailsPanel(getSiteDetailsContent(seriesId, siteId, waveId));

        let siteBounds: L.LatLngBounds | null = null;
        if (waveLayerDetails && (waveLayerDetails.layer as L.FeatureGroup).getLayers().length > 0) {
            siteBounds = (waveLayerDetails.layer as L.FeatureGroup).getBounds();
        }
        if (ornamentLayerDetails && map.hasLayer(ornamentLayerDetails.layer)) {
            const oBounds = (ornamentLayerDetails.layer as L.FeatureGroup).getBounds();
            if (oBounds.isValid()) {
                siteBounds = siteBounds ? siteBounds.extend(oBounds) : oBounds;
            }
        }

        if (siteBounds && siteBounds.isValid()) {
            const flyAction = () => { map!.flyToBounds(siteBounds!, { duration: 1 }); }
            const viewAction = () => { (map!.fitBounds as (bounds: L.LatLngBounds, extraArg: number, options: L.FitBoundsOptions) => void)(siteBounds!, 2, { duration: 0 }); }
            restartShardMotionAfterMapMove(map, () => performMapMoveAction(flyAction, viewAction));
        }
    },
    showDefaultView: () => {
        const defaultSeriesId = getDefaultSeriesId();
        if (defaultSeriesId) navigate(`#/${defaultSeriesId}`);
    },
};

function updateSeasonScoreBanner(seriesId: string): void {
    const result = getSeriesResult(seriesId);
    const metadata = getSeriesMetadata(seriesId);
    updateSeasonScore(result && metadata
        ? { seriesName: metadata.name, displayScore: result.displayScore, sourceUrl: result.source.url }
        : null);
}

export function initController(mapInstance: L.Map): void {
    map = mapInstance;

    initSeriesLayers();
    const seriesControlPanel = getSeriesControl();
    map.addControl(seriesControlPanel);
    const controlContainer = seriesControlPanel.getContainer();
    controlContainer?.classList.add('ingress-series-control');
    controlContainer?.setAttribute('tabindex', '-1');

    setViewDispatchers(mapDispatchers);
    setupEventListeners(map);
}

function setupEventListeners(map: L.Map): void {
    map.on('zoomend', () => { updateAllPolylineStyles(map); });
    map.on('moveend', () => { updateAllPolylineStyles(map); });
    map.on('baselayerchange', (event: L.LayersControlEvent) => {
        const layer = event.layer as MapLayer;
        switch (layer._layerType) {
            case 'series':
                navigate(`#/${layer._seriesId}`);
                break;
            case 'site':
                navigate(`#/${layer._seriesId}/${layer._siteId}`);
                break;
            case 'wave':
                navigate(`#/${layer._seriesId}/${layer._siteId}/${layer._waveId}`);
                break;
        }
    });
    map.on('overlayadd', (event: L.LayersControlEvent) => {
        if ((event.layer as MapLayer)._layerType === 'site-overlay') {
            isOrnamentVisible = true;
        }
    });
    map.on('overlayremove', (event: L.LayersControlEvent) => {
        if ((event.layer as MapLayer)._layerType === 'site-overlay') {
            isOrnamentVisible = false;
        }
    });

    map.on('movestart', function () {
        IS_MAP_INTERACTION_ACTIVE = true;
    });

    map.on('moveend', function () {
        setTimeout(() => {
            IS_MAP_INTERACTION_ACTIVE = false;
        }, 1000);
    });

    document.addEventListener('click', (e: MouseEvent) => {
        const target = (e.target as HTMLElement).closest<HTMLElement>('.nav-item');
        if (target && target.dataset.route) {
            e.preventDefault();
            e.stopPropagation();

            navigate(target.dataset.route);
        }
    });

    document.addEventListener('click', (e: MouseEvent) => {
        const target = (e.target as HTMLElement).closest<HTMLElement>('tr');
        if (target &&
            target.closest('table.ingress-event-scores') &&
            target.dataset.seriesId &&
            target.dataset.siteId) {
            e.preventDefault();
            e.stopPropagation();

            const { seriesId, siteId, waveId } = target.dataset;
            // If waveId exists (tbody row), navigate to specific wave, otherwise navigate to all waves (thead/tfoot)
            const url = waveId ? `#/${seriesId}/${siteId}/${waveId}` : `#/${seriesId}/${siteId}`;
            navigate(url);
        }
    });

    document.addEventListener('change', (e: Event) => {
        const target = (e.target as HTMLElement).closest(`#${CUSTOM_SERIES_ID}-file-input`);
        if (target) {
            e.preventDefault();
            e.stopPropagation();

            handleCustomFile(e);
        }
    });
}

function cleanupLayers(target: { seriesId?: string; siteId?: string; waveId?: string }): void {
    if (!map) return;
    map.eachLayer(layer => {
        const mapLayer = layer as MapLayer;
        switch (mapLayer._layerType) {
            case 'series':
                if (!target.seriesId || mapLayer._seriesId !== target.seriesId) {
                    map!.removeLayer(layer);
                }
                break;
            case 'site':
                if (!target.siteId || mapLayer._siteId !== target.siteId) {
                    map!.removeLayer(layer);
                }
                break;
            case 'wave':
                if (!target.siteId || mapLayer._waveId !== target.waveId) {
                    map!.removeLayer(layer);
                }
                break;
            case 'site-overlay':
                if (!target.siteId || mapLayer._siteId !== target.siteId) {
                    map!.removeLayer(layer);
                }
                break;
        }
    });
    if (waveControlPanel) {
        map.removeControl(waveControlPanel);
    }
    waveControlPanel = null;
    setActiveSiteLayer(null);
}

function performMapMoveAction(flyAction: () => void, viewAction: () => void): void {
    const isSwipeBackGesture = IS_NAVIGATING_BACK && IS_MAP_INTERACTION_ACTIVE;
    // During initial route restoration, viewport sizing and min-zoom work can
    // interrupt Leaflet's fly animation and leave the camera at the default
    // world view. Set the restored route synchronously; animate later actions.
    const shouldAnimate = !IS_INITIAL_ROUTE_RENDER && !isSwipeBackGesture;

    const viewMethod = shouldAnimate ? flyAction : viewAction;
    viewMethod();
}
