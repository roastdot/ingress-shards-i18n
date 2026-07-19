import React, { useSyncExternalStore } from "react";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import { getColorMode, subscribeColorMode, toggleColorMode } from "./colorModeStore.js";
import { t } from "../../i18n/index.js";

export function ThemeToggleReact(): React.JSX.Element {
    const mode = useSyncExternalStore(subscribeColorMode, getColorMode);

    return (
        <Paper className="react-theme-toggle">
            <IconButton size="small" aria-label={t('theme.toggle')} onClick={toggleColorMode}>
                {mode === 'dark' ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
            </IconButton>
        </Paper>
    );
}
