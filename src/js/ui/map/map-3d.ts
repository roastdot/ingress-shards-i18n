import * as L from "leaflet";
import {
    ArcType,
    BoundingSphere,
    Cartesian2,
    Cartesian3,
    Cartographic,
    Color,
    ConstantProperty,
    ConstantPositionProperty,
    CallbackProperty,
    createWorldTerrainAsync,
    DistanceDisplayCondition,
    Ellipsoid,
    EllipsoidTerrainProvider,
    Entity,
    HeightReference,
    HeadingPitchRange,
    HorizontalOrigin,
    ImageMaterialProperty,
    Ion,
    Math as CesiumMath,
    Matrix4,
    NearFarScalar,
    Rectangle,
    sampleTerrainMostDetailed,
    ScreenSpaceEventHandler,
    ScreenSpaceEventType,
    UrlTemplateImageryProvider,
    VerticalOrigin,
    Viewer,
    type TerrainProvider,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { getColorMode, subscribeColorMode } from "../react/colorModeStore.js";
import { t } from "../../i18n/index.js";
import { getAllSeriesIds, getSeriesMetadata } from "../../data/data-store.js";
import { navigate } from "../../router.js";
import { getSiteLayers } from "../site-renderer.js";
import {
    getLinkArcOffsetMeters,
    PORTAL_CONTROL_RADIUS_METERS,
    getSeriesGlobeCenter,
    getTerrainRingCoordinates,
    interpolateLongitude,
} from "./map-3d-geometry.js";
import shardIconUrl from "../../../images/abaddon1_shard.png";
import { set3DViewRequested } from "./map-view-state.js";
import {
    resolveTerrainProvider,
    sampleRoutesTerrain,
    type GroundedTerrainRoutePoint,
    type TerrainRoutePoint,
} from "./map-3d-terrain.js";
import {
    SHARD_MODEL_GROUND_OFFSET_METERS,
    SHARD_MODEL_SCALE,
    SHARD_MODEL_URI,
} from "./map-3d-shard-model.js";

const PATH_SAMPLE_INTERVAL_METERS = 75;
const MIN_SAMPLES_PER_SEGMENT = 24;
const MAX_SAMPLES_PER_SEGMENT = 48;
const SHARD_ANIMATION_START_DELAY_MS = 1100;
const SHARD_LOGO_SIZE_PIXELS = 14;
const SHARD_LOGO_MIN_DISTANCE_METERS = 900;
const TARGET_SIZE_METERS = 32;
const TARGET_TERRAIN_OFFSET_METERS = 1.5;
const PORTAL_HIT_SIZE_PIXELS = 30;
const SERIES_GLOBE_CAMERA_HEIGHT_METERS = 12_000_000;

interface MotionPolyline extends L.Polyline {
    motionStart?: () => void;
    _linePoints?: L.LatLng[];
    motionOptions?: { duration?: number };
}

interface MirrorMarker extends L.Marker {
    _siteId?: string;
    _map3dImageUrl?: string;
    _map3dAccentColor?: string;
    _map3dLabel?: string;
    _map3dNavigate?: boolean;
    _map3dBadge?: string;
    _map3dWinnerImageUrl?: string;
}

type RoutePoint = TerrainRoutePoint;

interface ShardAnimation {
    points: RoutePoint[];
    cumulative: number[];
    totalDistance: number;
    duration: number;
}

interface GroundedShardAnimation extends Omit<ShardAnimation, "points"> {
    points: GroundedTerrainRoutePoint[];
}

function createImageryProvider(mode: "light" | "dark"): UrlTemplateImageryProvider {
    const variant = mode === "light" ? "light_all" : "dark_all";
    const retina = window.devicePixelRatio > 1 ? "@2x" : "";
    return new UrlTemplateImageryProvider({
        url: `https://{s}.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}${retina}.png`,
        subdomains: ["a", "b", "c", "d"],
        maximumLevel: 20,
        credit: "© OpenStreetMap contributors © CARTO",
    });
}

class View3D {
    private readonly leafletMap: L.Map;
    private readonly container: HTMLDivElement;
    private readonly overviewTerrainProvider = new EllipsoidTerrainProvider();
    private siteTerrainProvider: TerrainProvider = this.overviewTerrainProvider;
    private readonly siteTerrainProviderReady: Promise<TerrainProvider>;
    private viewer: Viewer | null = null;
    private clickHandler: ScreenSpaceEventHandler | null = null;
    private exitControl: HTMLDivElement | null = null;
    private controlHost: HTMLDivElement | null = null;
    private seasonToggle: HTMLButtonElement | null = null;
    private seasonMenu: HTMLDivElement | null = null;
    private readonly seasonButtons = new Map<string, HTMLButtonElement>();
    private waveControl: HTMLDivElement | null = null;
    private waveMenu: HTMLDivElement | null = null;
    private waveToggle: HTMLButtonElement | null = null;
    private currentWaveSiteKey = "";
    private popup: HTMLDivElement | null = null;
    private readonly popupHtmlByEntityId = new Map<string, string>();
    private readonly clickActionByEntityId = new Map<string, () => void>();
    private motionShardEntities: Entity[] = [];
    private shardAnimationFrame: number | null = null;
    private shardAnimationTimer: ReturnType<typeof setTimeout> | null = null;
    private remirrorTimer: ReturnType<typeof setTimeout> | null = null;
    private mirrorGeneration = 0;
    private seriesOverviewActive = false;
    private active = false;
    private nextEntityId = 0;
    private readonly handleLeafletLayerChange = () => this.scheduleRemirror();
    private readonly handleLeafletMoveEnd = () => this.followLeafletCamera();

    constructor(leafletMap: L.Map) {
        this.leafletMap = leafletMap;
        this.container = document.createElement("div");
        this.container.id = "map3d";
        document.body.appendChild(this.container);
        this.siteTerrainProviderReady = resolveTerrainProvider<TerrainProvider>(__CESIUM_ION_TOKEN__, {
            configureToken: token => { Ion.defaultAccessToken = token; },
            createWorldTerrain: () => createWorldTerrainAsync({
                requestVertexNormals: true,
            }),
            createFallbackTerrain: () => this.overviewTerrainProvider,
            onError: error => console.warn("Unable to load Cesium World Terrain; using a flat globe", error),
        });
        void this.siteTerrainProviderReady.then(provider => {
            this.siteTerrainProvider = provider;
            if (!this.viewer || !this.active || this.seriesOverviewActive) return;
            this.viewer.terrainProvider = provider;
        });

        subscribeColorMode(() => {
            if (!this.viewer) return;
            this.replaceImagery();
        });
    }

    show(): void {
        if (this.active) return;
        this.active = true;
        this.leafletMap.getContainer().style.visibility = "hidden";
        this.container.classList.add("map3d-active");

        if (!this.viewer) this.createViewer();
        this.viewer?.resize();
        this.syncCameraFromLeaflet(false);
        void this.syncCameraFromLeafletTerrain(false);
        this.syncRouteControls();
        void this.mirrorLeafletLayers();

        this.leafletMap.on("layeradd layerremove", this.handleLeafletLayerChange);
        this.leafletMap.on("moveend", this.handleLeafletMoveEnd);
    }

    hide(): void {
        if (!this.active) return;
        this.active = false;
        this.stopShardAnimations();
        this.closePopup();
        this.leafletMap.off("layeradd layerremove", this.handleLeafletLayerChange);
        this.leafletMap.off("moveend", this.handleLeafletMoveEnd);
        this.syncLeafletFromCamera();
        this.container.classList.remove("map3d-active");
        this.leafletMap.getContainer().style.visibility = "";
        this.leafletMap.invalidateSize();
        set3DViewRequested(false);
    }

    private createViewer(): void {
        this.viewer = new Viewer(this.container, {
            baseLayer: false,
            terrainProvider: this.siteTerrainProvider,
            animation: false,
            timeline: false,
            baseLayerPicker: false,
            geocoder: false,
            homeButton: false,
            sceneModePicker: false,
            navigationHelpButton: false,
            fullscreenButton: false,
            infoBox: false,
            selectionIndicator: false,
            requestRenderMode: false,
        });
        this.replaceImagery();

        const scene = this.viewer.scene;
        scene.globe.depthTestAgainstTerrain = true;
        scene.globe.showGroundAtmosphere = true;
        scene.screenSpaceCameraController.minimumZoomDistance = 20;
        scene.backgroundColor = getColorMode() === "dark"
            ? Color.fromCssColorString("#070b12")
            : Color.fromCssColorString("#b8d8ef");

        this.createExitControl();
        this.createControlHost();
        this.clickHandler = new ScreenSpaceEventHandler(scene.canvas);
        this.clickHandler.setInputAction((movement: { position: Cartesian2 }) => {
            const picked = scene.pick(movement.position) as { id?: Entity } | undefined;
            const entity = picked?.id;
            const clickAction = entity ? this.clickActionByEntityId.get(entity.id) : undefined;
            if (clickAction) {
                clickAction();
                return;
            }
            const html = entity ? this.popupHtmlByEntityId.get(entity.id) : undefined;
            if (html) this.openPopup(movement.position, html);
            else this.closePopup();
        }, ScreenSpaceEventType.LEFT_CLICK);
        this.clickHandler.setInputAction((movement: { endPosition: Cartesian2 }) => {
            const picked = scene.pick(movement.endPosition) as { id?: Entity } | undefined;
            const entity = picked?.id;
            const interactive = Boolean(entity && (
                this.popupHtmlByEntityId.has(entity.id)
                || this.clickActionByEntityId.has(entity.id)
            ));
            scene.canvas.style.cursor = interactive ? "pointer" : "";
        }, ScreenSpaceEventType.MOUSE_MOVE);
    }

    private replaceImagery(): void {
        if (!this.viewer) return;
        this.viewer.imageryLayers.removeAll();
        this.viewer.imageryLayers.addImageryProvider(createImageryProvider(getColorMode()));
        this.viewer.scene.backgroundColor = getColorMode() === "dark"
            ? Color.fromCssColorString("#070b12")
            : Color.fromCssColorString("#b8d8ef");
    }

    private createExitControl(): void {
        this.exitControl = document.createElement("div");
        this.exitControl.className = "map-view-exit-ctrl";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "map-view-toggle-button";
        button.textContent = "2D";
        button.title = t("map.view_2d");
        button.setAttribute("aria-label", t("map.view_2d"));
        button.addEventListener("click", () => this.hide());
        this.exitControl.appendChild(button);
        this.container.appendChild(this.exitControl);
    }

    private createControlHost(): void {
        this.controlHost = document.createElement("div");
        this.controlHost.className = "map3d-leaflet-controls";
        this.seasonToggle = document.createElement("button");
        this.seasonToggle.type = "button";
        this.seasonToggle.className = "map3d-season-toggle";
        this.seasonToggle.title = t("map.select_series");
        this.seasonToggle.setAttribute("aria-label", t("map.select_series"));
        this.seasonToggle.setAttribute("aria-expanded", "false");
        this.seasonToggle.addEventListener("click", () => {
            this.waveControl?.classList.remove("is-open");
            this.waveToggle?.setAttribute("aria-expanded", "false");
            const open = this.controlHost?.classList.toggle("is-season-open") ?? false;
            this.seasonToggle?.setAttribute("aria-expanded", String(open));
        });
        this.seasonMenu = document.createElement("div");
        this.seasonMenu.className = "map3d-season-menu";
        this.seasonMenu.setAttribute("role", "radiogroup");
        this.seasonMenu.setAttribute("aria-label", t("map.select_series"));
        for (const seriesId of getAllSeriesIds()) {
            const metadata = getSeriesMetadata(seriesId);
            const option = document.createElement("button");
            option.type = "button";
            option.className = "map3d-season-option";
            option.setAttribute("role", "radio");
            option.setAttribute("aria-checked", "false");
            option.textContent = metadata?.year
                ? `${metadata.year} · ${metadata.name}`
                : metadata?.name ?? seriesId;
            option.addEventListener("click", () => {
                navigate(`#/${seriesId}`);
                this.controlHost?.classList.remove("is-season-open");
                this.seasonToggle?.setAttribute("aria-expanded", "false");
            });
            this.seasonButtons.set(seriesId, option);
            this.seasonMenu.appendChild(option);
        }
        this.controlHost.append(this.seasonToggle, this.seasonMenu);
        this.createWaveControl();
        this.container.appendChild(this.controlHost);
    }

    private createWaveControl(): void {
        if (!this.controlHost) return;
        this.waveControl = document.createElement("div");
        this.waveControl.className = "map3d-wave-control";
        this.waveToggle = document.createElement("button");
        this.waveToggle.type = "button";
        this.waveToggle.className = "map3d-wave-toggle";
        this.waveToggle.title = t("site.all_waves");
        this.waveToggle.setAttribute("aria-label", t("site.all_waves"));
        this.waveToggle.setAttribute("aria-expanded", "false");
        this.waveToggle.addEventListener("click", () => {
            this.controlHost?.classList.remove("is-season-open");
            this.seasonToggle?.setAttribute("aria-expanded", "false");
            const open = this.waveControl?.classList.toggle("is-open") ?? false;
            this.waveToggle?.setAttribute("aria-expanded", String(open));
        });
        this.waveMenu = document.createElement("div");
        this.waveMenu.className = "map3d-wave-menu";
        this.waveMenu.setAttribute("role", "radiogroup");
        this.waveMenu.setAttribute("aria-label", t("site.all_waves"));
        this.waveControl.append(this.waveToggle, this.waveMenu);
        this.controlHost.appendChild(this.waveControl);
    }

    private syncSeasonControl(): void {
        const seriesId = window.location.hash.split("/")[1];
        for (const [buttonSeriesId, button] of this.seasonButtons) {
            const active = buttonSeriesId === seriesId;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-checked", String(active));
        }
    }

    private syncWaveControl(): void {
        if (!this.waveControl || !this.waveMenu) return;
        const [, seriesId, siteNavigationId, waveId] = window.location.hash.split("/");
        if (!seriesId || !siteNavigationId) {
            this.waveControl.classList.remove("has-waves", "is-open");
            this.waveToggle?.setAttribute("aria-expanded", "false");
            this.currentWaveSiteKey = "";
            return;
        }
        const siteId = `${seriesId}-${siteNavigationId}`;
        const waveLayers = (getSiteLayers(seriesId, siteId) ?? []).filter(layer => (
            !layer.isOverlay && !layer.hideFromControl
        ));
        if (waveLayers.length < 2) {
            this.waveControl.classList.remove("has-waves", "is-open");
            this.waveToggle?.setAttribute("aria-expanded", "false");
            this.currentWaveSiteKey = "";
            return;
        }
        const routeKey = `${seriesId}/${siteNavigationId}`;
        if (this.currentWaveSiteKey !== routeKey) {
            this.currentWaveSiteKey = routeKey;
            this.waveMenu.replaceChildren();
            for (const waveLayer of waveLayers) {
                const option = document.createElement("button");
                option.type = "button";
                option.className = "map3d-wave-option";
                option.setAttribute("role", "radio");
                option.dataset.waveId = waveLayer.id;
                option.textContent = waveLayer.label;
                option.addEventListener("click", () => {
                    const suffix = waveLayer.id === "all" ? "" : `/${waveLayer.id}`;
                    navigate(`#/${seriesId}/${siteNavigationId}${suffix}`);
                    this.waveControl?.classList.remove("is-open");
                    this.waveToggle?.setAttribute("aria-expanded", "false");
                });
                this.waveMenu.appendChild(option);
            }
        }
        this.waveControl.classList.add("has-waves");
        const activeWaveId = waveId || "all";
        this.waveMenu.querySelectorAll<HTMLButtonElement>(".map3d-wave-option").forEach(button => {
            const active = button.dataset.waveId === activeWaveId;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-checked", String(active));
        });
    }

    private syncRouteControls(): void {
        this.syncSeasonControl();
        this.syncWaveControl();
    }

    private openPopup(position: Cartesian2, html: string): void {
        this.closePopup();
        const popup = document.createElement("div");
        popup.className = "map3d-popup";
        popup.style.left = `${position.x}px`;
        popup.style.top = `${position.y}px`;

        const close = document.createElement("button");
        close.type = "button";
        close.className = "map3d-popup-close";
        close.textContent = "×";
        close.setAttribute("aria-label", "Close");
        close.addEventListener("click", event => {
            event.stopPropagation();
            this.closePopup();
        });

        const content = document.createElement("div");
        content.innerHTML = html;
        popup.append(close, content);
        this.container.appendChild(popup);
        this.popup = popup;
    }

    private closePopup(): void {
        this.popup?.remove();
        this.popup = null;
    }

    private syncCameraFromLeaflet(animate: boolean, groundHeight = 0): void {
        if (!this.viewer) return;
        const center = this.leafletMap.getCenter();
        const height = leafletZoomToCameraHeight(
            this.leafletMap.getZoom(),
            center.lat,
            this.container.clientHeight,
        );
        const target = Cartesian3.fromDegrees(center.lng, center.lat, groundHeight);
        const offset = new HeadingPitchRange(
            0,
            this.leafletMap.getZoom() >= 8
                ? CesiumMath.toRadians(-50)
                : CesiumMath.toRadians(-90),
            height,
        );
        if (animate) {
            this.viewer.camera.flyToBoundingSphere(new BoundingSphere(target, 1), {
                duration: 1,
                offset,
                complete: () => this.viewer?.camera.lookAtTransform(Matrix4.IDENTITY),
            });
        } else {
            this.viewer.camera.lookAt(target, offset);
            this.viewer.camera.lookAtTransform(Matrix4.IDENTITY);
        }
    }

    private async syncCameraFromLeafletTerrain(animate: boolean): Promise<void> {
        const center = this.leafletMap.getCenter();
        const [route] = await this.groundRoutes([[
            { lng: center.lng, lat: center.lat, arcHeight: 0 },
        ]]);
        if (!this.viewer || !this.active || this.seriesOverviewActive) return;
        if (!this.leafletMap.getCenter().equals(center)) return;
        this.syncCameraFromLeaflet(animate, route[0]?.groundHeight ?? 0);
    }

    private syncLeafletFromCamera(): void {
        if (!this.viewer) return;
        const canvas = this.viewer.scene.canvas;
        const centerPixel = new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
        const ray = this.viewer.camera.getPickRay(centerPixel);
        const ground = ray ? this.viewer.scene.globe.pick(ray, this.viewer.scene) : undefined;
        const cartographic = ground
            ? this.viewer.scene.globe.ellipsoid.cartesianToCartographic(ground)
            : this.viewer.camera.positionCartographic;
        const lat = CesiumMath.toDegrees(cartographic.latitude);
        const lng = CesiumMath.toDegrees(cartographic.longitude);
        const height = Math.max(20, this.viewer.camera.positionCartographic.height);
        const zoom = cameraHeightToLeafletZoom(height, lat, this.container.clientHeight);
        this.leafletMap.setView([lat, lng], zoom, { animate: false } as L.ZoomPanOptions);
    }

    private followLeafletCamera(): void {
        if (this.active && !this.seriesOverviewActive) this.syncCameraFromLeaflet(true);
    }

    private scheduleRemirror(): void {
        if (!this.active) return;
        if (this.remirrorTimer) clearTimeout(this.remirrorTimer);
        this.remirrorTimer = setTimeout(() => {
            this.syncRouteControls();
            void this.mirrorLeafletLayers();
        }, 150);
    }

    private clearMirroredLayers(): void {
        this.mirrorGeneration++;
        this.stopShardAnimations();
        this.closePopup();
        this.popupHtmlByEntityId.clear();
        this.clickActionByEntityId.clear();
        this.viewer?.entities.removeAll();
    }

    private async mirrorLeafletLayers(): Promise<void> {
        if (!this.viewer || !this.active) return;
        this.clearMirroredLayers();
        const generation = this.mirrorGeneration;
        const links: Array<{ layer: L.Polyline; route: RoutePoint[] }> = [];
        const animations: ShardAnimation[] = [];
        const staticShards: Array<{ marker: L.Marker; route: RoutePoint[] }> = [];
        const seriesLocations: L.LatLng[] = [];

        this.leafletMap.eachLayer(layer => {
            if (layer instanceof L.Marker) {
                if ("showMarker" in layer.options) return;
                if (layer.options.pane === "shardPane") {
                    const position = layer.getLatLng();
                    staticShards.push({
                        marker: layer,
                        route: [{ lng: position.lng, lat: position.lat, arcHeight: 0 }],
                    });
                    return;
                }
                const entity = this.mirrorMarker(layer);
                if (entity && isSeriesMarker(layer)) seriesLocations.push(layer.getLatLng());
                return;
            }

            if (layer instanceof L.CircleMarker) {
                this.mirrorCircleMarker(layer);
                return;
            }

            if (layer instanceof L.Polyline) {
                const motionLayer = layer as MotionPolyline;
                if (typeof motionLayer.motionStart === "function") {
                    const animation = buildShardAnimation(motionLayer);
                    if (animation) animations.push(animation);
                    return;
                }
                const latLngs = flattenLatLngs(layer.getLatLngs());
                if (latLngs.length >= 2) links.push({ layer, route: sampleRoute(latLngs) });
            }
        });

        if (seriesLocations.length > 0) {
            this.seriesOverviewActive = true;
            this.viewer.terrainProvider = this.overviewTerrainProvider;
            this.showSeriesGlobe(seriesLocations);
        } else {
            this.seriesOverviewActive = false;
            this.viewer.terrainProvider = this.siteTerrainProvider;
        }

        const groundedRoutes = await this.groundRoutes([
            ...links.map(link => link.route),
            ...animations.map(animation => animation.points),
            ...staticShards.map(shard => shard.route),
        ]);
        if (!this.viewer || !this.active || generation !== this.mirrorGeneration) return;

        links.forEach((link, index) => this.mirrorPolyline(link.layer, groundedRoutes[index]));
        const groundedAnimations = animations.map((animation, index): GroundedShardAnimation => ({
            ...animation,
            points: groundedRoutes[links.length + index],
        }));
        const staticShardOffset = links.length + animations.length;
        staticShards.forEach((shard, index) => {
            const point = groundedRoutes[staticShardOffset + index][0];
            const entity = this.createShardEntity(
                point.lng,
                point.lat,
                point.groundHeight + point.arcHeight,
            );
            this.registerPopup(entity, getBoundPopupHtml(shard.marker));
        });
        this.startShardAnimations(groundedAnimations, generation);
    }

    private showSeriesGlobe(locations: L.LatLng[]): void {
        if (!this.viewer) return;
        const [lng, lat] = getSeriesGlobeCenter(locations);
        this.viewer.camera.setView({
            destination: Cartesian3.fromDegrees(lng, lat, SERIES_GLOBE_CAMERA_HEIGHT_METERS),
            orientation: {
                heading: 0,
                pitch: CesiumMath.toRadians(-90),
                roll: 0,
            },
        });
    }

    private mirrorMarker(marker: L.Marker): Entity | null {
        if (!this.viewer) return null;
        const icon = marker.options.icon;
        if (!icon) return null;
        const iconOptions = icon.options as L.DivIconOptions & L.IconOptions;
        const image = getMarkerImage(marker as MirrorMarker, iconOptions);
        if (!image) return null;
        const size = normalizePoint(iconOptions.iconSize) ?? [40, 40];
        const location = marker.getLatLng();
        const markerPosition = Cartesian3.fromDegrees(location.lng, location.lat);
        const terrainAligned = marker.options.pane === "targetPane";
        const seriesMarker = isSeriesMarker(marker);
        const seriesBadge = (marker as MirrorMarker)._map3dBadge ?? "";
        const seriesPin = seriesMarker
            ? createSeriesMarkerImage(
                image,
                (marker as MirrorMarker)._map3dAccentColor ?? "#a9b4c0",
                seriesBadge,
                (marker as MirrorMarker)._map3dWinnerImageUrl,
                (marker as MirrorMarker)._map3dLabel ?? "",
            )
            : null;
        const surfaceNormal = seriesMarker
            ? Ellipsoid.WGS84.geodeticSurfaceNormal(markerPosition, new Cartesian3())
            : undefined;
        const toCamera = new Cartesian3();
        const visibleOnCurrentHemisphere = seriesMarker
            ? new CallbackProperty(() => {
                if (!this.viewer || !surfaceNormal) return false;
                Cartesian3.subtract(this.viewer.camera.positionWC, markerPosition, toCamera);
                return Cartesian3.dot(surfaceNormal, toCamera) > 0;
            }, false)
            : undefined;
        let entity: Entity;

        if (terrainAligned) {
            const width = TARGET_SIZE_METERS;
            const height = width * size[1] / Math.max(1, size[0]);
            entity = this.viewer.entities.add({
                id: this.entityId("target"),
                rectangle: {
                    coordinates: rectangleAround(location.lng, location.lat, width, height),
                    material: new ImageMaterialProperty({
                        image,
                        transparent: true,
                        color: Color.WHITE.withAlpha(marker.options.opacity ?? 1),
                    }),
                    height: TARGET_TERRAIN_OFFSET_METERS,
                    heightReference: HeightReference.RELATIVE_TO_GROUND,
                },
            });
        } else {
            entity = this.viewer.entities.add({
                id: this.entityId("marker"),
                position: markerPosition,
                billboard: {
                    show: visibleOnCurrentHemisphere,
                    image: seriesPin?.initial ?? image,
                    width: seriesMarker ? seriesPin?.width : size[0],
                    height: seriesMarker ? seriesPin?.height : size[1],
                    color: Color.WHITE.withAlpha(marker.options.opacity ?? 1),
                    horizontalOrigin: HorizontalOrigin.CENTER,
                    verticalOrigin: seriesMarker ? VerticalOrigin.BOTTOM : VerticalOrigin.CENTER,
                    heightReference: HeightReference.CLAMP_TO_GROUND,
                    scaleByDistance: seriesMarker
                        ? new NearFarScalar(500_000, 1, 20_000_000, seriesBadge ? 0.58 : 0.9)
                        : undefined,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
            });
        }
        const canNavigate = seriesMarker && Boolean((marker as MirrorMarker)._map3dNavigate);
        this.registerPopup(
            entity,
            seriesMarker && !canNavigate ? getBoundTooltipHtml(marker) : getBoundPopupHtml(marker),
        );
        if (seriesMarker) {
            if (canNavigate) this.clickActionByEntityId.set(entity.id, () => marker.fire("click"));
            void seriesPin?.ready.then(imageUrl => {
                if (entity.billboard) entity.billboard.image = new ConstantProperty(imageUrl);
            });
        }
        return entity;
    }

    private mirrorCircleMarker(circle: L.CircleMarker): void {
        if (!this.viewer) return;
        const location = circle.getLatLng();
        const options = circle.options;
        const outline = colorFromCss(options.color ?? "#3388ff", options.opacity ?? 1);
        const entity = this.viewer.entities.add({
            id: this.entityId("portal"),
            position: Cartesian3.fromDegrees(location.lng, location.lat),
            point: {
                pixelSize: PORTAL_HIT_SIZE_PIXELS,
                color: Color.WHITE.withAlpha(0.01),
                heightReference: HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            polyline: {
                positions: getTerrainRingCoordinates(
                    location.lng,
                    location.lat,
                    PORTAL_CONTROL_RADIUS_METERS,
                ).map(point => Cartesian3.fromDegrees(point.lng, point.lat)),
                width: Math.max(2, options.weight ?? 3),
                material: outline,
                // Ground polylines only accept GEODESIC or RHUMB. NONE makes
                // Cesium stop the entire render loop while creating geometry.
                arcType: ArcType.GEODESIC,
                clampToGround: true,
            },
        });
        this.registerPopup(entity, getBoundPopupHtml(circle));
    }

    private mirrorPolyline(polyline: L.Polyline, route: GroundedTerrainRoutePoint[]): void {
        if (!this.viewer) return;
        const positions = route.map(point => Cartesian3.fromDegrees(
            point.lng,
            point.lat,
            point.groundHeight + point.arcHeight,
        ));
        const options = polyline.options;
        const color = colorFromCss(options.color ?? "#3388ff", options.opacity ?? 1);
        const entity = this.viewer.entities.add({
            id: this.entityId("link"),
            polyline: {
                positions,
                width: Math.max(2, options.weight ?? 3),
                // In 3D the height of the arc communicates the route type;
                // keeping Leaflet's dash pattern breaks that depth cue.
                material: color,
                arcType: ArcType.NONE,
                clampToGround: false,
            },
        });
        this.registerPopup(entity, getBoundPopupHtml(polyline));
    }

    private createShardEntity(lng: number, lat: number, absoluteHeight: number): Entity {
        if (!this.viewer) throw new Error("Cannot create a shard before the Cesium viewer exists");
        return this.viewer.entities.add({
            id: this.entityId("shard"),
            position: Cartesian3.fromDegrees(
                lng,
                lat,
                absoluteHeight + SHARD_MODEL_GROUND_OFFSET_METERS,
            ),
            model: {
                uri: SHARD_MODEL_URI,
                scale: SHARD_MODEL_SCALE,
                runAnimations: false,
            },
            billboard: {
                image: shardIconUrl,
                width: SHARD_LOGO_SIZE_PIXELS,
                height: SHARD_LOGO_SIZE_PIXELS,
                horizontalOrigin: HorizontalOrigin.CENTER,
                verticalOrigin: VerticalOrigin.CENTER,
                heightReference: HeightReference.NONE,
                distanceDisplayCondition: new DistanceDisplayCondition(
                    SHARD_LOGO_MIN_DISTANCE_METERS,
                    Number.POSITIVE_INFINITY,
                ),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
        });
    }

    private startShardAnimations(animations: GroundedShardAnimation[], generation: number): void {
        if (!this.viewer || animations.length === 0) return;
        this.motionShardEntities = animations.map(animation => {
            const first = animation.points[0];
            return this.createShardEntity(first.lng, first.lat, first.groundHeight + first.arcHeight);
        });

        this.shardAnimationTimer = setTimeout(() => {
            if (!this.viewer || !this.active) return;
            const startTime = performance.now();
            const tick = () => {
                const elapsed = performance.now() - startTime;
                let allDone = true;
                animations.forEach((animation, index) => {
                    const progress = animation.duration > 0
                        ? Math.min(1, elapsed / animation.duration)
                        : 1;
                    if (progress < 1) allDone = false;
                    const point = pointAlongPath(animation, progress);
                    const shardEntity = this.motionShardEntities[index];
                    if (progress >= 1) {
                        shardEntity.position = new ConstantPositionProperty(
                            Cartesian3.fromDegrees(
                                point.lng,
                                point.lat,
                                point.groundHeight + point.arcHeight + SHARD_MODEL_GROUND_OFFSET_METERS,
                            ),
                        );
                    } else {
                        shardEntity.position = new ConstantPositionProperty(
                            Cartesian3.fromDegrees(
                                point.lng,
                                point.lat,
                                point.groundHeight + point.arcHeight + SHARD_MODEL_GROUND_OFFSET_METERS,
                            ),
                        );
                    }
                });
                this.shardAnimationFrame = allDone ? null : requestAnimationFrame(tick);
            };
            tick();
        }, SHARD_ANIMATION_START_DELAY_MS);
    }

    private async groundRoutes(
        routes: ReadonlyArray<ReadonlyArray<RoutePoint>>,
    ): Promise<GroundedTerrainRoutePoint[][]> {
        if (routes.length === 0) return [];
        await this.siteTerrainProviderReady;
        const terrainProvider = this.siteTerrainProvider;
        if (terrainProvider === this.overviewTerrainProvider) {
            return sampleRoutesTerrain(routes, async () => []);
        }

        return sampleRoutesTerrain(
            routes,
            async locations => {
                const positions = locations.map(location => Cartographic.fromDegrees(
                    location.lng,
                    location.lat,
                ));
                const sampled = await sampleTerrainMostDetailed(terrainProvider, positions, true);
                return sampled.map(position => position.height);
            },
            error => {
                console.warn("Unable to sample Cesium World Terrain; using a flat globe", error);
                this.siteTerrainProvider = this.overviewTerrainProvider;
                if (this.viewer && !this.seriesOverviewActive) {
                    this.viewer.terrainProvider = this.overviewTerrainProvider;
                }
            },
        );
    }

    private stopShardAnimations(): void {
        if (this.shardAnimationTimer) clearTimeout(this.shardAnimationTimer);
        this.shardAnimationTimer = null;
        if (this.shardAnimationFrame !== null) cancelAnimationFrame(this.shardAnimationFrame);
        this.shardAnimationFrame = null;
        this.motionShardEntities = [];
    }

    private registerPopup(entity: Entity, html: string | null): void {
        if (html) this.popupHtmlByEntityId.set(entity.id, html);
    }

    private entityId(kind: string): string {
        return `map3d-${kind}-${this.nextEntityId++}`;
    }
}

function flattenLatLngs(latLngs: L.LatLngExpression[] | L.LatLngExpression[][] | L.LatLngExpression[][][]): L.LatLng[] {
    const flattened = (latLngs as unknown[]).flat(Infinity);
    const result: L.LatLng[] = [];
    for (let index = 0; index < flattened.length;) {
        const item = flattened[index];
        if (item instanceof L.LatLng) {
            result.push(item);
            index++;
        } else if (typeof item === "number" && typeof flattened[index + 1] === "number") {
            result.push(L.latLng(item, flattened[index + 1] as number));
            index += 2;
        } else {
            index++;
        }
    }
    return result;
}

function sampleRoute(latLngs: L.LatLng[]): RoutePoint[] {
    const points: RoutePoint[] = [{ lng: latLngs[0].lng, lat: latLngs[0].lat, arcHeight: 0 }];
    for (let index = 1; index < latLngs.length; index++) {
        const from = latLngs[index - 1];
        const to = latLngs[index];
        const distance = from.distanceTo(to);
        const segments = Math.min(
            MAX_SAMPLES_PER_SEGMENT,
            Math.max(MIN_SAMPLES_PER_SEGMENT, Math.ceil(distance / PATH_SAMPLE_INTERVAL_METERS)),
        );
        for (let step = 1; step <= segments; step++) {
            const progress = step / segments;
            points.push({
                lng: interpolateLongitude(from.lng, to.lng, progress),
                lat: from.lat + (to.lat - from.lat) * progress,
                arcHeight: getLinkArcOffsetMeters(progress, distance),
            });
        }
    }
    return points;
}

function buildShardAnimation(motionLayer: MotionPolyline): ShardAnimation | null {
    if (!motionLayer._linePoints || motionLayer._linePoints.length < 2) return null;
    const points = sampleRoute(motionLayer._linePoints);
    const cumulative = [0];
    for (let index = 1; index < points.length; index++) {
        cumulative.push(cumulative[index - 1] + L.latLng(points[index - 1].lat, points[index - 1].lng)
            .distanceTo(L.latLng(points[index].lat, points[index].lng)));
    }
    return {
        points,
        cumulative,
        totalDistance: cumulative[cumulative.length - 1],
        duration: motionLayer.motionOptions?.duration ?? (motionLayer._linePoints.length - 1) * 1000,
    };
}

function pointAlongPath(animation: GroundedShardAnimation, progress: number): GroundedTerrainRoutePoint {
    const { points, cumulative, totalDistance } = animation;
    if (progress <= 0 || totalDistance === 0) return points[0];
    if (progress >= 1) return points[points.length - 1];

    const targetDistance = progress * totalDistance;
    let segment = 1;
    while (segment < cumulative.length - 1 && cumulative[segment] < targetDistance) segment++;
    const segmentStart = cumulative[segment - 1];
    const segmentLength = cumulative[segment] - segmentStart || 1;
    const ratio = (targetDistance - segmentStart) / segmentLength;
    const from = points[segment - 1];
    const to = points[segment];
    return {
        lng: interpolateLongitude(from.lng, to.lng, ratio),
        lat: from.lat + (to.lat - from.lat) * ratio,
        arcHeight: from.arcHeight + (to.arcHeight - from.arcHeight) * ratio,
        groundHeight: from.groundHeight + (to.groundHeight - from.groundHeight) * ratio,
    };
}

function getMarkerImage(marker: MirrorMarker, iconOptions: L.DivIconOptions & L.IconOptions): string | null {
    if (marker._map3dImageUrl) return marker._map3dImageUrl;
    if (iconOptions.iconUrl) return iconOptions.iconUrl;
    const html = iconOptions.html;
    if (typeof html !== "string") return null;
    const trimmed = html.trim();
    if (trimmed.startsWith("<svg")) {
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}`;
    }
    // Fallback for any composite DivIcon that has not provided explicit 3D
    // metadata: retain its primary image rather than dropping the marker.
    return trimmed.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ?? null;
}

function isSeriesMarker(marker: L.Marker): boolean {
    return marker.options.icon?.options.className?.includes("event-composite-marker") ?? false;
}

function createSeriesMarkerImage(
    imageUrl: string,
    accentColor: string,
    badge: string,
    winnerImageUrl?: string,
    label = "",
): { initial: string; ready: Promise<string>; width: number; height: number } {
    const canvas = document.createElement("canvas");
    const measurementContext = canvas.getContext("2d")!;
    measurementContext.font = "600 16px sans-serif";
    const labelWidth = label ? Math.ceil(measurementContext.measureText(label).width) + 12 : 0;
    const markerLogicalWidth = badge ? 100 : 60;
    const logicalWidth = Math.max(markerLogicalWidth, labelWidth);
    const markerLeft = (logicalWidth - markerLogicalWidth) / 2;
    const logicalHeight = label ? 104 : 80;
    const markerWidth = logicalWidth;
    const markerHeight = logicalHeight;
    canvas.width = logicalWidth * 2;
    canvas.height = logicalHeight * 2;
    const context = canvas.getContext("2d")!;

    const draw = (image?: HTMLImageElement, winnerImage?: HTMLImageElement) => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.save();
        context.scale(2, 2);
        context.shadowColor = "rgba(0, 0, 0, 0.8)";
        context.shadowBlur = 4;
        context.shadowOffsetY = 2;
        if (image) {
            const maxWidth = 50;
            const maxHeight = badge ? 54 : 70;
            const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
            const width = image.naturalWidth * scale;
            const height = image.naturalHeight * scale;
            const imageCenterY = badge ? 31 : 38;
            const imageX = logicalWidth / 2 - width / 2;
            const imageY = imageCenterY - height / 2;
            context.drawImage(image, imageX, imageY, width, height);
            if (badge) {
                context.globalCompositeOperation = "source-in";
                context.fillStyle = accentColor === "#a9b4c0" ? "#e8f4ff" : accentColor;
                context.fillRect(imageX, imageY, width, height);
                context.globalCompositeOperation = "source-over";
            }
        } else {
            context.fillStyle = "#ffffff";
            context.font = "700 12px sans-serif";
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText("XM", logicalWidth / 2, 34);
        }
        context.shadowColor = "transparent";

        if (badge) {
            context.beginPath();
            context.roundRect(markerLeft + 2, 63, markerLogicalWidth - 4, 12, 6);
            context.fillStyle = accentColor;
            context.fill();
            context.fillStyle = "#ffffff";
            const fontSize = Math.max(6.5, Math.min(9, 72 / Math.max(1, badge.length) + 3));
            context.font = `700 ${fontSize}px sans-serif`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(badge, logicalWidth / 2, 69.5, markerLogicalWidth - 10);
        }

        if (winnerImage) {
            context.beginPath();
            const winnerCenterX = logicalWidth / 2 + markerLogicalWidth / 2 - 11;
            context.arc(winnerCenterX, 67, 10, 0, Math.PI * 2);
            context.fillStyle = "rgba(5, 12, 22, 0.96)";
            context.fill();
            context.lineWidth = 2;
            context.strokeStyle = accentColor;
            context.stroke();
            const scale = Math.min(15 / winnerImage.naturalWidth, 15 / winnerImage.naturalHeight);
            const width = winnerImage.naturalWidth * scale;
            const height = winnerImage.naturalHeight * scale;
            context.drawImage(winnerImage, winnerCenterX - width / 2, 67 - height / 2, width, height);
        }
        if (label) {
            context.shadowColor = "transparent";
            context.font = "600 16px sans-serif";
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.lineWidth = 3;
            context.lineJoin = "round";
            context.strokeStyle = "rgba(0, 0, 0, 0.92)";
            context.fillStyle = "#ffffff";
            context.strokeText(label, logicalWidth / 2, 93, logicalWidth - 8);
            context.fillText(label, logicalWidth / 2, 93, logicalWidth - 8);
        }
        context.restore();
    };

    draw();
    const initial = canvas.toDataURL("image/png");
    const loadImage = (url?: string): Promise<HTMLImageElement | undefined> => new Promise(resolve => {
        if (!url) {
            resolve(undefined);
            return;
        }
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(undefined);
        image.src = url;
    });
    const ready = Promise.all([loadImage(imageUrl), loadImage(winnerImageUrl)]).then(([image, winnerImage]) => {
        draw(image, winnerImage);
        return canvas.toDataURL("image/png");
    });
    return { initial, ready, width: markerWidth, height: markerHeight };
}

function rectangleAround(lng: number, lat: number, widthMeters: number, heightMeters: number): Rectangle {
    const halfLat = heightMeters / 2 / 111_320;
    const halfLng = widthMeters / 2 / (111_320 * Math.max(0.1, Math.cos(CesiumMath.toRadians(lat))));
    return Rectangle.fromDegrees(lng - halfLng, lat - halfLat, lng + halfLng, lat + halfLat);
}

function colorFromCss(css: string, alpha: number): Color {
    return (Color.fromCssColorString(css) ?? Color.CYAN).withAlpha(alpha);
}

function getBoundPopupHtml(layer: L.Layer): string | null {
    const content = layer.getPopup?.()?.getContent();
    return typeof content === "string" ? content : null;
}

function getBoundTooltipHtml(layer: L.Layer): string | null {
    const content = layer.getTooltip?.()?.getContent();
    return typeof content === "string" ? content : null;
}

function normalizePoint(point: L.PointExpression | undefined): [number, number] | null {
    if (!point) return null;
    if (Array.isArray(point)) return [point[0], point[1]];
    if (point instanceof L.Point) return [point.x, point.y];
    return null;
}

function leafletZoomToCameraHeight(zoom: number, latitude: number, viewportHeight: number): number {
    const metersPerPixel = 156_543.03392 * Math.cos(CesiumMath.toRadians(latitude)) / (2 ** zoom);
    const visibleMeters = metersPerPixel * Math.max(320, viewportHeight);
    return Math.max(80, visibleMeters / (2 * Math.tan(CesiumMath.toRadians(30))));
}

function cameraHeightToLeafletZoom(height: number, latitude: number, viewportHeight: number): number {
    const visibleMeters = height * 2 * Math.tan(CesiumMath.toRadians(30));
    const metersPerPixel = visibleMeters / Math.max(320, viewportHeight);
    return Math.max(1, Math.min(20,
        Math.log2(156_543.03392 * Math.cos(CesiumMath.toRadians(latitude)) / metersPerPixel),
    ));
}

let view3dInstance: View3D | null = null;

export function show3DView(leafletMap: L.Map): void {
    if (!view3dInstance) view3dInstance = new View3D(leafletMap);
    view3dInstance.show();
}
