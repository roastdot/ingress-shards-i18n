import path from 'path';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import { fileURLToPath } from 'url';
import webpack from 'webpack';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resolvePackage = (pkg) => path.dirname(fileURLToPath(import.meta.resolve(`${pkg}/package.json`)));
const cesiumBuild = path.join(resolvePackage('cesium'), 'Build', 'Cesium');

export const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));

export default (env, { appVersion }) => {
    return {
        entry: './src/js/index.tsx',
        cache: {
            type: 'filesystem',
            buildDependencies: {
                config: [fileURLToPath(import.meta.url)],
            },
        },
        module: {
            rules: [
                {
                    // esbuild-loader strips types only (no type-checking) — `npm run typecheck`
                    // (tsc --noEmit) is the source of truth for correctness. Using esbuild here
                    // instead of ts-loader because ts-loader's compiler-API usage isn't yet
                    // compatible with TypeScript 7.
                    test: /\.tsx?$/,
                    loader: 'esbuild-loader',
                    options: {
                        target: 'es2022',
                    },
                    exclude: /node_modules/,
                },
                {
                    test: /\.css$/,
                    include: [
                        resolvePackage('flag-icon-css')
                    ],
                    use: [
                        'style-loader',
                        {
                            loader: 'css-loader',
                        },
                    ],
                },
                {
                    test: /\.css$/,
                    use: ['style-loader', 'css-loader'],
                    exclude: [
                        resolvePackage('flag-icon-css')
                    ],
                },
                {
                    test: /abaddon1_shard\.png$/,
                    type: 'asset/resource',
                    generator: {
                        filename: 'images/abaddon1_shard.png',
                    },
                },
                {
                    test: /\.(png|svg|jpg|jpeg|gif|webp)$/i,
                    include: [
                        resolvePackage('flag-icon-css')
                    ],
                    exclude: [
                        /abaddon1_shard\.png$/
                    ],
                    type: 'asset/resource',
                    generator: {
                        filename: 'images/flag-icons/[name].[contenthash:8][ext]',
                    },
                },
                {
                    test: /\.(png|svg|jpg|jpeg|gif|webp)$/i,
                    exclude: [
                        resolvePackage('flag-icon-css'),
                        /abaddon1_shard\.png$/,
                        resolvePackage('leaflet')
                    ],
                    type: 'asset/resource',
                    generator: {
                        filename: 'images/[name].[contenthash:8][ext]',
                    },
                },
                {
                    test: /\.(png|svg|jpg|jpeg|gif|webp)$/i,
                    include: [
                        resolvePackage('leaflet')
                    ],
                    type: 'asset/resource',
                    generator: {
                        filename: 'images/markers/[name][ext]',
                        emit: false,
                    },
                },
                // Markers are copied manually below to ensure the complete set (shadows, @2x) is present.
                // The rule above handles path resolution for files explicitly imported or used in CSS.
            ],
        },
        plugins: [
            new webpack.DefinePlugin({
                __APP_VERSION__: JSON.stringify(appVersion),
                // Cesium ion documents assets:read tokens as safe for public
                // clients. Restrict the production token to this app's domain
                // and World Terrain asset in the ion dashboard.
                __CESIUM_ION_TOKEN__: JSON.stringify(process.env.CESIUM_ION_TOKEN || ''),
                // A relative URL works both at localhost and under the GitHub
                // Pages repository sub-path used by the production build.
                CESIUM_BASE_URL: JSON.stringify('cesiumStatic/'),
            }),
            new HtmlWebpackPlugin({
                template: './index.html',
                favicon: './src/images/abaddon1_shard.png',
                meta: {
                    viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
                    'og:description': 'Interactive map of shard data from Ingress events',
                    'og:title': { property: 'og:title', content: 'Ingress Shards Map' },
                }
            }),
            new CopyWebpackPlugin({
                patterns: [
                    ...['Workers', 'ThirdParty', 'Assets', 'Widgets'].map(asset => ({
                        from: path.join(cesiumBuild, asset),
                        to: path.join('cesiumStatic', asset),
                    })),
                    {
                        from: path.join(resolvePackage('leaflet'), 'dist', 'images'),
                        to: 'images/markers',
                    },
                    {
                        from: path.resolve(__dirname, 'conf/event_blueprints.json'),
                        to: 'public/conf/',
                        transform(content) {
                            const blueprints = JSON.parse(content.toString());
                            blueprints.version = appVersion;
                            return JSON.stringify(blueprints, null, 2);
                        },
                    },
                    {
                        from: path.resolve(__dirname, 'conf/series_metadata.json'),
                        to: 'public/conf/',
                        transform(content) {
                            const metadata = JSON.parse(content.toString());
                            metadata.version = appVersion;
                            return JSON.stringify(metadata, null, 2);
                        },
                    },
                    {
                        from: path.resolve(__dirname, 'conf/series_results.json'),
                        to: 'public/conf/',
                    },
                    {
                        from: path.resolve(__dirname, 'gen/series_geocode.json'),
                        to: 'public/conf/',
                        transform(content) {
                            const geocode = JSON.parse(content.toString());
                            geocode.version = appVersion;
                            return JSON.stringify(geocode, null, 2);
                        },
                    },
                    {
                        from: path.resolve(__dirname, 'docs/assets/shard-site.png'),
                        to: 'images/',
                    },
                    {
                        from: path.resolve(__dirname, 'src/images/ornament-icons'),
                        to: 'images/ornament-icons',
                    },
                ]
            }),
            {
                apply: (compiler) => {
                    compiler.hooks.thisCompilation.tap('GenerateVersionFile', (compilation) => {
                        compilation.hooks.processAssets.tap(
                            {
                                name: 'GenerateVersionFile',
                                stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
                            },
                            (assets) => {
                                const content = JSON.stringify({ version: appVersion }, null, 2);
                                assets['public/conf/version.json'] = new webpack.sources.RawSource(content);
                            }
                        );
                    });
                }
            }
        ],
        resolve: {
            extensions: ['.tsx', '.ts', '.js'],
            extensionAlias: {
                '.js': ['.ts', '.tsx', '.js'],
            },
            alias: {
                'leaflet.motion': fileURLToPath(import.meta.resolve('leaflet.motion/dist/leaflet.motion.min.js')),
            }
        },
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: '[name].bundle.js',
            chunkFilename: 'js/[name].[contenthash:8].js',
            assetModuleFilename: 'images/[hash][ext][query]',
            clean: true,
            publicPath: '/',
        }
    };
};
