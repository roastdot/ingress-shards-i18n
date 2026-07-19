import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Paper from "@mui/material/Paper";
import IconButton from "@mui/material/IconButton";
import RemoveIcon from "@mui/icons-material/Remove";
import AddIcon from "@mui/icons-material/Add";
import { getDetailsPanelSnapshot, subscribeDetailsPanel } from "./detailsPanelStore.js";

function setupGroupToggles(containerElement: HTMLElement): () => void {
    const onClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const header = target.closest<HTMLElement>('.group-toggle');

        if (header) {
            e.preventDefault();
            const list = header.nextElementSibling;

            if (list && list.classList.contains('group-list')) {
                list.classList.toggle('collapsed-group');
                header.classList.toggle('open');
            }
        }
    };

    // ponytail: event delegation on the content container — show/hide DOM, no re-render
    const onInput = (e: Event) => {
        const target = e.target as HTMLElement;
        if (!target.classList || !target.classList.contains('site-search-input')) return;

        const query = (target as HTMLInputElement).value.toLowerCase().trim();
        const groups = containerElement.querySelectorAll<HTMLElement>('.group-header.group-toggle');

        groups.forEach(group => {
            const list = group.nextElementSibling as HTMLElement | null;
            if (!list || !list.classList.contains('group-list')) return;

            const buttons = list.querySelectorAll<HTMLElement>('.nav-item');
            let hasMatch = false;

            buttons.forEach(btn => {
                const text = btn.textContent?.toLowerCase() ?? '';
                const matches = !query || text.includes(query);
                btn.style.display = matches ? '' : 'none';
                if (matches) hasMatch = true;
            });

            group.style.display = hasMatch ? '' : 'none';
            list.style.display = hasMatch ? '' : 'none';

            if (query) {
                list.classList.remove('collapsed-group');
                group.classList.add('open');
            } else {
                list.classList.add('collapsed-group');
                group.classList.remove('open');
            }
        });
    };

    containerElement.addEventListener('click', onClick);
    containerElement.addEventListener('input', onInput);

    return () => {
        containerElement.removeEventListener('click', onClick);
        containerElement.removeEventListener('input', onInput);
    };
}

export function DetailsPanelReact(): React.JSX.Element {
    const content = useSyncExternalStore(subscribeDetailsPanel, getDetailsPanelSnapshot);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const contentRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const el = contentRef.current;
        if (!el) return;
        return setupGroupToggles(el);
    }, []);

    const cloudflareCommit = __APP_VERSION__.match(/@([0-9a-f]{7})$/)?.[1];
    const versionHref = cloudflareCommit
        ? `https://github.com/roastdot/ingress-shards.github.io/commit/${cloudflareCommit}`
        : 'https://github.com/roastdot/ingress-shards.github.io/releases';
    const versionLabel = /^\d+\.\d+\.\d+/.test(__APP_VERSION__)
        ? `v${__APP_VERSION__}`
        : __APP_VERSION__;
    const footerHtml = `${content.footer ?? ''}<div class="app-version"><a href="${versionHref}" target="ism-version">${versionLabel}</a></div>`;
    const hasScoreTable = content.content.includes('ingress-event-scores');

    return (
        <Paper className={`leaflet-details-panel${hasScoreTable ? ' score-details' : ''}${isCollapsed ? ' collapsed' : ''}`}>
            <div className="details-panel-header">
                <div className="details-panel-flag" style={{ display: content.flagHtml ? 'flex' : 'none' }} dangerouslySetInnerHTML={{ __html: content.flagHtml ?? '' }} />
                <div className="details-panel-title">
                    <h4 dangerouslySetInnerHTML={{ __html: content.title }} />
                </div>
                <IconButton
                    className="details-panel-toggle"
                    size="small"
                    aria-label={isCollapsed ? 'Expand details' : 'Collapse details'}
                    onClick={() => setIsCollapsed(v => !v)}
                >
                    {isCollapsed ? <AddIcon fontSize="inherit" /> : <RemoveIcon fontSize="inherit" />}
                </IconButton>
            </div>
            <div className="details-panel-content" ref={contentRef} dangerouslySetInnerHTML={{ __html: content.content }} />
            <div className="details-panel-footer" dangerouslySetInnerHTML={{ __html: footerHtml }} />
        </Paper>
    );
}
