import React, { useState } from "react";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import LanguageIcon from "@mui/icons-material/Language";
import { SUPPORTED_LOCALES, getLocale, setLocale } from "../../i18n/index.js";

const ROUTE_RESTORE_PARAM = 'ism-route';

export function LanguageSwitcherReact(): React.JSX.Element {
    const current = getLocale();
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    const selectLocale = (value: string) => {
        setAnchorEl(null);
        if (value && value !== getLocale()) {
            const currentRoute = window.location.hash || '#/';
            setLocale(value);

            const reloadUrl = new URL(window.location.href);
            reloadUrl.searchParams.set(ROUTE_RESTORE_PARAM, currentRoute);
            reloadUrl.hash = currentRoute;
            window.location.replace(reloadUrl.toString());
        }
    };

    return (
        <>
            <Paper className="leaflet-language-switcher">
                <IconButton
                    size="small"
                    aria-label="Language"
                    aria-haspopup="menu"
                    aria-expanded={Boolean(anchorEl)}
                    onClick={(event) => setAnchorEl(event.currentTarget)}
                >
                    <LanguageIcon fontSize="small" />
                </IconButton>
            </Paper>
            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={() => setAnchorEl(null)}
                anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{ paper: { className: 'language-menu-paper' } }}
            >
                {SUPPORTED_LOCALES.map((locale) => (
                    <MenuItem
                        key={locale.code}
                        selected={locale.code === current}
                        onClick={() => selectLocale(locale.code)}
                    >
                        {locale.name}
                    </MenuItem>
                ))}
            </Menu>
        </>
    );
}
