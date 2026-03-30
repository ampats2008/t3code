import * as esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes("--watch");

const sharedDir = path.resolve(__dirname, "../../packages/shared/src");

const commonOptions = {
  bundle: true,
  platform: "browser",
  target: "chrome120",
  sourcemap: true,
  alias: {
    "@t3tools/shared/elementInspectorCore": path.join(
      sharedDir,
      "elementInspectorCore.ts"
    ),
  },
};

const configs = [
  {
    ...commonOptions,
    entryPoints: [path.join(__dirname, "src/background.ts")],
    outfile: path.join(__dirname, "dist/background.js"),
    format: "esm",
  },
  {
    ...commonOptions,
    entryPoints: [path.join(__dirname, "src/content-script.ts")],
    outfile: path.join(__dirname, "dist/content-script.js"),
    format: "iife",
  },
  {
    ...commonOptions,
    entryPoints: [path.join(__dirname, "src/popup.ts")],
    outfile: path.join(__dirname, "dist/popup.js"),
    format: "iife",
  },
];

if (isWatch) {
  for (const config of configs) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
  }
  console.log("Watching for changes...");
} else {
  for (const config of configs) {
    await esbuild.build(config);
  }
  console.log("Build complete!");
}
