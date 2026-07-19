// Ambient shims for third-party packages that ship no type declarations of
// their own. These are intentionally untyped (`any`) — see the "pragmatic
// typing" note in the project's TypeScript migration plan. Full type
// definitions for these Leaflet plugins aren't worth authoring by hand;
// call sites that touch their dynamically-added APIs (`L.motion`,
// `L.tileLayer.provider`, `L.Control.extend(...)` subclassing) use targeted
// `any` casts instead.

declare module "leaflet-providers";
declare module "leaflet.motion";

declare module "*.png" {
    const src: string;
    export default src;
}

declare module "*.webp" {
    const src: string;
    export default src;
}

declare module "*.svg" {
    const src: string;
    export default src;
}

declare module "*.css";

declare const __APP_VERSION__: string;

// Minimal ambient shape for the one dedicated-worker entry point in this
// project — deliberately not pulling in the full "webworker" lib, which
// conflicts with "dom" (used everywhere else) in the same program.
interface WorkerGlobalScopeLike {
    onmessage: ((ev: MessageEvent) => unknown) | null;
    postMessage(message: unknown): void;
}

interface Window {
    LAST_INPUT_WAS_TOUCH?: boolean;
    _inputSuppressTimer?: ReturnType<typeof setTimeout> | null;
}

interface Navigator {
    msMaxTouchPoints?: number;
}
