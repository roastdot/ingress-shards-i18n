import React, { useState } from "react";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import GitHubIcon from "@mui/icons-material/GitHub";
import FavoriteIcon from "@mui/icons-material/Favorite";
import { t } from "../../i18n/index.js";

const REPO_URL = "https://github.com/roastdot/ingress-shards.github.io";
const YEGGSTRY_URL = "https://github.com/Yeggstry";
const NICK_YOUNG_URL = "https://github.com/neon-ninja";

export function CreditsMenuReact(): React.JSX.Element {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const open = Boolean(anchorEl);

    return (
        <Paper className="react-credits-menu">
            <IconButton
                size="small"
                aria-label={t('credits.open')}
                aria-controls={open ? 'credits-menu' : undefined}
                aria-haspopup="true"
                onClick={(e) => setAnchorEl(e.currentTarget)}
            >
                <GitHubIcon fontSize="small" />
            </IconButton>
            <Menu
                id="credits-menu"
                anchorEl={anchorEl}
                open={open}
                onClose={() => setAnchorEl(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                slotProps={{ paper: { className: 'credits-menu-paper' } }}
            >
                <MenuItem component="a" href={REPO_URL} target="_blank" rel="noreferrer" onClick={() => setAnchorEl(null)}>
                    <ListItemIcon><GitHubIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>{t('credits.view_source')}</ListItemText>
                </MenuItem>
                <MenuItem component="a" href={YEGGSTRY_URL} target="_blank" rel="noreferrer" onClick={() => setAnchorEl(null)}>
                    <ListItemIcon><FavoriteIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>{t('credits.thanks_yeggstry')}</ListItemText>
                </MenuItem>
                <MenuItem component="a" href={NICK_YOUNG_URL} target="_blank" rel="noreferrer" onClick={() => setAnchorEl(null)}>
                    <ListItemIcon><FavoriteIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>{t('credits.thanks_nick_young')}</ListItemText>
                </MenuItem>
            </Menu>
        </Paper>
    );
}
