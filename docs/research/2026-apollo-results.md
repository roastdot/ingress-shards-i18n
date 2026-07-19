# 2026 Apollo official results

Research date: 2026-07-19

## Source and status

Niantic Spatial published **“Apollo Anomaly Season - Results”** on **2026-07-16**. The page is a live results page rather than a fully finalised season summary: its July 18 XM Anomaly section says the score was updated on **2026-07-18**, while the First Saturday table still shows `???` for August and September. Therefore, the application may show the currently accumulated season points, but must not describe them as a final result. Sources: [official results page](https://ingress.com/news/2026-apollo-results), [official Ingress news index](https://ingress.com/en/news).

## Official July 18 XM Anomaly result

The official table lists factions in `Enlightened, Resistance` order. Reordered to the application's `Resistance, Enlightened` convention, the result is:

| Scope | Resistance | Enlightened |
| --- | ---: | ---: |
| Helsinki | 176.6 | 103.4 |
| Bogotá | 122.4 | 157.6 |
| **XM Anomaly total** | **299.0** | **261.0** |

These are official **season points**, not raw Shard goals, jumps, Links, Portal Ornaments, or other map counts. The map must not derive this banner by summing site-level raw data. Source: [official Apollo results, “July 18 Anomaly Results”](https://ingress.com/news/2026-apollo-results).

## Scoring breakdown

The results page breaks each site into the following scoring components:

| Site | Component | Resistance | Enlightened |
| --- | --- | ---: | ---: |
| Bogotá | Special Ops | 0.0 | 0.0 |
| Bogotá | Shard Battle | 42.6 | 57.4 |
| Bogotá | Beacon Battle | 47.2 | 52.8 |
| Bogotá | Anomaly Uniques | 32.6 | 47.4 |
| Helsinki | Special Ops | 0.0 | 0.0 |
| Helsinki | Shard Battle | 82.4 | 17.6 |
| Helsinki | Beacon Battle | 53.2 | 46.8 |
| Helsinki | Anomaly Uniques | 41.0 | 39.0 |

The Special Ops events at both sites are marked **cancelled**. The official site totals equal the sum of these component points. Source: [official Apollo results](https://ingress.com/news/2026-apollo-results).

## First Saturday is a separate, incomplete result

The same page separately reports Apollo First Saturday participation and points. As updated on **2026-07-16**, July participation is 1,564 Resistance and 1,459 Enlightened, producing 156.4 Resistance points and 145.9 Enlightened points. August and September remain unpublished (`???`). These values should be stored as a separate scoring programme with an `in_progress` status, not merged into the July 18 XM Anomaly total. Source: [official Apollo results, “Apollo First Saturday Results”](https://ingress.com/news/2026-apollo-results).

## Data-model implications

- Store official scores explicitly and attach their source URL and `updatedAt` date.
- Distinguish `xm_anomaly` from `first_saturday`. The map's current season-points display combines their published points (Resistance 455.4, Enlightened 406.9) while retaining the two source programmes separately.
- Give each programme its own status. For the current source, `xm_anomaly` can be treated as `final`, while `first_saturday` is `in_progress`.
- Preserve decimal points because official season points are fractional.
- Use stable IDs for scoring components (`special_ops`, `shard_battle`, `beacon_battle`, `anomaly_uniques`) and keep display labels outside the raw result data.
