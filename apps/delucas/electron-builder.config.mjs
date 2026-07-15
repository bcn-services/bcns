/**
 * electron-builder config for DeLuca's Revenue Tracker.
 *
 * Mac: unsigned DMG (identity: null — for handoff/testing, not App Store)
 * Windows: unsigned NSIS installer (no certificateFile — development builds)
 *
 * Run: pnpm package
 */

/** @type {import('electron-builder').Configuration} */
const config = {
  appId: "com.bcns.delucas",
  productName: "DeLuca's Revenue Tracker",
  directories: {
    // Output directory for installers/DMG
    output: "release",
    // App source root — electron-builder packs files relative to this
    app: ".",
  },
  // Unpack native .node binaries from the asar archive so they can be dlopen'd
  // at runtime (asar-packed native modules cannot be loaded by Node/Electron).
  asarUnpack: ["**/*.node"],
  // Include only the built output; exclude source, tests, and dev tooling
  files: [
    // The default exclusions remove 'dist/' — override by explicitly
    // including only the built output files.
    "!**/*",
    "dist/main/**/*",
    "dist/preload/**/*",
    "dist/renderer/**/*",
    "package.json",
    "!**/*.map",
  ],
  mac: {
    target: [
      {
        target: "dmg",
        arch: ["x64", "arm64"],
      },
    ],
    // Unsigned — for handoff/testing only, not notarized
    identity: null,
  },
  dmg: {
    title: "${productName} ${version}",
    background: null,
    window: {
      width: 540,
      height: 380,
    },
  },
  win: {
    target: [
      {
        target: "nsis",
        arch: ["x64"],
      },
    ],
    // Unsigned — no certificateFile for development/handoff builds
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
  },
};

export default config;
