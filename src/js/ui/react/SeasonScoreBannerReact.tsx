import React, { useSyncExternalStore } from "react";
import Paper from "@mui/material/Paper";
import { t } from "../../i18n/index.js";
import { getSeasonScoreSnapshot, subscribeSeasonScore } from "./seasonScoreStore.js";
import enlightenedLogoUrl from "../../../images/faction-enlightened.svg";
import resistanceLogoUrl from "../../../images/faction-resistance.svg";

export function SeasonScoreBannerReact(): React.JSX.Element | null {
    const state = useSyncExternalStore(subscribeSeasonScore, getSeasonScoreSnapshot);
    if (!state) return null;

    return (
        <Paper
            className="season-score-banner"
            component="a"
            href={state.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${state.seriesName} ${t('score.season_points')} — ${t('score.official_results')}`}
            title={t('score.official_results')}
        >
            <div className="season-score-heading">
                <strong>{state.seriesName}</strong>
                <span aria-hidden="true"> · </span>
                <span>{t('score.season_points')}</span>
            </div>
            <div className="season-score-values">
                <span className="season-score-faction faction-RES" aria-label={t('faction.resistance')}>
                    <img src={resistanceLogoUrl} alt="" />
                    <strong>{state.displayScore.scores.RES.toFixed(1)}</strong>
                </span>
                <span className="season-score-separator" aria-hidden="true">—</span>
                <span className="season-score-faction faction-ENL" aria-label={t('faction.enlightened')}>
                    <strong>{state.displayScore.scores.ENL.toFixed(1)}</strong>
                    <img src={enlightenedLogoUrl} alt="" />
                </span>
            </div>
            <span className="season-score-source" aria-hidden="true">↗</span>
        </Paper>
    );
}
