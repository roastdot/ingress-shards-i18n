import React, { useState, useSyncExternalStore } from "react";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Tooltip from "@mui/material/Tooltip";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import RepeatRoundedIcon from "@mui/icons-material/RepeatRounded";
import { t } from "../../i18n/index.js";
import {
    getAnimationControlState,
    setAnimationSpeed,
    subscribeAnimationControls,
    toggleAnimationLinkSelection,
    toggleAnimationLoop,
    toggleAnimationPlayback,
    type AnimationSpeed,
} from "./animationControlStore.js";

export function AnimationControlsReact(): React.JSX.Element | null {
    const state = useSyncExternalStore(subscribeAnimationControls, getAnimationControlState);
    const [speedAnchor, setSpeedAnchor] = useState<HTMLElement | null>(null);
    if (!state.available) return null;

    const isPlaying = state.playback === 'playing';
    const playbackLabel = t(isPlaying ? 'map.animation_pause' : 'map.animation_play');
    const loopLabel = t(state.loop ? 'map.animation_loop_disable' : 'map.animation_loop_enable');
    const linkLabel = t(state.linkSelectionEnabled ? 'map.animation_all_links' : 'map.animation_select_link');
    const speedLabel = t('map.animation_speed', { speed: state.speed });
    const speeds: AnimationSpeed[] = [0.5, 1, 2, 4];

    return (
        <>
            <Paper className="animation-controls" elevation={0}>
                <Tooltip title={playbackLabel} placement="left">
                    <IconButton aria-label={playbackLabel} onClick={toggleAnimationPlayback}>
                        {isPlaying ? <PauseRoundedIcon /> : <PlayArrowRoundedIcon />}
                    </IconButton>
                </Tooltip>
                <Tooltip title={loopLabel} placement="left">
                    <IconButton
                        aria-label={loopLabel}
                        aria-pressed={state.loop}
                        className={state.loop ? 'is-active' : undefined}
                        onClick={toggleAnimationLoop}
                    >
                        <RepeatRoundedIcon />
                    </IconButton>
                </Tooltip>
                <Tooltip title={speedLabel} placement="left">
                    <IconButton
                        aria-label={speedLabel}
                        aria-controls={speedAnchor ? 'animation-speed-menu' : undefined}
                        aria-expanded={Boolean(speedAnchor)}
                        onClick={event => setSpeedAnchor(event.currentTarget)}
                    >
                        <span className="animation-speed-label">{state.speed}×</span>
                    </IconButton>
                </Tooltip>
                <Tooltip title={linkLabel} placement="left">
                    <IconButton
                        aria-label={linkLabel}
                        aria-pressed={state.linkSelectionEnabled}
                        className={state.linkSelectionEnabled ? 'is-active' : undefined}
                        onClick={toggleAnimationLinkSelection}
                    >
                        <LinkRoundedIcon />
                    </IconButton>
                </Tooltip>
            </Paper>
            <Menu
                id="animation-speed-menu"
                anchorEl={speedAnchor}
                open={Boolean(speedAnchor)}
                onClose={() => setSpeedAnchor(null)}
                slotProps={{ paper: { className: 'animation-speed-menu-paper' } }}
            >
                {speeds.map(speed => (
                    <MenuItem
                        key={speed}
                        selected={state.speed === speed}
                        onClick={() => {
                            setAnimationSpeed(speed);
                            setSpeedAnchor(null);
                        }}
                    >
                        {speed}×
                    </MenuItem>
                ))}
            </Menu>
        </>
    );
}
