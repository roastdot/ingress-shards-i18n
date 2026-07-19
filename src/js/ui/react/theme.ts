import { createTheme, type Theme } from "@mui/material/styles";
import type { ColorMode } from "./colorModeStore.js";

// Palette values mirror the CSS custom properties in src/assets/main.css
// (the "dark glass" design system already applied to the map's own Leaflet
// controls/tooltips/popups, plus its light-theme counterpart) so the React
// chrome and the map chrome read as one system rather than two competing
// looks, in either color mode.
const GLASS = {
    dark: {
        bg: "#0d1117",
        border: "rgba(255, 204, 0, 0.18)",
        shadow: "0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 204, 0, 0.05)",
        default: "#0d1117",
        textPrimary: "#e8edf2",
        textSecondary: "#9aa7b5",
    },
    light: {
        bg: "#ffffff",
        border: "#cbd5e1",
        shadow: "0 10px 28px rgba(15, 23, 42, 0.18), 0 1px 3px rgba(15, 23, 42, 0.12)",
        default: "#f8fafc",
        textPrimary: "#1a1f27",
        textSecondary: "#334155",
    },
} as const;

export function createAppTheme(mode: ColorMode): Theme {
    const tokens = GLASS[mode];

    return createTheme({
        palette: {
            mode,
            primary: { main: "#0088FF" }, // RES blue
            secondary: { main: "#FFCC00" }, // signal yellow
            success: { main: "#03DC03" }, // ENL green
            error: { main: "#FF0028" }, // MAC red
            warning: { main: "#FF6600" }, // NEU orange
            background: {
                default: tokens.default,
                paper: tokens.bg,
            },
            text: {
                primary: tokens.textPrimary,
                secondary: tokens.textSecondary,
            },
        },
        shape: {
            borderRadius: 10,
        },
        typography: {
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
            button: {
                textTransform: "none",
            },
        },
        components: {
            MuiPaper: {
                styleOverrides: {
                    root: {
                        backgroundImage: "none",
                        backdropFilter: "blur(14px) saturate(1.2)",
                        WebkitBackdropFilter: "blur(14px) saturate(1.2)",
                        border: `1px solid ${tokens.border}`,
                        boxShadow: tokens.shadow,
                    },
                },
            },
            MuiMenu: {
                defaultProps: {
                    slotProps: {
                        paper: { elevation: 0 },
                    },
                },
            },
        },
    });
}
