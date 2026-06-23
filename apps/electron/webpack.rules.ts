import type { ModuleOptions } from "webpack";

export const rules: Required<ModuleOptions>["rules"] = [
  // Add support for JSON files (i18n dictionaries)
  // {
  //   test: /\.json$/,
  //   type: 'javascript/auto',
  //   include: /src\/locales/,
  //   use: [{ loader: 'json-loader' }]
  // },
  // Add support for native node modules
  {
    // We're specifying native_modules in the test because the asset relocator loader generates a
    // "fake" .node file which is really a cjs file.
    test: /native_modules[/\\].+\.node$/,
    use: "node-loader",
  },
  {
    test: /[/\\]node_modules[/\\].+\.(c?js|mjs|node)$/,
    parser: { amd: false },
    use: {
      loader: "@vercel/webpack-asset-relocator-loader",
      options: {
        outputAssetBase: "native_modules",
      },
    },
  },
  {
    test: /\.tsx?$/,
    exclude: /(node_modules|\.webpack)/,
    use: {
      loader: "ts-loader",
      options: {
        transpileOnly: true,
        compilerOptions: {
          noEmitOnError: false,
        },
      },
    },
  },
  // Add support for image files (emitted as separate files).
  {
    test: /\.(png|jpe?g|gif|ico)$/i,
    resourceQuery: { not: [/inline/] },
    type: "asset/resource",
  },
  // Images imported with `?inline` are embedded as base64 data URLs.
  // The main process needs this for nativeImage.createFromDataURL: the window,
  // tray and notification icons must not depend on a runtime file path, because
  // `public/` is not copied into the webpack/asar output.
  {
    test: /\.(png|jpe?g|gif)$/i,
    resourceQuery: /inline/,
    type: "asset/inline",
  },
  // Add support for SVG files as strings
  {
    test: /\.svg$/i,
    type: "asset/source",
  },
];
