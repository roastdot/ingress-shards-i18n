import { t } from "../../i18n/index.js";
import type { DetailsPanelContent } from "../series-renderer.js";

type Listener = () => void;

function emptyState(): DetailsPanelContent {
    return { title: t('details.title'), content: t('details.placeholder') };
}

let state: DetailsPanelContent = emptyState();
const listeners = new Set<Listener>();

export function updateDetailsPanel(content: DetailsPanelContent): void {
    state = content;
    listeners.forEach((listener) => listener());
}

export function clearDetailsPanel(): void {
    updateDetailsPanel(emptyState());
}

export function getDetailsPanelSnapshot(): DetailsPanelContent {
    return state;
}

export function subscribeDetailsPanel(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
