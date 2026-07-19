import { merge } from 'webpack-merge';
import { execSync } from 'child_process';
import common, { packageJson } from './webpack.common.js';

// This fork lives at github.com/roastdot/ingress-shards.github.io — since the
// repo name doesn't match the roastdot.github.io user-site convention, GitHub
// Pages serves it as a project page under a subpath, not site root.
const REPO_NAME = '/ingress-shards.github.io/';

export default (env) => {
    let gitVersion = '';
    try {
        gitVersion = execSync('git describe --tags --always').toString().trim().replace(/^v/, '');
    } catch (e) {
        console.warn('Could not describe the current Git revision: ', e);
    }

    const cloudflareVersion = process.env.CF_PAGES_COMMIT_SHA
        ? `${process.env.CF_PAGES_BRANCH || 'cloudflare'}@${process.env.CF_PAGES_COMMIT_SHA.slice(0, 7)}`
        : '';
    const appVersion = process.env.APP_VERSION || cloudflareVersion || gitVersion || packageJson.version;
    return merge(common(env, { appVersion }), {
        mode: 'production',
        output: {
            publicPath: REPO_NAME,
        }
    });
};
