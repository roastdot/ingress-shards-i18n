import * as L from "leaflet";
import { SUPPORTED_LOCALES, getLocale, setLocale } from "../i18n/index.js";

// ponytail: native <select>, reload on change. Custom dropdown would just re-invent the browser.
L.Control.LanguageSwitcher = L.Control.extend({
    options: {
        position: 'topright',
    },

    onAdd: function () {
        this._container = L.DomUtil.create('div', 'leaflet-language-switcher');

        const select = L.DomUtil.create('select', 'leaflet-language-switcher-select', this._container);
        select.title = 'Language';

        const current = getLocale();
        for (const locale of SUPPORTED_LOCALES) {
            const option = L.DomUtil.create('option', '', select);
            option.value = locale.code;
            option.textContent = locale.name;
            if (locale.code === current) {
                option.selected = true;
            }
        }

        L.DomEvent.on(select, 'change', (e) => {
            L.DomEvent.stop(e);
            const value = e.target.value;
            if (value && value !== getLocale()) {
                setLocale(value);
                window.location.reload();
            }
        });

        L.DomEvent.disableClickPropagation(this._container);
        L.DomEvent.disableScrollPropagation(this._container);

        return this._container;
    },
});

export const languageSwitcherControl = function (options) {
    return new L.Control.LanguageSwitcher(options);
};