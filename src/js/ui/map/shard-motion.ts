import type * as L from "leaflet";

interface MotionLayer extends L.Layer {
    startShardMotion?: () => void;
}

export function restartShardMotionAfterMapMove(map: L.Map, moveAction: () => void): void {
    // Initial route restoration uses a synchronous fitBounds. Register first so
    // its immediate moveend cannot pass before the animation restart listener.
    map.once("moveend", (event: L.LeafletEvent) => {
        (event.target as L.Map).eachLayer(layer => {
            (layer as MotionLayer).startShardMotion?.();
        });
    });
    moveAction();
}
