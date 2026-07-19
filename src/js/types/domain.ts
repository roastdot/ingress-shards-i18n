// Shared domain shapes for the shard-jump dataset. Deliberately loose
// (index signatures, `unknown`/`any` for deep raw-Ingress-JSON payloads)
// rather than an exhaustive schema — see the TypeScript migration plan's
// "pragmatic typing" note.

export type Faction = "RES" | "ENL" | "MAC" | "NEU" | string;

export interface Scores {
    RES: number;
    ENL: number;
    MAC: number;
    [key: string]: number;
}

export interface Portal {
    lat: number;
    lng: number;
    title?: string;
    ornamentId?: string;
    guid?: string;
    [key: string]: unknown;
}

export type PortalsMap = Record<string, Portal>;

export interface HistoryItem {
    reason: string;
    moveTime: number;
    portalId: string | number;
    dest?: string | number;
    team?: Faction;
    [key: string]: unknown;
}

export interface Shard {
    id: string | number;
    history: HistoryItem[];
    [key: string]: unknown;
}

export interface ShardPathLink {
    team?: Faction;
    linkTime: number;
    moves: Array<{ origin: string | number; moveTime: number; shardId: string | number; points: number }>;
    [key: string]: unknown;
}

export interface ShardPath {
    distance: number;
    links?: ShardPathLink[];
    jumps?: Array<{ origin: string | number; moveTime: number; shardId: string | number }>;
    [key: string]: unknown;
}

export interface EventCounters {
    shards?: { nonMoving?: number; moving?: number };
    links?: number;
    [key: string]: unknown;
}

export interface ShardEvent {
    shards?: Shard[];
    shardPaths?: Record<string, ShardPath>;
    scores?: Scores;
    counters?: EventCounters;
    targets?: Record<Faction, number[]>;
    period?: { start: number; end: number };
    [key: string]: unknown;
}

export interface SiteData {
    portals?: PortalsMap;
    fullEvent?: ShardEvent;
    waves?: ShardEvent[];
    geocode: SiteGeocodeEntry;
    [key: string]: unknown;
}

export type SeriesSiteData = Record<string, SiteData>;

export interface SiteGeocodeEntry {
    id: string;
    lat: number;
    lng: number;
    name: string;
    date: string;
    timezone: string;
    eventType: string;
    country_code?: string;
    [key: string]: unknown;
}

// Shape as read from gen/series_geocode.json (sites as an array).
export interface SeriesGeocodeRaw {
    sites: SiteGeocodeEntry[];
    [key: string]: unknown;
}

// Shape as cached in the data store (sites indexed by id).
export interface SeriesGeocode {
    sites: Record<string, SiteGeocodeEntry>;
}

export interface ShardComponent {
    eventType: string;
    shardMechanics?: string;
    targetMechanics?: string;
    [key: string]: unknown;
}

export interface SeriesMetadata {
    id: string;
    name: string;
    year?: number;
    defaultView?: boolean;
    overviewUrl?: string;
    shardComponents?: ShardComponent[];
    [key: string]: unknown;
}

export interface SeriesMetadataFile {
    series: SeriesMetadata[];
    [key: string]: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventBlueprints = any;
