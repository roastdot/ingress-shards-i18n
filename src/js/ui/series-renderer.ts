import * as L from "leaflet";
import { CUSTOM_SERIES_ID, EVENT_BRANDS } from "../constants.js";
import { t, tChoice } from "../i18n/index.js";
import { addEventInteraction } from "./event-handler.js";
import { navigate } from "../router.js";
import { getScoresText } from "./site-renderer.js";
import { getSeriesMetadata, getSeriesGeocode, getSiteData, getAllSeriesIds } from "../data/data-store.js";
import { formatIsoToShortDate, getTimeRemaining, getActiveEventRemaining } from "../shared/date-helpers.js";
import { getFlagTooltipHtml } from "./ui-formatters.js";
import * as ZonedDateTime from "temporal-polyfill/fns/zoneddatetime";
import * as Now from "temporal-polyfill/fns/now";
import * as Duration from "temporal-polyfill/fns/duration";
import { getEventDuration } from "../shared/event-helpers.js";
import enlightenedLogoUrl from "../../images/faction-enlightened.svg";
import resistanceLogoUrl from "../../images/faction-resistance.svg";
import anomalyLogoUrl from "../../images/xm-anomaly.webp";
import shardLogoUrl from "../../images/shard.svg";
import type { SiteGeocodeEntry, SiteData } from "../types/domain.js";

interface SeriesLayer extends L.FeatureGroup {
    _layerType?: string;
    _seriesId?: string;
}

interface SiteMarker extends L.Marker {
    _siteId?: string;
}

const seriesLayerCache = new Map<string, SeriesLayer>();
const eventLogoUrls: Record<string, string> = {
    ANOMALY: anomalyLogoUrl,
};

export function getLocalizedSeriesName(seriesId: string, fallback?: string): string {
    if (seriesId === CUSTOM_SERIES_ID) return t('custom.series_name');
    return fallback || seriesId;
}

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'images/markers/marker-icon-2x.png',
    iconUrl: 'images/markers/marker-icon.png',
    shadowUrl: 'images/markers/marker-shadow.png',
});

function getOutcome(siteData: SiteData | undefined): string {
    const scores = siteData?.fullEvent?.scores;
    if (!scores) return 'NONE';
    if (scores.RES > scores.ENL) return 'RES';
    if (scores.ENL > scores.RES) return 'ENL';
    if (scores.RES > 0 || scores.ENL > 0) return 'TIE';
    return 'NONE';
}


function isEventActive(site: SiteGeocodeEntry, seriesId: string): boolean {
    const durationMins = getEventDuration(site, seriesId);

    const startTime = ZonedDateTime.fromString(site.date);
    const endTime = ZonedDateTime.add(startTime, Duration.fromFields({ minutes: durationMins }));
    const now = Now.zonedDateTimeISO(site.timezone);

    return ZonedDateTime.compare(now, startTime) >= 0 && ZonedDateTime.compare(now, endTime) <= 0;
}

function renderSeriesLayer(seriesId: string): SeriesLayer {
    const seriesLayer: SeriesLayer = L.featureGroup();
    seriesLayer._layerType = 'series';
    seriesLayer._seriesId = seriesId;

    const geocode = getSeriesGeocode(seriesId);
    if (!geocode?.sites) {
        return seriesLayer;
    }

    for (const site of Object.values(geocode.sites)) {
        const siteData = getSiteData(seriesId, site.id);
        const hasFragments = (siteData?.fullEvent?.shards?.length ?? 0) > 0;
        const hasOrnaments = Object.values(siteData?.portals || {}).some(p => p.ornamentId);

        const startTime = ZonedDateTime.fromString(site.date);
        const now = Now.zonedDateTimeISO(site.timezone);

        let phaseClass = '';
        let outcome = 'NONE';

        if (hasFragments) {
            // Outcome phase: Shard jump data is available
            outcome = getOutcome(siteData);
            phaseClass = `is-phase-outcome outcome-${outcome.toLowerCase()}`;
        } else if (isEventActive(site, seriesId)) {
            // Active phase: Event is happening now
            phaseClass = 'is-phase-active';
        } else if (ZonedDateTime.compare(now, startTime) < 0) {
            // Scheduled sites should look pending, not disabled or cancelled.
            phaseClass = 'is-phase-upcoming';
        } else {
            // Past sites with no outcome data yet
            phaseClass = 'is-phase-nodata';
        }

        const factionLogoUrl = outcome === 'RES'
            ? resistanceLogoUrl
            : outcome === 'ENL'
                ? enlightenedLogoUrl
                : null;
        const eventLogoUrl = eventLogoUrls[site.eventType] || shardLogoUrl;
        const isAnomalyMarker = site.eventType === 'ANOMALY';
        const eventTypeLabel = t('blueprints.event.' + site.eventType);
        const winnerBadgeHtml = factionLogoUrl
            ? `<span class="event-winner-badge faction-${outcome}" title="${t(`faction.${outcome === 'RES' ? 'resistance' : 'enlightened'}`)}"><img src="${factionLogoUrl}" alt="${outcome}" /></span>`
            : '';
        const markerOptions: L.MarkerOptions = {
            icon: L.divIcon({
                className: `event-composite-marker ${isAnomalyMarker ? 'event-composite-anomaly' : 'event-composite-shard'} ${phaseClass}`,
                iconSize: isAnomalyMarker ? [50, 54] : [42, 46],
                iconAnchor: isAnomalyMarker ? [25, 52] : [21, 44],
                tooltipAnchor: isAnomalyMarker ? [25, -40] : [21, -32],
                html: `<span class="event-marker-symbol"><img class="event-marker-primary" src="${eventLogoUrl}" alt="${eventTypeLabel}" />${isAnomalyMarker ? '' : `<span class="event-marker-type-label">${eventTypeLabel}</span>`}${winnerBadgeHtml}</span>`,
            })
        };

        const latLng = L.latLng(site.lat, site.lng);
        const siteMarker: SiteMarker = L.marker(latLng, markerOptions);
        siteMarker._siteId = site.id;

        const flagHtml = site.country_code ? getFlagTooltipHtml(site.country_code.toLowerCase()) : '';
        const remainingTime = getTimeRemaining(site.date, site.timezone);
        const timeRemainingText = remainingTime ? ` (${remainingTime})` : '';

        const eventDuration = getEventDuration(site, seriesId);
        const endTime = ZonedDateTime.add(startTime, Duration.fromFields({ minutes: eventDuration }));
        const completionGraceEnd = ZonedDateTime.add(endTime, Duration.fromFields({ days: 1 }));
        const isComplete = ZonedDateTime.compare(now, endTime) > 0;
        const isWithinCompletionGrace = ZonedDateTime.compare(now, completionGraceEnd) <= 0;
        const activeRemaining = getActiveEventRemaining(site.date, site.timezone, eventDuration);

        let siteTooltip = '';
        if (activeRemaining) {
            siteTooltip += `<strong>${t('series.active_status', { remaining: activeRemaining })}</strong><hr />`;
        } else if (isComplete && isWithinCompletionGrace && !hasFragments) {
            siteTooltip += `<strong>${t('series.complete_status')}</strong><hr />`;
        }

        siteTooltip += `
            ${flagHtml} <strong>${site.name}</strong><br />
            ${t('series.date_label')} ${formatIsoToShortDate(site.date, site.timezone)}${timeRemainingText}<br />
            ${t('series.type_label')} ${t('blueprints.event.' + site.eventType)}<br />`;

        if (siteData) {
            const scoresText = getScoresText({ seriesId, siteId: site.id, type: 'full' });
            if (scoresText) {
                siteTooltip += scoresText;
            } else if (hasOrnaments) {
                const count = Object.values(siteData.portals || {}).filter(portal => portal.ornamentId).length;
                siteTooltip += `<em>${tChoice('series.ornamented_portals', count)}</em>`;
            }
            const siteUrl = `#/${seriesId}/${site.id.replace(seriesId + "-", "")}`;
            addEventInteraction(siteMarker, 'click', () => { navigate(siteUrl); });
        } else if (ZonedDateTime.compare(startTime, now) < 0) {
            siteTooltip += `<em>${t('series.no_data')}</em>`;
        }
        siteMarker.bindTooltip(siteTooltip, { permanent: false, direction: 'auto' });
        siteMarker.addTo(seriesLayer);
    }
    return seriesLayer;
}

export function initSeriesLayers(): void {
    const allSeriesIds = getAllSeriesIds();
    for (const seriesId of allSeriesIds) {
        if (!seriesLayerCache.has(seriesId)) {
            seriesLayerCache.set(seriesId, renderSeriesLayer(seriesId));
        }
    }
}

export function updateCustomSeriesLayer(seriesId: string): void {
    const currentSeriesLayer = seriesLayerCache.get(seriesId);
    if (!currentSeriesLayer) return;
    const currentSiteMarkers: SiteMarker[] = [];
    currentSeriesLayer.eachLayer(function (layer) {
        if (layer instanceof L.Marker) {
            currentSiteMarkers.push(layer as SiteMarker);
        }
    });

    const updatedSeriesLayer = renderSeriesLayer(seriesId);
    updatedSeriesLayer.eachLayer(function (layer) {
        const marker = layer as SiteMarker;
        if (
            layer instanceof L.Marker &&
            marker._siteId &&
            !currentSiteMarkers.find(m => m._siteId === marker._siteId)) {
            currentSeriesLayer.addLayer(layer);
        }
    });
}

export function getSeriesLayer(seriesId: string): SeriesLayer | undefined {
    return seriesLayerCache.get(seriesId);
}

export function getSeriesControl(): L.Control.Layers {
    const controlLayers: Record<string, L.Layer> = {};
    for (const [seriesId, layer] of seriesLayerCache.entries()) {
        const metadata = getSeriesMetadata(seriesId);
        const seriesName = getLocalizedSeriesName(seriesId, metadata?.name);
        const seriesLabel = metadata?.year
            ? t('series.control_label', { year: metadata.year, name: seriesName })
            : seriesName;
        controlLayers[seriesLabel] = layer;
    }
    return L.control.layers(controlLayers, {}, { collapsed: true, position: "topleft" });
}

export interface DetailsPanelContent {
    title: string;
    flagHtml?: string;
    content: string;
    footer?: string;
}

export function getDetailsPanelContent(seriesId: string): DetailsPanelContent {
    const metadata = getSeriesMetadata(seriesId);
    const geocode = getSeriesGeocode(seriesId);
    const seriesName = getLocalizedSeriesName(seriesId, metadata?.name);

    if (!metadata || !geocode || !geocode.sites) {
        return { title: metadata?.name ? `${seriesName} ${t('series.season_suffix')}` : t('details.title'), content: `<p><em>${t('series.season_info_unavailable')}</em></p>` };
    }

    const sites = Object.values(geocode.sites);
    const sitesByEventType = sites.reduce<Record<string, SiteGeocodeEntry[]>>((groups, site) => {
        const eventType = site.eventType || 'Other';
        if (!groups[eventType]) groups[eventType] = [];
        groups[eventType].push(site);
        return groups;
    }, {});

    const typeOrder = Object.keys(EVENT_BRANDS);

    let content = '';
    if (metadata.year) {
        content += `${t('series.year_label')} ${metadata.year}<br />`;
    }
    if (metadata.overviewUrl) {
        content += `<a href="${metadata.overviewUrl}" target="_blank">${t('series.season_overview')}</a><br /><br />`;
    }

    content += `<div class="series-sites-list">`;
    content += `<input type="search" class="site-search-input" placeholder="${t('series.search_placeholder')}" />`;

    typeOrder.forEach(eventType => {
        if (sitesByEventType[eventType]) {
            const sitesOfEventType = sitesByEventType[eventType];

            content += `<h4 class="group-header group-toggle">
                    <span class="toggle-icon">▶</span>
                    ${t('series.event_sites_count', { count: sitesOfEventType.length, event: t('blueprints.event.' + eventType) })}</h4>`;
            content += `<div class="group-list collapsed-group">`;

            sitesOfEventType.forEach(site => {
                const flag = site.country_code ? getFlagTooltipHtml(site.country_code.toLowerCase()) : '';
                const siteUrl = `#/${metadata.id}/${site.id.replace(metadata.id + "-", "")}`;

                const scoresText = getScoresText({
                    seriesId: metadata.id,
                    siteId: site.id,
                    type: 'simple',
                    timezone: site.timezone
                });
                content += `
                        <button
                                class="nav-item"
                                data-route="${siteUrl}"
                                data-site-id="${site.id}"
                                id="${site.id}"
                                ${!scoresText ? 'disabled="disabled"' : ''}>
                            ${flag} ${site.name}
                        </button>
                        ${scoresText && ` ${scoresText}`}<br />`;
            });
        }
        content += `</div> `;
    });

    return {
        title: `${seriesName} ${t('series.season_suffix')}`,
        flagHtml: '',
        content,
        footer: sites.length > 0 ? t('series.select_site_prompt') : t('series.no_sites'),
    };
}

function getMarkerBySiteId(seriesLayer: SeriesLayer | undefined, siteId: string): SiteMarker | null {
    if (!seriesLayer) return null;

    let foundLayer: SiteMarker | null = null;
    seriesLayer.eachLayer(function (layer) {
        const marker = layer as SiteMarker;
        if (!foundLayer && layer instanceof L.Marker && marker._siteId === siteId) {
            foundLayer = marker;
        }
    });
    return foundLayer;
}

export function setupMarkerHover(seriesLayer: SeriesLayer | undefined): void {
    const buttons = document.querySelectorAll<HTMLButtonElement>('.details-panel-content .nav-item');

    buttons.forEach(button => {
        const siteId = button.dataset.siteId;
        if (!siteId) return;

        const targetMarker = getMarkerBySiteId(seriesLayer, siteId);
        if (targetMarker) {
            button.addEventListener('mouseover', () => { targetMarker.openTooltip(); });
            button.addEventListener('mouseout', () => { targetMarker.closeTooltip(); });
        }
    });
}
