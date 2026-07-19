import { merge } from 'webpack-merge';
import { execSync } from 'child_process';
import common, { packageJson } from './webpack.common.js';

let developmentVersion = '';
try {
    developmentVersion = execSync('git describe --tags --always --dirty').toString().trim().replace(/^v/, '');
} catch (e) {
    console.warn('Could not describe the current Git revision: ', e);
}

export default (env) => {
    // APP_VERSION is useful for an explicitly named local preview. Otherwise,
    // show the nearest release tag and commit distance instead of exposing the
    // semantic-release placeholder from package.json.
    const appVersion = process.env.APP_VERSION || developmentVersion || packageJson.version;
    return merge(common(env, { appVersion }), {
        mode: 'development',
        devtool: 'eval-source-map',
        devServer: {
            static: './dist',
            client: {
                overlay: false,
            },
            hot: true,
            historyApiFallback: true,
            headers: {
                "Access-Control-Allow-Origin": "https://intel.ingress.com",
                "Access-Control-Allow-Methods": "GET",
                "Access-Control-Allow-Headers": "X-Requested-With, content-type, Authorization"
            }
        },
    });
};
