import * as L from "leaflet";
import { HISTORY_REASONS, FACTION_COLORS, INGRESS_INTEL_PORTAL_LINK, EVENT_BRANDS, ORNAMENT_BRANDS, SIGNAL_COLOR, ORNAMENT_ONLY_COLOR, TARGET_ARTIFACT_IDS } from "../constants.js";
import { t, tChoice } from "../i18n/index.js";
import shardIconUrl from '../../images/abaddon1_shard.png';
import { getSiteData, getSeriesMetadata, getSeriesGeocode } from "../data/data-store.js";
import { getFlagTooltipHtml } from "./ui-formatters.js"
import { formatEpochToLocalTime, formatIsoToShortDate, getTimeRemaining, getActiveEventRemaining } from "../shared/date-helpers.js";
import { getEventDuration } from "../shared/event-helpers.js";
import { getHexagonSVG } from "./marker-template.js";
import * as ZonedDateTime from "temporal-polyfill/fns/zoneddatetime";
import * as Now from "temporal-polyfill/fns/now";
import * as Duration from "temporal-polyfill/fns/duration";
import type { PortalsMap, Faction, SiteData } from "../types/domain.js";
import type { DetailsPanelContent } from "./series-renderer.js";
import { getAnimationControlState, selectAnimationLink } from "./react/animationControlStore.js";

const shardIcon = L.icon({
    iconUrl: shardIconUrl,
    iconSize: [24, 24], // Source image is 48x48 with a 32x32 active area (8px padding). 24px icon size results in a 16px visual shard.
    iconAnchor: [12, 12],
});

export interface SiteLayerDetails {
    id: string;
    label: string;
    layer: L.Layer;
    isOverlay?: boolean;
    showByDefault?: boolean;
    hideFromControl?: boolean;
}

const siteLayerCache = new Map<string, SiteLayerDetails[] | null>();
let activeSiteLayer: L.Layer | null = null;

export function getSiteLayers(seriesId: string, siteId: string): SiteLayerDetails[] | null {
    let cacheEntry = siteLayerCache.get(siteId);
    if (!cacheEntry) {
        const siteData = getSiteData(seriesId, siteId);
        if (!siteData) return null;

        cacheEntry = renderSiteData({ seriesId, siteId, siteData });
        siteLayerCache.set(siteId, cacheEntry);
    }
    return cacheEntry;
}

export function setActiveSiteLayer(siteLayer: L.Layer | null): void {
    activeSiteLayer = siteLayer;
}

function renderSiteData({ seriesId, siteId, siteData }: { seriesId: string; siteId: string; siteData: SiteData }): SiteLayerDetails[] {
    const layersDetails: SiteLayerDetails[] = [];
    const hasShards = (siteData.fullEvent?.shards?.length ?? 0) > 0;

    const ornamentLayer: any = L.featureGroup();
    ornamentLayer._layerType = 'site-overlay';
    ornamentLayer._siteId = siteId;
    let ornamentCount = 0;
    for (const portal of Object.values(siteData.portals || {})) {
        if (portal.ornamentId) {
            ornamentCount++;
            const latLng = L.latLng(portal.lat, portal.lng);
            const brand = ORNAMENT_BRANDS[portal.ornamentId];
            const style = brand?.style || {};
            const ornamentColor = style.color || SIGNAL_COLOR;

            let markerIcon;
            let pane = 'ornamentPane';

            if (style.icon) {
                // 1a. The Visual Image Ornament
                markerIcon = L.icon({
                    iconUrl: style.icon,
                    iconSize: (style.size as [number, number] | undefined) || [40, 40],
                    iconAnchor: style.size ? [style.size[0] / 2, style.size[1] / 2] as [number, number] : [20, 20]
                });
                pane = 'ornamentFrontPane';
            } else {
                // 1b. The Visual Hexagon Frame (using custom color)
                markerIcon = L.divIcon({
                    className: 'ornament-hexagon-marker',
                    html: getHexagonSVG(ornamentColor),
                    iconSize: [40, 40],
                    iconAnchor: [20, 20]
                });
            }

            L.marker(latLng, {
                icon: markerIcon,
                interactive: false,
                pane: pane,
                opacity: 0.6
            }).addTo(ornamentLayer);

            // 2. The Interactive Anchor Pin (Opt-in)
            const tooltipHtml = formatPortalTooltip(portal, [], siteData.geocode.timezone);
            L.circleMarker(latLng, {
                radius: 6,
                color: ORNAMENT_ONLY_COLOR,
                fillOpacity: 0.6,
                opacity: 0.6,
                weight: 1,
                interactive: true,
                pane: 'ornamentPane'
            }).bindTooltip(tooltipHtml, { interactive: true })
                .bindPopup(tooltipHtml, { closeButton: false, autoClose: true })
                .addTo(ornamentLayer);
        }
    }

    if (ornamentLayer.getLayers().length > 0) {
        layersDetails.push({
            id: "ornaments",
            label: t('site.ornaments'),
            layer: ornamentLayer,
            isOverlay: true,
            showByDefault: !hasShards || ornamentCount < 10
        });
    }

    const isSingularEvent = !siteData.waves || siteData.waves.length <= 1;

    if (hasShards) {
        const fullEventLayer: any = renderShardLayer({
            seriesId,
            siteId,
            shardData: siteData.fullEvent!,
            portals: siteData.portals || {},
            timezone: siteData.geocode.timezone,
            layerType: 'site',
        });
        fullEventLayer._seriesId = seriesId;
        layersDetails.push({
            id: "all",
            label: isSingularEvent ? t('site.shards') : t('site.all_waves'),
            layer: fullEventLayer,
            hideFromControl: isSingularEvent
        });

        if (!isSingularEvent) {
            siteData.waves!.forEach((wave, index) => {
                const waveNumber = index + 1;
                const waveId = `wave-${waveNumber}`;
                const waveLayer: any = renderShardLayer({
                    seriesId,
                    siteId,
                    shardData: wave,
                    portals: siteData.portals || {},
                    timezone: siteData.geocode.timezone,
                    layerType: 'wave',
                });
                waveLayer._seriesId = seriesId;
                waveLayer._waveId = waveId;
                layersDetails.push({
                    id: waveId,
                    label: t('site.wave_n', { n: waveNumber }),
                    layer: waveLayer,
                });
            });
        }
    }
    return layersDetails;
}

export function getSiteControl(siteId: string): L.Control.Layers | null {
    const controlLayers: Record<string, L.Layer> = {};
    const overlays: Record<string, L.Layer> = {};
    const cacheEntry = siteLayerCache.get(siteId);
    if (!cacheEntry) return null;

    for (const layerDetails of cacheEntry) {
        if (layerDetails.hideFromControl) continue;
        if (layerDetails.isOverlay) {
            overlays[layerDetails.label] = layerDetails.layer;
        } else {
            controlLayers[layerDetails.label] = layerDetails.layer;
        }
    }
    if (Object.keys(controlLayers).length === 0 && Object.keys(overlays).length === 0) {
        return null;
    }
    // Keep the wave picker with the other map controls. The React details card
    // owns the bottom-right corner, so placing both there makes their expanded
    // panels overlap on tablet-sized viewports.
    return L.control.layers(controlLayers, overlays, { collapsed: true, position: "topleft" });
}

function renderShardLayer({ seriesId, siteId, shardData, portals, timezone, layerType }: {
    seriesId: string; siteId: string; shardData: any; portals: PortalsMap; timezone: string; layerType: string;
}): any {
    const shardLayer: any = L.featureGroup();
    shardLayer._layerType = layerType;
    shardLayer._siteId = siteId.replace(seriesId + "-", "");

    const safeShardData = shardData || {};
    const shardPathsMap = createShardPathLayers(safeShardData.shardPaths || {}, portals, timezone);
    shardPathsMap.forEach((shardPath) => shardPath.addTo(shardLayer));

    const { portalHistoryMap, shardMotionData } = processShardData(safeShardData.shards || [], portals);
    const shardMotionPaths = createShardMotionPaths(shardMotionData);

    shardLayer.shardMotionPaths = [];
    shardLayer.shardMotionState = 'idle';
    shardLayer.shardMotionLoop = false;
    shardLayer.selectedMotionLinkKey = null;
    const completedMotionPaths = new Set<any>();
    let loopFrame: number | null = null;

    const getPlayableMotionPaths = () => shardLayer.selectedMotionLinkKey
        ? shardLayer.shardMotionPaths.filter((path: any) => path.shardPaths.includes(shardLayer.selectedMotionLinkKey))
        : shardLayer.shardMotionPaths;

    const publishMotionState = (state: 'playing' | 'paused' | 'ended') => {
        shardLayer.shardMotionState = state;
        shardLayer.fire('shardmotionstatechange', { playback: state });
    };

    const cancelPendingLoop = () => {
        if (loopFrame !== null) cancelAnimationFrame(loopFrame);
        loopFrame = null;
    };

    const playAllMotionPaths = () => {
        cancelPendingLoop();
        completedMotionPaths.clear();
        publishMotionState('playing');
        const playableMotionPaths = getPlayableMotionPaths();
        shardLayer.shardMotionPaths.forEach((shardPathPoly: any) => {
            if (playableMotionPaths.includes(shardPathPoly)) return;
            shardPathPoly.motionPause();
            const marker = shardPathPoly.getMarker?.();
            if (marker && shardPathPoly._linePoints?.[0]) marker.setLatLng(shardPathPoly._linePoints[0]);
            if (marker && shardLayer._map?.hasLayer(marker)) shardLayer._map.removeLayer(marker);
            shardPathPoly.setLatLngs([]);
        });
        playableMotionPaths.forEach((shardPathPoly: any) => {
            shardPathPoly.motionStart();
        });
    };

    shardMotionPaths.forEach((shardPathPoly: any) => {
        shardPathPoly.addTo(shardLayer);
        shardLayer.shardMotionPaths.push(shardPathPoly);
        shardPathPoly.on('motion-started', () => {
            completedMotionPaths.delete(shardPathPoly);
            if (shardLayer.shardMotionState !== 'playing') publishMotionState('playing');
        });
        shardPathPoly.on('motion-ended', () => {
            completedMotionPaths.add(shardPathPoly);
            const playableMotionPaths = getPlayableMotionPaths();
            if (!playableMotionPaths.every((path: any) => completedMotionPaths.has(path))) return;

            if (shardLayer.shardMotionLoop && shardLayer._map && shardLayer.shardMotionState !== 'paused') {
                loopFrame = requestAnimationFrame(() => {
                    loopFrame = null;
                    if (shardLayer._map && shardLayer.shardMotionLoop && shardLayer.shardMotionState !== 'paused') {
                        playAllMotionPaths();
                    }
                });
                return;
            }
            publishMotionState('ended');
        });

        for (const shardPath of shardPathPoly.shardPaths) {
            const path = shardPathsMap.get(shardPath);
            if (path) (path as any).shardPathPoly = shardPathPoly;
            path?.on("mouseover", function () {
                const state = getAnimationControlState();
                if (state.playback === 'paused') return;
                if (state.selectedLinkKey && state.selectedLinkKey !== shardPath) return;
                shardPathPoly.motionStart();
            });
        }
    });
    shardPathsMap.forEach((path, shardPathKey) => {
        path.on("click", function () {
            if (getAnimationControlState().linkSelectionEnabled) selectAnimationLink(shardPathKey);
        });
    });

    shardLayer.startShardMotion = function () {
        if (this.shardMotionState === 'paused' || this.shardMotionState === 'playing') return;
        playAllMotionPaths();
    };

    shardLayer.setShardMotionPlaying = function (playing: boolean) {
        cancelPendingLoop();
        if (!playing) {
            this.shardMotionPaths.forEach((shardPathPoly: any) => shardPathPoly.motionPause());
            publishMotionState('paused');
            return;
        }

        if (this.shardMotionState === 'paused') {
            publishMotionState('playing');
            this.shardMotionPaths.forEach((shardPathPoly: any) => {
                if (!completedMotionPaths.has(shardPathPoly)) shardPathPoly.motionResume();
            });
            return;
        }

        if (this.shardMotionState !== 'playing') playAllMotionPaths();
    };

    shardLayer.setShardMotionLoop = function (loop: boolean) {
        this.shardMotionLoop = loop;
        if (!loop) cancelPendingLoop();
    };

    shardLayer.setShardMotionSpeed = function (speed: number) {
        this.shardMotionPaths.forEach((shardPathPoly: any) => {
            shardPathPoly.motionDuration(shardPathPoly.baseMotionDuration / speed);
        });
    };

    shardLayer.setShardMotionLink = function (linkKey: string | null) {
        if (this.selectedMotionLinkKey === linkKey) return;
        const wasPaused = this.shardMotionState === 'paused';
        this.selectedMotionLinkKey = linkKey;
        completedMotionPaths.clear();
        this.shardMotionPaths.forEach((shardPathPoly: any) => {
            shardPathPoly.motionPause();
            const marker = shardPathPoly.getMarker?.();
            if (marker && shardPathPoly._linePoints?.[0]) marker.setLatLng(shardPathPoly._linePoints[0]);
            if (marker && this._map?.hasLayer(marker)) this._map.removeLayer(marker);
            shardPathPoly.setLatLngs([]);
        });
        shardPathsMap.forEach((path, pathKey) => {
            const isSelected = !linkKey || pathKey === linkKey;
            path.setStyle({
                opacity: isSelected ? 1 : 0.2,
                weight: linkKey && isSelected ? 6 : 3,
            });
            if (linkKey && isSelected) path.bringToFront();
        });
        this.shardMotionState = wasPaused ? 'paused' : 'idle';
        if (!wasPaused) playAllMotionPaths();
    };

    const { portalMarkers, staticShardMarkers } = createPortalMarkers(portals, portalHistoryMap, timezone, layerType === 'wave' ? safeShardData.targets : null);
    portalMarkers.forEach((marker) => marker.addTo(shardLayer));
    staticShardMarkers.forEach((marker) => marker.addTo(shardLayer));

    if (layerType === 'wave' && safeShardData.targets) {
        const targetLayer: any = L.featureGroup();
        targetLayer._layerType = 'target-layer';
        renderTargetMarkers(portals, safeShardData.targets).forEach(m => m.addTo(targetLayer));
        targetLayer.addTo(shardLayer);
    }

    return shardLayer;
}

function createShardPathLayers(shardPaths: Record<string, any>, portalsMap: PortalsMap, timezone: string): Map<string, L.Polyline> {
    const shardPathsMap = new Map<string, L.Polyline>();
    if (!shardPaths) return shardPathsMap;

    for (const [shardPathKey, shardPath] of Object.entries(shardPaths)) {
        const shardPathPortals = shardPathKey.split("-").map(idString => {
            const id = Number(idString);
            return {
                id,
                ...(portalsMap[id]),
            }
        });

        const shardPathDetails = renderShardPath(shardPath, shardPathPortals, timezone);
        if (shardPathDetails) {
            (shardPathDetails as any)._shardPathKey = shardPathKey;
            shardPathsMap.set(shardPathKey, shardPathDetails);
        }
    }
    return shardPathsMap;
}

function processShardData(shards: any[], portalsMap: PortalsMap): { portalHistoryMap: Record<string, Map<any, any[]>>; shardMotionData: Array<{ coords: L.LatLng[]; shardPaths: string[] }> } {
    const portalHistoryMap: Record<string, Map<any, any[]>> = {};
    const shardMotionData: Array<{ coords: L.LatLng[]; shardPaths: string[] }> = [];
    if (!shards) return { portalHistoryMap, shardMotionData };

    for (const shard of shards) {
        const coords: L.LatLng[] = [];
        const shardPaths: string[] = [];

        for (const historyItem of shard.history) {
            const portalIds = historyItem.reason === HISTORY_REASONS.LINK || historyItem.reason === HISTORY_REASONS.JUMP
                ? [historyItem.portalId, historyItem.dest]
                : [historyItem.portalId];

            if (historyItem.reason === HISTORY_REASONS.LINK || historyItem.reason === HISTORY_REASONS.JUMP) {
                const originPortal = portalsMap[historyItem.portalId];
                const destPortal = portalsMap[historyItem.dest];

                shardPaths.push([historyItem.portalId, historyItem.dest].sort().join('-'));
                if (coords.length === 0) {
                    coords.push(L.latLng(originPortal.lat, originPortal.lng));
                }
                coords.push(L.latLng(destPortal.lat, destPortal.lng));
            }

            for (const portalId of portalIds) {
                if (!portalHistoryMap[portalId]) {
                    portalHistoryMap[portalId] = new Map();
                }
                const portalHistory = portalHistoryMap[portalId];
                if (!portalHistory.has(shard.id)) {
                    portalHistory.set(shard.id, []);
                }
                portalHistory.get(shard.id)!.push(historyItem);
            }
        }

        if (coords.length > 0 && shardPaths.length > 0) {
            shardMotionData.push({ coords, shardPaths });
        }
    }

    return {
        shardMotionData,
        portalHistoryMap,
    };
}

function createShardMotionPaths(shardMotionData: Array<{ coords: L.LatLng[]; shardPaths: string[] }>): any[] {
    return shardMotionData.map(({ coords, shardPaths }) => {
        const baseMotionDuration = shardPaths.length * 1000;
        const shardPathPoly: any = (L as any).motion.polyline(
            coords,
            {
                color: "transparent",
                interactive: false,
            },
            { auto: false, duration: baseMotionDuration },
            {
                showMarker: true,
                removeOnEnd: false,
                icon: shardIcon,
                interactive: false,
                pane: 'shardPane'
            }
        );
        shardPathPoly.shardPaths = shardPaths;
        shardPathPoly.baseMotionDuration = baseMotionDuration;
        return shardPathPoly;
    });
}

function createPortalMarkers(portals: PortalsMap, portalHistoryMap: Record<string, Map<any, any[]>>, timeZone: string, targets: Record<Faction, number[]> | null | undefined): { portalMarkers: L.CircleMarker[]; staticShardMarkers: L.Marker[] } {
    const portalMarkers: L.CircleMarker[] = [];
    const staticShardMarkers: L.Marker[] = [];

    for (const [portalId, portal] of Object.entries(portals)) {
        const latLng = L.latLng(portal.lat, portal.lng);

        const portalHistory = Array.from(portalHistoryMap[portalId] || []);
        const targetFaction = getTargetFaction(portalId, targets);

        if (portalHistory.length === 0 && !targetFaction) continue;

        const lastKnownTeam = getLastKnownTeam(portalHistory);
        const portalTooltip = formatPortalTooltip(portal, portalHistory, timeZone, targetFaction);

        portalHistory.forEach(([, shardHistory]) => {
            const shardHistoryReasons = shardHistory.flatMap((h: any) => h.reason);
            const isStaticSpawn = shardHistoryReasons.includes(HISTORY_REASONS.SPAWN) &&
                !shardHistoryReasons.includes(HISTORY_REASONS.LINK) &&
                !shardHistoryReasons.includes(HISTORY_REASONS.JUMP);

            if (isStaticSpawn) {
                staticShardMarkers.push(L.marker(latLng, {
                    icon: shardIcon,
                    pane: 'shardPane'
                }).bindTooltip(portalTooltip).bindPopup(portalTooltip));
            }
        });

        portalMarkers.push(
            L.circleMarker(latLng, {
                color: FACTION_COLORS[lastKnownTeam ?? 'undefined'] || FACTION_COLORS.NEU,
                pane: 'markerPane'
            }).bindTooltip(portalTooltip, {
                interactive: true
            }).bindPopup(portalTooltip, {
                closeButton: false,
                autoClose: true,
            })
        );
    }
    return {
        portalMarkers,
        staticShardMarkers,
    };
}

function formatPortalTooltip(portal: any, portalHistory: Array<[any, any[]]>, timeZone: string, targetFaction?: Faction | null): string {
    const ornamentLabel = ORNAMENT_BRANDS[portal.ornamentId] ? t('blueprints.ornament.' + portal.ornamentId) : `${t('site.ornament_label')} ${portal.ornamentId}`;
    const ornamentHtml = portal.ornamentId ? `<i>${ornamentLabel}</i><br/>` : '';
    const targetHtml = targetFaction ? `<strong><span style="color:${FACTION_COLORS[targetFaction]}">${targetFaction}</span></strong> <i>${t('site.target_portal')}</i><br/>` : '';
    const separator = portalHistory.length > 0 ? '<hr />' : '';
    let tooltipHtml = `<strong>${portal.title}</strong> <a class="intel-link" href="${INGRESS_INTEL_PORTAL_LINK}${portal.lat},${portal.lng}" target="intel_page">${t('site.intel')}</a><br/>${targetHtml}${ornamentHtml}${separator}`;

    portalHistory.forEach(([shardId, shardHistory], index) => {
        tooltipHtml += `<strong>${t('site.shard_n', { id: shardId })}</strong><br />`;
        for (const historyItem of shardHistory) {
            const teamToDisplay = ![HISTORY_REASONS.NO_MOVE, HISTORY_REASONS.JUMP].includes(historyItem.reason) ? historyItem.team || "NEU" : undefined;

            let reasonToDisplay;
            if (historyItem.reason === HISTORY_REASONS.SPAWN) reasonToDisplay = t('site.reason.spawn');
            else if (historyItem.reason === HISTORY_REASONS.NO_MOVE) reasonToDisplay = t('site.reason.no_move');
            else if (historyItem.reason === HISTORY_REASONS.LINK) reasonToDisplay = t('site.reason.jump');
            else if (historyItem.reason === HISTORY_REASONS.JUMP) reasonToDisplay = t('site.reason.teleport');
            else if (historyItem.reason === HISTORY_REASONS.DESPAWN) reasonToDisplay = t('site.reason.despawn');
            else reasonToDisplay = historyItem.reason;

            const teamSuffix = teamToDisplay ? ` — <span style="color:${FACTION_COLORS[teamToDisplay]}">${teamToDisplay}</span>` : '';
            tooltipHtml += `${t('site.portal_history', {
                reason: reasonToDisplay,
                time: formatEpochToLocalTime(historyItem.moveTime, timeZone),
                team: teamSuffix,
            })}<br />`;
        }

        if (index < portalHistory.length - 1) {
            tooltipHtml += `<hr class="tooltip-sub-divider" />`;
        }
    });

    return tooltipHtml;
}

function getLastKnownTeam(portalHistory: Array<[any, any[]]> | null | undefined): Faction | undefined {
    if (!portalHistory) {
        return undefined;
    }

    const portalHistoryEntries = portalHistory
        .map(([, historyItems]) => historyItems)
        .flatMap((historyItem) => historyItem || [])
        .filter(
            (historyItem) =>
                historyItem.reason !== "despawn" && historyItem.team
        )
        .sort((a, b) => b.moveTime - a.moveTime);
    return portalHistoryEntries[0]?.team;
}

function renderShardPath(shardPath: any, shardPathPortals: any[], timeZone: string): L.Polyline | undefined {
    let polyline: L.Polyline | undefined;

    if (shardPath.links && shardPath.links.length > 0) {
        const { tooltip, coords, biDirectionalMoves } = formatLinkPathTooltip(shardPath, shardPathPortals, timeZone);
        const linkColor = FACTION_COLORS[shardPath.links[shardPath.links.length - 1].team] || FACTION_COLORS.NEU;

        polyline = L.polyline(coords, {
            color: linkColor,
            dashArray: "10,5,5,5,5,5,5,5,10000",
        });
        (polyline as any).biDirectionalJumps = biDirectionalMoves;
        polyline.bindTooltip(tooltip, { sticky: true }).bindPopup(tooltip, { sticky: true } as L.PopupOptions);
    } else if (shardPath.jumps && shardPath.jumps.length > 0) {
        const { tooltip, coords } = formatJumpPathTooltip(shardPath, shardPathPortals, timeZone);

        polyline = L.polyline(coords, {
            color: SIGNAL_COLOR,
            dashArray: "10,10",
        });
        polyline.bindTooltip(tooltip, { sticky: true }).bindPopup(tooltip, { sticky: true } as L.PopupOptions);
    }

    return polyline;
}

function formatLinkPathTooltip(shardPath: any, shardPathPortals: any[], timeZone: string): { tooltip: string; coords: L.LatLng[]; biDirectionalMoves: boolean } {
    const [portalA, portalB] = shardPathPortals;
    const moveOrigins = new Set(shardPath.links.flatMap((link: any) => link.moves).map((move: any) => move.origin));
    const biDirectionalMoves = moveOrigins.size > 1;
    const distanceDisplay = shardPath.distance < 1000 ? `${shardPath.distance}m` : `${(shardPath.distance / 1000).toFixed(2)}km`;

    let fromPortal, toPortal, coords: L.LatLng[], tooltip: string;

    if (biDirectionalMoves) {
        coords = [L.latLng(portalA.lat, portalA.lng), L.latLng(portalB.lat, portalB.lng)];
        tooltip = `<strong>${portalA.title} (A) <-> ${portalB.title} (B) (${distanceDisplay})</strong><hr />`;
    } else {
        const [originPortalId] = [...moveOrigins];
        fromPortal = originPortalId === portalA.id ? portalA : portalB;
        toPortal = originPortalId === portalA.id ? portalB : portalA;
        coords = [L.latLng(fromPortal.lat, fromPortal.lng), L.latLng(toPortal.lat, toPortal.lng)];
        tooltip = `<strong>${fromPortal.title} -> ${toPortal.title} (${distanceDisplay})</strong><hr />`;
    }

    const sortedLinks = [...shardPath.links].sort((a, b) => a.linkTime - b.linkTime);
    sortedLinks.forEach((link, index) => {
        const linkColor = FACTION_COLORS[link.team] || FACTION_COLORS.NEU;
        const teamHtml = `<span style="color:${linkColor}">${link.team || 'NEU'}</span>`;
        tooltip += `${t('site.link_created', {
            time: formatEpochToLocalTime(link.linkTime, timeZone),
            team: teamHtml,
        })}<br />`;

        for (const move of link.moves) {
            const moveTime = formatEpochToLocalTime(move.moveTime, timeZone);
            const portalJumpText = biDirectionalMoves ? (move.origin === portalA.id ? "A → B" : "B → A") : "";
            tooltip += `${t('site.shard_scored', {
                id: move.shardId,
                route: portalJumpText ? t('site.route_detail', { route: portalJumpText }) : '',
                time: moveTime,
                points: move.points,
                pointLabel: tChoice('site.point', move.points),
            })}<br />`;
        }

        if (index < sortedLinks.length - 1) {
            tooltip += `<hr class="tooltip-sub-divider" />`;
        }
    });

    return { tooltip, coords, biDirectionalMoves };
}

function formatJumpPathTooltip(shardPath: any, shardPathPortals: any[], timeZone: string): { tooltip: string; coords: L.LatLng[] } {
    const [portalA, portalB] = shardPathPortals;
    const jump = shardPath.jumps[0];
    const distanceDisplay = shardPath.distance < 1000 ? `${shardPath.distance}m` : `${(shardPath.distance / 1000).toFixed(2)}km`;

    const fromPortal = jump.origin === portalA.id ? portalA : portalB;
    const toPortal = jump.origin === portalA.id ? portalB : portalA;
    const coords = [L.latLng(fromPortal.lat, fromPortal.lng), L.latLng(toPortal.lat, toPortal.lng)];
    const moveTime = formatEpochToLocalTime(jump.moveTime, timeZone);

    const tooltip = `<strong>${fromPortal.title} -> ${toPortal.title} (${distanceDisplay})</strong><hr />
        ${t('site.shard_teleported', { id: jump.shardId, time: moveTime })}<br />`;

    return { tooltip, coords };
}

export function getDetailsPanelContent(seriesId: string, siteId: string, waveId?: string): DetailsPanelContent {
    const seriesMetadata = getSeriesMetadata(seriesId);
    const siteGeocode = getSeriesGeocode(seriesId)?.sites[siteId];
    const siteData = getSiteData(seriesId, siteId);
    if (!siteData || !siteGeocode) return { title: '', content: '' };

    const siteEventType = EVENT_BRANDS[siteGeocode.eventType];
    const startTime = ZonedDateTime.fromString(siteGeocode.date);
    const durationMins = getEventDuration(siteGeocode, seriesId);
    const endTime = ZonedDateTime.add(startTime, Duration.fromFields({ minutes: durationMins }));
    const now = Now.zonedDateTimeISO(siteGeocode.timezone);
    let countdownSuffix = '';

    if (ZonedDateTime.compare(now, startTime) < 0) {
        const remaining = getTimeRemaining(siteGeocode.date, siteGeocode.timezone);
        countdownSuffix = ` (${t('site.starts_in_status', { remaining })})`;
    } else if (ZonedDateTime.compare(now, startTime) >= 0 && ZonedDateTime.compare(now, endTime) <= 0) {
        const remaining = getActiveEventRemaining(siteGeocode.date, siteGeocode.timezone, durationMins);
        countdownSuffix = ` (${t('site.active_status', { remaining })})`;
    }

    const ornamentCount = Object.values(siteData.portals || {}).filter(p => p.ornamentId).length;
    const hasShards = (siteData?.fullEvent?.shards?.length ?? 0) > 0;
    const isSingularEvent = !siteData.waves || siteData.waves.length <= 1;

    const contextPrefix = waveId ? t('site.wave_n_prefix', { n: waveId.replace('wave-', '') }) : (isSingularEvent ? '' : t('site.all_waves_prefix'));

    let content = `
        <div style="margin-bottom: 8px">
            ${t('site.date_label')} ${formatIsoToShortDate(siteGeocode.date, siteGeocode.timezone)}${countdownSuffix}${ornamentCount > 0 ? `<br/>${t('site.ornaments_label')} ${ornamentCount}` : ''}
        </div>`;

    if (hasShards) {
        // Use specific wave counters if viewing a wave, otherwise use full event counters
        let currentCounters;
        if (waveId) {
            const waveIndex = parseInt(waveId.replace('wave-', '')) - 1;
            currentCounters = siteData.waves?.[waveIndex]?.counters;
        } else {
            currentCounters = siteData?.fullEvent?.counters;
        }

        const stats: string[] = [];
        if (currentCounters) {
            const shardCounters = currentCounters.shards || { nonMoving: 0, moving: 0 };
            const totalShards = (shardCounters.nonMoving || 0) + (shardCounters.moving || 0);
            if (totalShards > 0) {
                stats.push(tChoice('site.shard_count', totalShards));
            }
            if ((currentCounters.links ?? 0) > 0) stats.push(tChoice('site.link_count', currentCounters.links!));
        }

        content += `
            <div style="margin-bottom: 12px; font-size: 0.9em; opacity: 0.8">
                <strong>${contextPrefix}</strong>${stats.join(' • ')}
            </div>
        `;
    }

    // Determine the actual time window of the shards event
    let actualStart = ZonedDateTime.epochMilliseconds(startTime);
    let actualEnd = ZonedDateTime.epochMilliseconds(endTime);

    if (siteData.waves && siteData.waves.length > 0) {
        const firstWave = siteData.waves[0];
        const lastWave = siteData.waves[siteData.waves.length - 1];
        if (firstWave.period && lastWave.period) {
            actualStart = firstWave.period.start;
            actualEnd = lastWave.period.end;
        }
    }

    content += getScoresText({
        seriesId,
        siteId,
        waveId,
        siteData,
        type: 'table',
        timezone: siteGeocode.timezone,
        eventStart: actualStart,
        eventEnd: actualEnd
    });

    const flagHtml = siteGeocode?.country_code ? getFlagTooltipHtml(siteGeocode.country_code.toLowerCase()) : '';

    return {
        title: `${seriesMetadata?.name} ${t('blueprints.event.' + siteGeocode.eventType)}<br/>${siteGeocode?.name}`,
        flagHtml,
        content
    };
}

export interface GetScoresTextOptions {
    seriesId: string;
    siteId: string;
    waveId?: string;
    siteData?: SiteData;
    type?: 'simple' | 'full' | 'table';
    timezone?: string;
    eventStart?: number;
    eventEnd?: number;
}

export function getScoresText({ seriesId, siteId, waveId, siteData, type = 'full', timezone, eventStart, eventEnd }: GetScoresTextOptions): string {
    if (!siteData) {
        siteData = getSiteData(seriesId, siteId);
    }
    if (type === 'table' && (!siteData?.waves || siteData.waves.length <= 1)) {
        type = 'full';
    }

    const fullEventScores = siteData?.fullEvent?.scores;
    if (fullEventScores) {
        switch (type) {
            case 'simple':
                return renderSimpleScores(fullEventScores);
            case 'full':
                return renderFullScores(fullEventScores);
            case 'table':
                return renderTableScores(siteData!.waves!, fullEventScores, waveId, seriesId, siteId, timezone!, eventStart!, eventEnd!);
        }
    }
    return '';
}

function renderSimpleScores(scores: { RES: number; ENL: number; MAC: number }): string {
    let html = `<span style="color:${FACTION_COLORS.RES}">${scores.RES}</span>:<span style="color:${FACTION_COLORS.ENL}">${scores.ENL}</span>`;
    if (scores.MAC > 0) {
        html += `:<span style="color:${FACTION_COLORS.MAC}">${scores.MAC}</span>`;
    }
    return html;
}

function renderFullScores(scores: { RES: number; ENL: number; MAC: number }): string {
    let html = `<span style="color:${FACTION_COLORS.RES}">${t('faction.resistance')}: ${scores.RES} </span>
            <span style="color:${FACTION_COLORS.ENL}">${t('faction.enlightened')}: ${scores.ENL} </span>`;
    if (scores.MAC > 0) {
        html += `<span style="color:${FACTION_COLORS.MAC}">${t('faction.machina')}: ${scores.MAC}</span>`;
    }
    return html;
}

function renderTableScores(waves: any[], totalScores: { RES: number; ENL: number; MAC: number }, activeWaveId: string | undefined, seriesId: string, siteId: string, timezone: string, eventStart: number, eventEnd: number): string {
    if (!waves || waves.length <= 1) return renderFullScores(totalScores);

    const hasMachinaScores = totalScores.MAC > 0 || waves.some(wave => wave.scores.MAC > 0);
    const prefix = seriesId + "-";
    const siteNavigationId = siteId.startsWith(prefix) ? siteId.substring(prefix.length) : siteId;

    let eventTimeRange = '';
    if (eventStart && eventEnd) {
        const start = formatEpochToLocalTime(eventStart, timezone);
        const end = formatEpochToLocalTime(eventEnd, timezone);
        eventTimeRange = `${start.split(':')[0]}:${start.split(':')[1]} - ${end.split(':')[0]}:${end.split(':')[1]}`;
    }

    let scoresHtml = `<table class='ingress-event-scores'>
        <thead>
            <tr data-series-id="${seriesId}" data-site-id="${siteNavigationId}">
                <th style="text-align: center">${t('site.wave')}</th>
                <th class='faction-RES'>${t('faction.resistance')}</th>
                <th class='faction-ENL'>${t('faction.enlightened')}</th>
                ${hasMachinaScores ? `<th class='faction-MAC'>${t('faction.machina')}</th>` : ''}
            </tr>
        </thead>
        <tbody>`;

    waves.forEach((wave, index) => {
        const waveNumber = index + 1;
        const waveId = `wave-${waveNumber}`;
        const isHighlighted = activeWaveId === waveId;

        let waveTime = '';
        if (wave.period) {
            const start = formatEpochToLocalTime(wave.period.start, timezone);
            const end = formatEpochToLocalTime(wave.period.end, timezone);
            waveTime = `${start.split(':')[0]}:${start.split(':')[1]} - ${end.split(':')[0]}:${end.split(':')[1]}`;
        }

        scoresHtml += `<tr${isHighlighted ? ' class="highlight"' : ''} data-series-id="${seriesId}" data-site-id="${siteNavigationId}" data-wave-id="${waveId}">
            <th style="text-align: center" title="${waveTime}">${waveNumber}</th>
            <td>${wave.scores.RES}</td>
            <td>${wave.scores.ENL}</td>
            ${hasMachinaScores ? `<td>${wave.scores.MAC}</td>` : ''}
        </tr>`;
    });

    scoresHtml += `</tbody>
        <tfoot>
            <tr data-series-id="${seriesId}" data-site-id="${siteNavigationId}">
                <th style="text-align: center" title="${eventTimeRange}">${t('site.total')}</th>
                <td class='faction-RES'>${totalScores.RES}</td>
                <td class='faction-ENL'>${totalScores.ENL}</td>
                ${hasMachinaScores ? `<td class='faction-MAC'>${totalScores.MAC}</td>` : ''}
            </tr>
        </tfoot>
    </table>`;

    return scoresHtml;
}

export function updateAllPolylineStyles(map: L.Map): void {
    if (!map || !activeSiteLayer) return;

    (activeSiteLayer as L.FeatureGroup).eachLayer(function (l) {
        if (l instanceof L.Polyline && (l as any).biDirectionalJumps) {
            applyDynamicDashArray(l, map);
        }
    });
}

// Dynamically create the dashes on links where there are bi-directional jump
function applyDynamicDashArray(polyline: L.Polyline, map: L.Map): void {
    const VISIBLE_PATTERN_PIXELS = 90;

    const latlngs = polyline.getLatLngs() as L.LatLng[];
    let totalDistancePixels = 0;

    for (let i = 0; i < latlngs.length - 1; i++) {
        const startPoint = map.latLngToLayerPoint(latlngs[i]);
        const endPoint = map.latLngToLayerPoint(latlngs[i + 1]);
        totalDistancePixels += startPoint.distanceTo(endPoint);
    }

    const G_middle_pixels = Math.max(0, totalDistancePixels - VISIBLE_PATTERN_PIXELS);

    const dashArraySegments = [
        10, 5, 5, 5, 5, 5, 5, 5,
        G_middle_pixels,
        5, 5, 5, 5, 5, 5, 5, 10
    ];

    polyline.setStyle({
        dashArray: dashArraySegments.join(',')
    });
}

function getTargetFaction(portalId: string, targets: Record<Faction, number[]> | null | undefined): Faction | null {
    if (!targets) return null;
    const pid = Number(portalId);
    if (targets.RES?.includes(pid)) return 'RES';
    if (targets.ENL?.includes(pid)) return 'ENL';
    return null;
}

function renderTargetMarkers(portals: PortalsMap, targets: Record<Faction, number[]> | null | undefined): L.Marker[] {
    const markers: L.Marker[] = [];
    if (!targets) return markers;

    const factionIcons: Record<string, string> = {
        'RES': TARGET_ARTIFACT_IDS.RES,
        'ENL': TARGET_ARTIFACT_IDS.ENL
    };

    for (const [faction, portalIds] of Object.entries(targets)) {
        const ornamentId = factionIcons[faction];
        const brand = ORNAMENT_BRANDS[ornamentId];
        if (!brand) continue;

        const style = brand.style || {};

        portalIds.forEach(id => {
            const portal = portals[id];
            if (!portal) return;

            const latLng = L.latLng(portal.lat, portal.lng);

            // 1. The Visual Target Icon
            if (style.icon) {
                markers.push(L.marker(latLng, {
                    icon: L.icon({
                        iconUrl: style.icon,
                        iconSize: (style.size as [number, number] | undefined) || [40, 40],
                        iconAnchor: style.size ? [style.size[0] / 2, style.size[1] / 2] as [number, number] : [20, 20]
                    }),
                    interactive: false,
                    pane: 'targetPane'
                }));
            }
        });
    }
    return markers;
}
