/**
 * verify-bundle.mjs
 *
 * Runs the REAL @remotion/bundler bundle() on the recap Root entry point.
 * Uses the same webpackOverride logic as RemotionRenderer.render() in render.ts.
 * Does NOT require Chromium — bundling is pure webpack, no browser.
 *
 * Usage (from repo root):
 *   node packages/recap/scripts/verify-bundle.mjs
 *
 * Exit 0 = bundle succeeded (prints serve URL / bundle dir).
 * Exit 1 = bundle failed (prints error).
 *
 * Why the webpackOverride is needed:
 *   All source imports use TypeScript ESM-style `.js` extension specifiers
 *   (e.g. `import { RecapVideo } from "./RecapVideo.js"`). Remotion's webpack
 *   bundler does NOT include `resolve.extensionAlias` by default, so it cannot
 *   map `.js` → `.tsx`. The webpackOverride below (mirroring recapWebpackOverride
 *   from render.ts) adds `extensionAlias` to fix this.
 */

import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve the entry point — Root.tsx lives in ../src/Root.tsx
const entryPoint = join(__dirname, "..", "src", "Root.tsx");

console.log("=== Remotion bundle() verification ===");
console.log(`Entry point: ${entryPoint}`);
console.log("");

/**
 * Same logic as recapWebpackOverride in render.ts.
 * Adds extensionAlias so .js imports resolve to .tsx/.ts sources.
 */
function webpackOverride(config) {
  const resolve = config.resolve ?? {};
  return {
    ...config,
    resolve: {
      ...resolve,
      extensionAlias: {
        ".js": [".tsx", ".ts", ".js"],
        ".mjs": [".mts", ".mjs"],
      },
    },
  };
}

const { bundle } = await import("@remotion/bundler");

const start = Date.now();

try {
  console.log("Calling bundle()... (may take 10-30s on first run due to webpack cache warm-up)");
  const serveUrl = await bundle({
    entryPoint,
    webpackOverride,
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✓ bundle() SUCCEEDED in ${elapsed}s`);
  console.log(`✓ Serve URL / bundle dir: ${serveUrl}`);

  // Verify recap components are in the bundle
  const { readdir, readFile } = await import("node:fs/promises");
  const files = await readdir(serveUrl);
  const jsFiles = files.filter((f) => f.endsWith(".js") && !f.endsWith(".map"));
  let foundComponents = false;
  for (const file of jsFiles) {
    const content = await readFile(join(serveUrl, file), "utf-8");
    if (content.includes("RecapVideo") || content.includes("registerRoot")) {
      console.log(`✓ Bundle chunk ${file} contains recap composition code`);
      foundComponents = true;
      break;
    }
  }

  if (!foundComponents) {
    console.warn("⚠ Could not verify RecapVideo in bundle chunks — check bundle contents manually");
  }

  console.log("");
  console.log("The real Remotion bundler successfully resolves .js → .tsx sources.");
  console.log("Next step: renderMedia() requires Chromium (not available in sandbox).");
  process.exit(0);
} catch (err) {
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.error(`\n✗ bundle() FAILED after ${elapsed}s:`);
  console.error(err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) {
    console.error("\nStack:");
    console.error(err.stack.split("\n").slice(1, 8).join("\n"));
  }
  console.error("");
  console.error(
    "If the error is 'Module not found: Can't resolve ./SomeFile.js':\n" +
    "  This is the .js→.tsx extension alias issue. Ensure render.ts exports\n" +
    "  recapWebpackOverride and it is passed to bundle().",
  );
  process.exit(1);
}
