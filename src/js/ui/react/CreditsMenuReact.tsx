import React from "react";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import GitHubIcon from "@mui/icons-material/GitHub";
import { t } from "../../i18n/index.js";

const REPO_URL = "https://github.com/roastdot/ingress-shards.github.io";

export function CreditsMenuReact(): React.JSX.Element {
    return (
        <Paper className="react-credits-menu">
            <IconButton
                component="a"
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                size="small"
                aria-label={t('credits.view_source')}
            >
                <GitHubIcon fontSize="small" />
            </IconButton>
        </Paper>
    );
}
