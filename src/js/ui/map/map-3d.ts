import * as L from "leaflet";
import {
    ArcType,
    BoundingSphere,
    Cartesian2,
    Cartesian3,
    Color,
    ConstantProperty,
    ConstantPositionProperty,
    CustomHeightmapTerrainProvider,
    EllipsoidTerrainProvider,
    Entity,
    HeightReference,
    HeadingPitchRange,
    HorizontalOrigin,
    ImageMaterialProperty,
    LabelStyle,
    Math as CesiumMath,
    Matrix4,
    NearFarScalar,
    Rectangle,
    ScreenSpaceEventHandler,
    ScreenSpaceEventType,
    UrlTemplateImageryProvider,
    VerticalOrigin,
    Viewer,
    WebMercatorTilingScheme,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { getColorMode, subscribeColorMode } from "../react/colorModeStore.js";
import { t } from "../../i18n/index.js";
import { getElevationForLatLng, getTerrariumHeightmap } from "./elevation.js";
import {
    getLinkArcOffsetMeters,
    getSeriesGlobeCenter,
    interpolateLongitude,
} from "./map-3d-geometry.js";
import shardIconUrl from "../../../images/abaddon1_shard.png";

const TERRAIN_SAMPLES = 32;
const PATH_SAMPLE_INTERVAL_METERS = 75;
const MIN_SAMPLES_PER_SEGMENT = 24;
const MAX_SAMPLES_PER_SEGMENT = 48;
const SHARD_ANIMATION_START_DELAY_MS = 1100;
const TARGET_SIZE_METERS = 72;
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
}

interface RoutePoint {
    lng: number;
    lat: number;
    arcHeight: number;
    groundHeight?: number;
}

interface ShardAnimation {
    points: RoutePoint[];
    cumulative: number[];
    totalDistance: number;
    duration: number;
}

function createTerrainProvider(): CustomHeightmapTerrainProvider {
    return new CustomHeightmapTerrainProvider({
        width: TERRAIN_SAMPLES,
        height: TERRAIN_SAMPLES,
        tilingScheme: new WebMercatorTilingScheme(),
        credit: "Terrain © Mapzen/AWS",
        callback: (x, y, level) => getTerrariumHeightmap(
            level,
            x,
            y,
            TERRAIN_SAMPLES,
            TERRAIN_SAMPLES,
        ),
    });
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
    private readonly siteTerrainProvider = createTerrainProvider();
    private readonly overviewTerrainProvider = new EllipsoidTerrainProvider();
    private viewer: Viewer | null = null;
    private clickHandler: ScreenSpaceEventHandler | null = null;
    private exitControl: HTMLDivElement | null = null;
    private popup: HTMLDivElement | null = null;
    private readonly popupHtmlByEntityId = new Map<string, string>();
    private readonly clickActionByEntityId = new Map<string, () => void>();
    private motionShardEntities: Entity[] = [];
    private shardAnimationFrame: number | null = null;
    private shardAnimationTimer: ReturnType<typeof setTimeout> | null = null;
    private remirrorTimer: ReturnType<typeof setTimeout> | null = null;
    private mirrorGeneration = 0;
    private active = false;
    private nextEntityId = 0;
    private readonly handleLeafletLayerChange = () => this.scheduleRemirror();
    private readonly handleLeafletMoveEnd = () => this.followLeafletCamera();

    constructor(leafletMap: L.Map) {
        this.leafletMap = leafletMap;
        this.container = document.createElement("div");
        this.container.id = "map3d";
        document.body.appendChild(this.container);

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

    private syncCameraFromLeaflet(animate: boolean): void {
        if (!this.viewer) return;
        const center = this.leafletMap.getCenter();
        const height = leafletZoomToCameraHeight(
            this.leafletMap.getZoom(),
            center.lat,
            this.container.clientHeight,
        );
        const target = Cartesian3.fromDegrees(center.lng, center.lat);
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
        if (this.active) this.syncCameraFromLeaflet(true);
    }

    private scheduleRemirror(): void {
        if (!this.active) return;
        if (this.remirrorTimer) clearTimeout(this.remirrorTimer);
        this.remirrorTimer = setTimeout(() => void this.mirrorLeafletLayers(), 150);
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
        const linkJobs: Promise<void>[] = [];
        const animations: ShardAnimation[] = [];
        const seriesLocations: L.LatLng[] = [];

        this.leafletMap.eachLayer(layer => {
            if (layer instanceof L.Marker) {
                if ("showMarker" in layer.options) return;
                if (layer.options.pane === "shardPane") {
                    const position = layer.getLatLng();
                    const entity = this.createShardEntity(position.lng, position.lat);
                    this.registerPopup(entity, getBoundPopupHtml(layer));
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
                linkJobs.push(this.mirrorPolyline(layer, generation));
            }
        });

        void this.startShardAnimations(animations, generation);
        if (seriesLocations.length > 0) {
            this.viewer.terrainProvider = this.overviewTerrainProvider;
            this.showSeriesGlobe(seriesLocations);
        } else {
            this.viewer.terrainProvider = this.siteTerrainProvider;
        }
        await Promise.all(linkJobs);
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
        const terrainAligned = marker.options.pane === "targetPane";
        const seriesMarker = isSeriesMarker(marker);
        const seriesPin = seriesMarker
            ? createSeriesPinImage(image, (marker as MirrorMarker)._map3dAccentColor ?? "#a9b4c0")
            : null;
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
                    heightReference: HeightReference.CLAMP_TO_GROUND,
                },
            });
        } else {
            entity = this.viewer.entities.add({
                id: this.entityId("marker"),
                position: Cartesian3.fromDegrees(location.lng, location.lat),
                billboard: {
                    image: seriesPin?.initial ?? image,
                    width: seriesMarker ? 46 : size[0],
                    height: seriesMarker ? 60 : size[1],
                    color: Color.WHITE.withAlpha(marker.options.opacity ?? 1),
                    horizontalOrigin: HorizontalOrigin.CENTER,
                    verticalOrigin: seriesMarker ? VerticalOrigin.BOTTOM : VerticalOrigin.CENTER,
                    heightReference: HeightReference.CLAMP_TO_GROUND,
                    scaleByDistance: seriesMarker
                        ? new NearFarScalar(500_000, 1, 20_000_000, 0.9)
                        : undefined,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
                label: seriesMarker ? {
                    text: (marker as MirrorMarker)._map3dLabel ?? "",
                    font: "600 13px sans-serif",
                    fillColor: Color.WHITE,
                    outlineColor: Color.BLACK,
                    outlineWidth: 4,
                    style: LabelStyle.FILL_AND_OUTLINE,
                    pixelOffset: new Cartesian2(0, 18),
                    heightReference: HeightReference.CLAMP_TO_GROUND,
                    scaleByDistance: new NearFarScalar(500_000, 1, 20_000_000, 0.9),
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                } : undefined,
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
        const fill = colorFromCss(options.fillColor ?? options.color ?? "#3388ff", options.fillOpacity ?? 0.2);
        const outline = colorFromCss(options.color ?? "#3388ff", options.opacity ?? 1);
        const entity = this.viewer.entities.add({
            id: this.entityId("portal"),
            position: Cartesian3.fromDegrees(location.lng, location.lat),
            point: {
                pixelSize: (options.radius ?? 10) * 2,
                color: fill,
                outlineColor: outline,
                outlineWidth: options.weight ?? 3,
                heightReference: HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
        });
        this.registerPopup(entity, getBoundPopupHtml(circle));
    }

    private async mirrorPolyline(polyline: L.Polyline, generation: number): Promise<void> {
        if (!this.viewer) return;
        const latLngs = flattenLatLngs(polyline.getLatLngs());
        if (latLngs.length < 2) return;
        const route = sampleRoute(latLngs);
        const elevations = await Promise.all(route.map(point => getElevationForLatLng(point.lat, point.lng)));
        if (!this.viewer || generation !== this.mirrorGeneration || !this.active) return;

        const positions = route.map((point, index) => Cartesian3.fromDegrees(
            point.lng,
            point.lat,
            (elevations[index] ?? 0) + point.arcHeight,
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

    private createShardEntity(lng: number, lat: number, absoluteHeight?: number): Entity {
        if (!this.viewer) throw new Error("Cannot create a shard before the Cesium viewer exists");
        return this.viewer.entities.add({
            id: this.entityId("shard"),
            position: Cartesian3.fromDegrees(lng, lat, absoluteHeight ?? 0),
            billboard: {
                image: shardIconUrl,
                width: 24,
                height: 24,
                horizontalOrigin: HorizontalOrigin.CENTER,
                verticalOrigin: VerticalOrigin.CENTER,
                heightReference: absoluteHeight === undefined
                    ? HeightReference.CLAMP_TO_GROUND
                    : HeightReference.NONE,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
        });
    }

    private async startShardAnimations(animations: ShardAnimation[], generation: number): Promise<void> {
        if (!this.viewer || animations.length === 0) return;
        await Promise.all(animations.flatMap(animation => animation.points.map(async point => {
            point.groundHeight = (await getElevationForLatLng(point.lat, point.lng)) ?? 0;
        })));
        if (!this.viewer || !this.active || generation !== this.mirrorGeneration) return;
        this.motionShardEntities = animations.map(animation => {
            const first = animation.points[0];
            return this.createShardEntity(first.lng, first.lat, (first.groundHeight ?? 0) + first.arcHeight);
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
                            Cartesian3.fromDegrees(point.lng, point.lat),
                        );
                        if (shardEntity.billboard) {
                            shardEntity.billboard.heightReference = new ConstantProperty(HeightReference.CLAMP_TO_GROUND);
                        }
                    } else {
                        shardEntity.position = new ConstantPositionProperty(
                            Cartesian3.fromDegrees(
                                point.lng,
                                point.lat,
                                (point.groundHeight ?? 0) + point.arcHeight,
                            ),
                        );
                    }
                });
                this.shardAnimationFrame = allDone ? null : requestAnimationFrame(tick);
            };
            tick();
        }, SHARD_ANIMATION_START_DELAY_MS);
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

function pointAlongPath(animation: ShardAnimation, progress: number): RoutePoint {
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
        groundHeight: (from.groundHeight ?? 0)
            + ((to.groundHeight ?? 0) - (from.groundHeight ?? 0)) * ratio,
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

function createSeriesPinImage(imageUrl: string, accentColor: string): { initial: string; ready: Promise<string> } {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 128;
    const context = canvas.getContext("2d")!;

    const draw = (image?: HTMLImageElement) => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.save();
        context.scale(2, 2);
        context.shadowColor = "rgba(0, 0, 0, 0.8)";
        context.shadowBlur = 5;
        context.shadowOffsetY = 2;
        context.beginPath();
        context.moveTo(24, 62);
        context.bezierCurveTo(21, 55, 4, 43, 4, 23);
        context.bezierCurveTo(4, 11, 13, 3, 24, 3);
        context.bezierCurveTo(35, 3, 44, 11, 44, 23);
        context.bezierCurveTo(44, 43, 27, 55, 24, 62);
        context.closePath();
        context.fillStyle = "rgba(5, 12, 22, 0.94)";
        context.fill();
        context.shadowColor = "transparent";
        context.lineWidth = 2;
        context.strokeStyle = accentColor;
        context.stroke();

        context.beginPath();
        context.arc(24, 23, 16.5, 0, Math.PI * 2);
        context.fillStyle = "rgba(0, 0, 0, 0.76)";
        context.fill();
        context.lineWidth = 1;
        context.strokeStyle = "rgba(255, 255, 255, 0.72)";
        context.stroke();

        if (image) {
            const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
            const sourceX = (image.naturalWidth - sourceSize) / 2;
            const sourceY = image.naturalHeight > image.naturalWidth
                ? (image.naturalHeight - sourceSize) * 0.68
                : (image.naturalHeight - sourceSize) / 2;
            context.save();
            context.beginPath();
            context.arc(24, 23, 15, 0, Math.PI * 2);
            context.clip();
            context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 9, 8, 30, 30);
            context.restore();
        } else {
            context.fillStyle = "#ffffff";
            context.font = "700 12px sans-serif";
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText("XM", 24, 23);
        }
        context.restore();
    };

    draw();
    const initial = canvas.toDataURL("image/png");
    const ready = new Promise<string>(resolve => {
        const image = new Image();
        image.onload = () => {
            draw(image);
            resolve(canvas.toDataURL("image/png"));
        };
        image.onerror = () => resolve(initial);
        image.src = imageUrl;
    });
    return { initial, ready };
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
