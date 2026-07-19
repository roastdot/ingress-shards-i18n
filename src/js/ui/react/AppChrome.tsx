import React, { useMemo, useSyncExternalStore } from "react";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { createAppTheme } from "./theme.js";
import { getColorMode, subscribeColorMode } from "./colorModeStore.js";
import { DetailsPanelReact } from "./DetailsPanelReact.js";
import { LanguageSwitcherReact } from "./LanguageSwitcherReact.js";
import { CreditsMenuReact } from "./CreditsMenuReact.js";
import { ThemeToggleReact } from "./ThemeToggleReact.js";

export function AppChrome(): React.JSX.Element {
    const mode = useSyncExternalStore(subscribeColorMode, getColorMode);
    const theme = useMemo(() => createAppTheme(mode), [mode]);

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline enableColorScheme />
            <div className="react-ui-corner top-right">
                <CreditsMenuReact />
                <ThemeToggleReact />
                <LanguageSwitcherReact />
            </div>
            <div className="react-ui-corner bottom-right">
                <DetailsPanelReact />
            </div>
        </ThemeProvider>
    );
}
