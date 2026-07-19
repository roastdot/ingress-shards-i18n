import type { SeriesResult } from "../../types/domain.js";

export interface SeasonScoreState {
    seriesName: string;
    displayScore: SeriesResult["displayScore"];
    sourceUrl: string;
}

type Listener = () => void;

let state: SeasonScoreState | null = null;
const listeners = new Set<Listener>();

export function updateSeasonScore(stateUpdate: SeasonScoreState | null): void {
    state = stateUpdate;
    listeners.forEach((listener) => listener());
}

export function getSeasonScoreSnapshot(): SeasonScoreState | null {
    return state;
}

export function subscribeSeasonScore(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
