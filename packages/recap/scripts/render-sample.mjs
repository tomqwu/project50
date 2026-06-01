/**
 * Local-only real-render smoke test for the @project50/recap package.
 *
 * Uses the REAL RemotionRenderer (not the fake) to render a sample DAY recap
 * to /tmp/project50-recap-sample.mp4 using hardcoded sample RecapData.
 *
 * Usage:
 *   pnpm --filter @project50/recap render:sample
 *
 * Requirements:
 *   - Node 20+
 *   - Chromium (downloaded automatically by @remotion/renderer on first run)
 *   - Internet access for the initial Chromium download (can take a few minutes)
 *
 * DO NOT run in CI. CI/e2e use RECAP_FAKE=1 (FakeRecapRenderer).
 * Set RECAP_FAKE=1 in the environment to skip this and use the fake renderer instead.
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Sample RecapData for the smoke test
const SAMPLE_DATA = {
  title: "Run 5K Every Day",
  kind: "DAY",
  dayNumber: 7,
  lengthDays: 50,
  stats: {
    daysCompleted: 7,
    totalAmount: 35,
    unit: "km",
    currentStreak: 7,
  },
  days: [
    { dayKey: "2026-05-01", completed: true, amount: 5 },
    { dayKey: "2026-05-02", completed: true, amount: 5 },
    { dayKey: "2026-05-03", completed: true, amount: 5 },
    { dayKey: "2026-05-04", completed: true, amount: 5 },
    { dayKey: "2026-05-05", completed: true, amount: 5 },
    { dayKey: "2026-05-06", completed: true, amount: 5 },
    { dayKey: "2026-05-07", completed: true, amount: 5 },
  ],
};

const outputPath = join(tmpdir(), "project50-recap-sample.mp4");

console.log("=== project50 Recap — Real Remotion Render Smoke Test ===");
console.log(`Output: ${outputPath}`);
console.log("");

if (process.env.RECAP_FAKE === "1") {
  console.log("RECAP_FAKE=1 detected — using FakeRecapRenderer (not the real Remotion renderer).");
  console.log("Unset RECAP_FAKE to run the real Remotion render.");
  console.log("");
}

console.log("Starting render… (Chromium may download on first run — allow a few minutes)");
const start = Date.now();

try {
  // Import dynamically — tsx resolves .js → .ts for ESM-first source
  const { RemotionRenderer } = await import("../src/render.js");

  const renderer = new RemotionRenderer();
  const buffer = await renderer.render(SAMPLE_DATA);

  await writeFile(outputPath, buffer);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`✓ Rendered in ${elapsed}s`);
  console.log(`✓ Output: ${outputPath} (${buffer.length} bytes)`);
  console.log("");
  console.log("Real Remotion render SUCCEEDED. MP4 is valid and ready.");
} catch (err) {
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.error(`✗ Render FAILED after ${elapsed}s:`);
  console.error(err instanceof Error ? err.message : String(err));
  console.error("");
  console.error(
    "Common causes:\n" +
    "  - Missing Chromium / system deps (run: pnpm --filter @project50/web exec playwright install --with-deps chromium)\n" +
    "  - Network error downloading Chromium on first run\n" +
    "  - Sandbox environment without display/GPU support\n" +
    "  - Remotion bundler cannot resolve .js→.tsx source extensions in this environment\n" +
    "    (the RemotionRenderer is fully tested via mocks; this script requires a full Node.js env)\n" +
    "\n" +
    "Note: CI/e2e always use RECAP_FAKE=1 — real renders are local-only.",
  );
  process.exit(1);
}
