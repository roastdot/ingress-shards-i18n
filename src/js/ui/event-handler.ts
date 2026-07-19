import type * as L from "leaflet";

export const IS_TOUCH_SUPPORTED = isTouchDevice();
export const LAST_INPUT_WAS_TOUCH = false;

function isTouchDevice(): boolean {
    return (('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        (navigator.msMaxTouchPoints ?? 0) > 0);
}

let preventSimulatedMouseEvent = false;
window._inputSuppressTimer = null;
const SUPPRESS_DELAY_MS = 750;

document.addEventListener('touchstart', function () {
    window.LAST_INPUT_WAS_TOUCH = true;

    preventSimulatedMouseEvent = true;

    clearTimeout(window._inputSuppressTimer ?? undefined);
    window._inputSuppressTimer = setTimeout(() => {
        preventSimulatedMouseEvent = false;
    }, SUPPRESS_DELAY_MS);
}, { passive: true, capture: true });

document.addEventListener('mousedown', function (e) {
    if (preventSimulatedMouseEvent) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
    }

    window.LAST_INPUT_WAS_TOUCH = false;
}, { capture: true });

type InteractiveLayer = L.Layer & { closeTooltip(): unknown; openTooltip(): unknown };

export function addEventInteraction(element: InteractiveLayer, eventType: string, callback: L.LeafletEventHandlerFn): void {
    if (eventType !== 'click') {
        element.on(eventType, callback);
        return;
    }

    if (!IS_TOUCH_SUPPORTED) {
        element.on('click', callback);
        return;
    }

    let clickTimer: ReturnType<typeof setTimeout> | null = null;
    const DOUBLE_CLICK_DELAY = 300;

    element.on('click', function (this: InteractiveLayer, e) {
        if (!window.LAST_INPUT_WAS_TOUCH) {
            callback(e);
            return;
        }

        if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
            this.closeTooltip();
            callback(e);
        } else {
            this.openTooltip();

            clickTimer = setTimeout(() => {
                clickTimer = null;
            }, DOUBLE_CLICK_DELAY);
        }
    });
}
