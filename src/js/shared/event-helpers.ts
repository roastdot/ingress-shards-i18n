import { getSeriesMetadata } from "../data/data-store.js";
import eventBlueprints from "../../../conf/event_blueprints.json" with { type: "json" };
import type { SiteGeocodeEntry } from "../types/domain.js";

/**
 * Returns the duration of an event in minutes by reading its mechanics blueprint.
 * Falls back to 240 minutes if metadata or mechanics cannot be resolved.
 */
export function getEventDuration(site: SiteGeocodeEntry, seriesId: string): number {
    const metadata = getSeriesMetadata(seriesId);
    if (!metadata?.shardComponents) return 240;

    const component = metadata.shardComponents.find(c => c.eventType === site.eventType);
    if (!component) return 240;

    const mechanicsId = component.shardMechanics || component.targetMechanics;
    if (!mechanicsId) return 240;
    const mechanics = eventBlueprints.mechanics.shards[mechanicsId as keyof typeof eventBlueprints.mechanics.shards]
        || eventBlueprints.mechanics.targets[mechanicsId as keyof typeof eventBlueprints.mechanics.targets];

    if (!mechanics) return 240;

    const waves: Array<{ startOffset?: number; endOffset?: number }> | undefined = mechanics.waves;
    const waveActions: Array<{ action: string; time: number }> | undefined = mechanics.waveActions;

    const lastWaveStart = waves ? Math.max(...waves.map(w => w.startOffset || 0)) : 0;

    // Based on requirement: Active time = last jump within a shards blueprint + 1 hour
    const jumpActions = waveActions?.filter(a => a.action === 'jump') || [];
    if (jumpActions.length > 0) {
        const lastJumpOffset = Math.max(...jumpActions.map(a => a.time));
        return lastWaveStart + lastJumpOffset + 1; // +1 minute
    }

    const despawnAction = waveActions?.find(a => a.action === 'despawn');
    if (despawnAction) {
        return lastWaveStart + despawnAction.time;
    }

    if (waves) {
        return Math.max(...waves.map(w => w.endOffset || 0));
    }

    return 240;
}
