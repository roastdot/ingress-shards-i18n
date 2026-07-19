import "leaflet/dist/leaflet.css";
import 'flag-icon-css/css/flag-icons.min.css';
import "../assets/main.css";
import { createRoot } from "react-dom/client";
import { initMap } from "./ui/map/map-manager.js";
import { initDataStore } from "./data/data-store.js";
import { initController } from "./ui/ui-controller.js";
import { initI18n } from "./i18n/index.js";
import { AppChrome } from "./ui/react/AppChrome.js";

async function initApplication(): Promise<void> {
    try {
        initI18n();

        const reactRoot = document.getElementById('react-ui-root');
        if (reactRoot) {
            createRoot(reactRoot).render(<AppChrome />);
        }

        const map = initMap();
        await initDataStore();
        initController(map);
    } catch (error) {
        console.error("Failed to start application:", error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initApplication();
});
