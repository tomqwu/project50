import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile, unlink } from "node:fs/promises";
import type { RecapData } from "./types.js";

export interface RecapRenderer {
  render(data: RecapData): Promise<Buffer>;
}

/**
 * Returns the absolute path to the Remotion entry point (Root).
 * Exposed separately so tests can inspect it without running a render.
 */
export function getEntryPoint(): string {
  // import.meta.url points to this file (render.ts / render.js).
  // Root.tsx lives in the same directory.
  const dir = fileURLToPath(new URL(".", import.meta.url));
  return join(dir, "Root.tsx");
}

/**
 * Real renderer: bundles the Remotion Root, selects the "recap" composition,
 * and renders it to an MP4 using the h264 codec.
 */
export class RemotionRenderer implements RecapRenderer {
  async render(data: RecapData): Promise<Buffer> {
    const { bundle } = await import("@remotion/bundler");
    const { selectComposition, renderMedia } = await import("@remotion/renderer");

    const entryPoint = getEntryPoint();

    const serveUrl = await bundle({ entryPoint });

    // @remotion/renderer expects inputProps to be Record<string, unknown>;
    // RecapData is structurally compatible but needs a cast.
    const props = data as unknown as Record<string, unknown>;

    const composition = await selectComposition({
      serveUrl,
      id: "recap",
      inputProps: props,
    });

    const outputLocation = join(tmpdir(), `recap-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);

    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      inputProps: props,
      outputLocation,
    });

    const buffer = await readFile(outputLocation);

    // Cleanup temp file (best effort)
    unlink(outputLocation).catch(() => undefined);

    return buffer;
  }
}

/**
 * Minimal valid MP4 fixture (ftyp + free box) — deterministic, no Chromium needed.
 * Used in tests and when RECAP_FAKE=1 is set.
 *
 * Structure:
 *   - ftyp box: size=20, type="ftyp", brand="isom", version=0, compatible="isom"
 *   - free box: size=8,  type="free" (empty)
 *
 * Total: 28 bytes — enough to start with the MP4 signature (00 00 00 14 66 74 79 70).
 */
const FAKE_MP4_B64 =
  "AAAAFGZ0eXBpc29tAAAAAWlzb20AAAAIZnJlZQ==";

export class FakeRecapRenderer implements RecapRenderer {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async render(_data: RecapData): Promise<Buffer> {
    return Buffer.from(FAKE_MP4_B64, "base64");
  }
}

/**
 * Returns the appropriate renderer:
 * - RECAP_FAKE=1  → FakeRecapRenderer (no Chromium, deterministic)
 * - otherwise     → RemotionRenderer  (real h264 render)
 */
export function getRenderer(): RecapRenderer {
  if (process.env.RECAP_FAKE === "1") {
    return new FakeRecapRenderer();
  }
  return new RemotionRenderer();
}
