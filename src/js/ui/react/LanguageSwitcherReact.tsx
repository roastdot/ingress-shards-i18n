import React from "react";
import Paper from "@mui/material/Paper";
import { SUPPORTED_LOCALES, getLocale, setLocale } from "../../i18n/index.js";

// ponytail: native <select>, reload on change. Custom dropdown would just re-invent the browser.
export function LanguageSwitcherReact(): React.JSX.Element {
    const current = getLocale();

    const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        if (value && value !== getLocale()) {
            setLocale(value);
            window.location.reload();
        }
    };

    return (
        <Paper className="leaflet-language-switcher">
            <select className="leaflet-language-switcher-select" title="Language" defaultValue={current} onChange={onChange}>
                {SUPPORTED_LOCALES.map((locale) => (
                    <option key={locale.code} value={locale.code}>{locale.name}</option>
                ))}
            </select>
        </Paper>
    );
}
