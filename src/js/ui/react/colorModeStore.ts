export type ColorMode = "light" | "dark";

const STORAGE_KEY = "ism-color-mode";

type Listener = () => void;

function isColorMode(value: unknown): value is ColorMode {
    return value === "light" || value === "dark";
}

function pickInitialMode(): ColorMode {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (isColorMode(stored)) return stored;
    } catch {
        // ponytail: localStorage may be unavailable (private mode); ignore
    }
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
        return 'light';
    }
    return 'dark';
}

let currentMode: ColorMode = pickInitialMode();
const listeners = new Set<Listener>();

function applyToDocument(mode: ColorMode): void {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', mode);
}

applyToDocument(currentMode);

export function getColorMode(): ColorMode {
    return currentMode;
}

export function setColorMode(mode: ColorMode): void {
    if (mode === currentMode) return;
    currentMode = mode;
    try {
        localStorage.setItem(STORAGE_KEY, mode);
    } catch {
        // ponytail: localStorage may be unavailable (private mode); ignore
    }
    applyToDocument(mode);
    listeners.forEach((listener) => listener());
}

export function toggleColorMode(): void {
    setColorMode(currentMode === 'dark' ? 'light' : 'dark');
}

export function subscribeColorMode(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
