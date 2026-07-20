const MIN_LINK_ARC_METERS = 30;
const MAX_LINK_ARC_METERS = 250;
const LINK_ARC_DISTANCE_RATIO = 0.08;

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
