import * as Instant from "temporal-polyfill/fns/instant";
import * as ZonedDateTime from "temporal-polyfill/fns/zoneddatetime";
import { calculateShardActionSchedule, formatZonedDateTimeWithMs, formatDurationMs } from "./data-helpers.js";

/**
 * Calculates statistics for the entire season/series.
 */
export function calculateStatisticsForSeason(seriesHistory: Record<string, any>, seriesConfig: any, blueprints: any): any[] {
    const sites = Object.values(seriesHistory);
    const allStats: any[] = [];
    sites.forEach((site: any) => {
        const siteStats = calculateSiteStatistics(site, seriesConfig, blueprints);
        if (siteStats) {
            allStats.push(...siteStats);
        }
    });
    return allStats;
}

/**
 * Calculates and displays action timing statistics for a single site.
 */
function calculateSiteStatistics(site: any, seriesConfig: any, blueprints: any): any[] | null {
    if (site.waves?.length > 0 && site.geocode) {

        const siteEventType = site.geocode.eventType;
        const componentConfig = seriesConfig.shardComponents?.find((et: any) => et.eventType === siteEventType);
        if (!componentConfig) return null;

        const shardMechanic = (blueprints.mechanics?.shards || blueprints.shardMechanics)[componentConfig.shardMechanics];
        if (!shardMechanic) return null;

        const shardActionSchedule = calculateShardActionSchedule(shardMechanic, site.geocode);
        const actionStats: Record<string, any> = {};

        for (const [waveIndex, wave] of site.waves.entries()) {
            const expectedWaveSchedule = [...shardActionSchedule.waves[waveIndex]];

            for (const shard of wave.shards) {
                const scheduleCopy = [...expectedWaveSchedule];

                for (const historyItem of shard.history) {
                    const inst = Instant.fromEpochMilliseconds(Number(historyItem.moveTime));
                    const zonedDateTime = Instant.toZonedDateTimeISO(inst, site.geocode.timezone);

                    const matches = scheduleCopy.map((scheduledItem: any, index: number) => {
                        const isActionMatch =
                            (scheduledItem.action === "spawn" && historyItem.reason === "spawn") ||
                            (scheduledItem.action === "despawn" && historyItem.reason === "despawn") ||
                            (scheduledItem.action === "jump" && ["link", "jump", "no move"].includes(historyItem.reason));

                        if (!isActionMatch) return null;

                        const diffMs = Math.abs(
                            ZonedDateTime.epochMilliseconds(zonedDateTime) -
                            ZonedDateTime.epochMilliseconds(scheduledItem.time)
                        );
                        return diffMs <= 1800000 ? { index, diffMs, scheduledItem } : null;
                    }).filter((m): m is { index: number; diffMs: number; scheduledItem: any } => m !== null);

                    if (matches.length > 0) {
                        matches.sort((a: any, b: any) => a.diffMs - b.diffMs);
                        const bestMatch = matches[0];
                        const matchedScheduledItem = scheduleCopy.splice(bestMatch.index, 1)[0];
                        const diffMs = ZonedDateTime.epochMilliseconds(zonedDateTime) - ZonedDateTime.epochMilliseconds(matchedScheduledItem.time);

                        const reason = matchedScheduledItem.action;
                        const waveNumber = waveIndex + 1;
                        const scheduledTimeStr = ZonedDateTime.toLocaleString(matchedScheduledItem.time, "en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hourCycle: "h23"
                        });
                        const key = `${waveNumber}_${scheduledTimeStr}_${reason}`;
                        if (!actionStats[key]) {
                            actionStats[key] = {
                                wave: waveNumber,
                                scheduledTimeStr: scheduledTimeStr,
                                scheduledTimeZoned: matchedScheduledItem.time,
                                action: reason,
                                times: [],
                                latencies: []
                            };
                        }
                        actionStats[key].times.push(zonedDateTime);
                        actionStats[key].latencies.push(diffMs);
                    }
                }
            }
        }

        const tableData: any[] = [];
        const sortedKeys = Object.keys(actionStats).sort((keyA, keyB) => {
            const statsA = actionStats[keyA];
            const statsB = actionStats[keyB];
            if (statsA.wave !== statsB.wave) {
                return statsA.wave - statsB.wave;
            }
            const timeA = ZonedDateTime.epochMilliseconds(statsA.scheduledTimeZoned);
            const timeB = ZonedDateTime.epochMilliseconds(statsB.scheduledTimeZoned);
            if (timeA !== timeB) {
                return timeA - timeB;
            }
            return statsA.action.localeCompare(statsB.action);
        });

        for (const key of sortedKeys) {
            const stats = actionStats[key];
            if (stats.times.length === 0) continue;

            stats.times.sort((a: any, b: any) => ZonedDateTime.epochMilliseconds(a) - ZonedDateTime.epochMilliseconds(b));

            const firstTime = stats.times[0];
            const lastTime = stats.times[stats.times.length - 1];

            const formattedFirst = formatZonedDateTimeWithMs(firstTime);
            const formattedLast = formatZonedDateTimeWithMs(lastTime);

            const durationMs = ZonedDateTime.epochMilliseconds(lastTime) - ZonedDateTime.epochMilliseconds(firstTime);
            const avgIntervalMs = durationMs / stats.times.length;
            const avgIntervalStr = formatDurationMs(avgIntervalMs, true);

            const sumLatencyMs = stats.latencies.reduce((sum: number, val: number) => sum + Math.abs(val), 0);
            const avgLatencyMs = sumLatencyMs / stats.latencies.length;
            const avgLatencyStr = formatDurationMs(avgLatencyMs, true);

            tableData.push({
                "Season": seriesConfig.id,
                "Site": site.geocode.id,
                "Wave": stats.wave,
                "Scheduled": stats.scheduledTimeStr,
                "Action": stats.action,
                "Count": stats.times.length,
                "First Action": formattedFirst,
                "Last Action": formattedLast,
                "Avg Interval": avgIntervalStr,
                "Avg Latency": avgLatencyStr
            });
        }

        let totalActualActions = 0;
        let totalExpectedActions = 0;
        for (const [waveIndex, wave] of site.waves.entries()) {
            const expectedWaveSchedule = shardActionSchedule.waves[waveIndex];
            for (const shard of wave.shards) {
                totalActualActions += shard.history.length;
                totalExpectedActions += expectedWaveSchedule.length;
            }
        }

        const spawnLatencies: number[] = [];
        const jumpLatencies: number[] = [];
        for (const stats of Object.values(actionStats)) {
            if (stats.action === 'spawn') {
                spawnLatencies.push(...stats.latencies);
            } else if (stats.action === 'jump') {
                jumpLatencies.push(...stats.latencies);
            }
        }

        const avgSpawnMs = spawnLatencies.length > 0 ? (spawnLatencies.reduce((sum, val) => sum + Math.abs(val), 0) / spawnLatencies.length) : null;
        const avgJumpMs = jumpLatencies.length > 0 ? (jumpLatencies.reduce((sum, val) => sum + Math.abs(val), 0) / jumpLatencies.length) : null;

        const avgSpawnStr = avgSpawnMs !== null ? formatDurationMs(avgSpawnMs, true) : 'N/A';
        const avgJumpStr = avgJumpMs !== null ? formatDurationMs(avgJumpMs, true) : 'N/A';

        console.log(`ℹ️ Site ${site.geocode.id} average times - Spawn: ${avgSpawnStr}, Jump: ${avgJumpStr}`);

        return tableData;
    }
    return null;
}
