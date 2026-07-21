const MIN_LINK_ARC_METERS = 30;
const MAX_LINK_ARC_METERS = 250;
const LINK_ARC_DISTANCE_RATIO = 0.08;
const MAX_TERRAIN_RING_RADIUS_METERS = 24;
const EARTH_RADIUS_METERS = 6_378_137;

/**
 * Vertical offset for one portal-to-portal hop.
 *
 * The parabola is exactly zero at both portals and reaches its peak halfway
 * through the hop, so the rendered link visibly connects to its endpoints.
 */
export function getLinkArcOffsetMeters(progress: number, distanceMeters: number): number {
    const t = Math.max(0, Math.min(1, progress));
    if (t === 0 || t === 1) return 0;

    const peakHeight = Math.max(
        MIN_LINK_ARC_METERS,
        Math.min(MAX_LINK_ARC_METERS, distanceMeters * LINK_ARC_DISTANCE_RATIO),
    );
    return peakHeight * 4 * t * (1 - t);
}

/** Interpolates across the short side of the antimeridian. */
export function interpolateLongitude(from: number, to: number, progress: number): number {
    const t = Math.max(0, Math.min(1, progress));
    const delta = ((to - from + 540) % 360) - 180;
    return ((from + delta * t + 540) % 360) - 180;
}

/** Converts Leaflet's screen-pixel marker radius to a bounded 3D world radius. */
export function leafletRadiusToTerrainMeters(
    radiusPixels: number,
    latitude: number,
    zoom: number,
): number {
    const metersPerPixel = 156_543.03392 * Math.cos(latitude * Math.PI / 180) / (2 ** zoom);
    return Math.max(0.5, Math.min(MAX_TERRAIN_RING_RADIUS_METERS, radiusPixels * metersPerPixel));
}

/** Builds a closed geodesic ring that Cesium can drape over terrain. */
export function getTerrainRingCoordinates(
    longitude: number,
    latitude: number,
    radiusMeters: number,
    segments = 32,
): Array<{ lng: number; lat: number }> {
    const centerLatitude = latitude * Math.PI / 180;
    const centerLongitude = longitude * Math.PI / 180;
    const angularDistance = radiusMeters / EARTH_RADIUS_METERS;
    const coordinates: Array<{ lng: number; lat: number }> = [];

    for (let index = 0; index < segments; index++) {
        const bearing = index * 2 * Math.PI / segments;
        const ringLatitude = Math.asin(
            Math.sin(centerLatitude) * Math.cos(angularDistance)
            + Math.cos(centerLatitude) * Math.sin(angularDistance) * Math.cos(bearing),
        );
        const ringLongitude = centerLongitude + Math.atan2(
            Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(centerLatitude),
            Math.cos(angularDistance) - Math.sin(centerLatitude) * Math.sin(ringLatitude),
        );
        coordinates.push({
            lng: ((ringLongitude * 180 / Math.PI + 540) % 360) - 180,
            lat: ringLatitude * 180 / Math.PI,
        });
    }
    if (coordinates.length > 0) coordinates.push({ ...coordinates[0] });
    return coordinates;
}

/** Stable overview center: circular longitude mean with an arithmetic latitude mean. */
export function getSeriesGlobeCenter(locations: Array<{ lat: number; lng: number }>): [number, number] {
    let sinLng = 0;
    let cosLng = 0;
    let latTotal = 0;
    for (const location of locations) {
        const lng = location.lng * Math.PI / 180;
        sinLng += Math.sin(lng);
        cosLng += Math.cos(lng);
        latTotal += location.lat;
    }
    const latitude = latTotal / locations.length;
    if (Math.hypot(sinLng, cosLng) < 1e-6) return [0, latitude];
    return [Math.atan2(sinLng, cosLng) * 180 / Math.PI, latitude];
}
