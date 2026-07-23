export type AnimationPlaybackState = 'playing' | 'paused' | 'ended';
export type AnimationSpeed = 0.5 | 1 | 2 | 4;

export interface AnimationControlState {
    available: boolean;
    playback: AnimationPlaybackState;
    loop: boolean;
    speed: AnimationSpeed;
    linkSelectionEnabled: boolean;
    selectedLinkKey: string | null;
    commandVersion: number;
}

let state: AnimationControlState = {
    available: false,
    playback: 'ended',
    loop: false,
    speed: 1,
    linkSelectionEnabled: false,
    selectedLinkKey: null,
    commandVersion: 0,
};

const listeners = new Set<() => void>();

function publish(nextState: AnimationControlState): void {
    if (
        nextState.available === state.available &&
        nextState.playback === state.playback &&
        nextState.loop === state.loop &&
        nextState.speed === state.speed &&
        nextState.linkSelectionEnabled === state.linkSelectionEnabled &&
        nextState.selectedLinkKey === state.selectedLinkKey &&
        nextState.commandVersion === state.commandVersion
    ) return;

    state = nextState;
    listeners.forEach(listener => listener());
}

export function getAnimationControlState(): AnimationControlState {
    return state;
}

export function subscribeAnimationControls(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function setAnimationAvailable(available: boolean): void {
    publish({
        ...state,
        available,
        playback: available && state.playback === 'ended' ? 'playing' : state.playback,
        selectedLinkKey: available ? state.selectedLinkKey : null,
    });
}

export function toggleAnimationPlayback(): void {
    if (!state.available) return;
    publish({
        ...state,
        playback: state.playback === 'playing' ? 'paused' : 'playing',
        commandVersion: state.commandVersion + 1,
    });
}

export function toggleAnimationLoop(): void {
    if (!state.available) return;
    publish({
        ...state,
        loop: !state.loop,
        commandVersion: state.commandVersion + 1,
    });
}

export function setAnimationSpeed(speed: AnimationSpeed): void {
    if (!state.available || state.speed === speed) return;
    publish({
        ...state,
        speed,
        commandVersion: state.commandVersion + 1,
    });
}

export function toggleAnimationLinkSelection(): void {
    if (!state.available) return;
    const linkSelectionEnabled = !state.linkSelectionEnabled;
    publish({
        ...state,
        linkSelectionEnabled,
        selectedLinkKey: linkSelectionEnabled ? state.selectedLinkKey : null,
        commandVersion: state.commandVersion + 1,
    });
}

export function selectAnimationLink(linkKey: string): void {
    if (!state.available || !state.linkSelectionEnabled || !linkKey) return;
    publish({
        ...state,
        selectedLinkKey: linkKey,
        playback: 'playing',
        commandVersion: state.commandVersion + 1,
    });
}

export function reportAnimationPlayback(playback: AnimationPlaybackState): void {
    if (!state.available || state.playback === playback) return;
    publish({ ...state, playback });
}
