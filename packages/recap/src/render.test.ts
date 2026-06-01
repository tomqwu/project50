// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------- mocks ----------
vi.mock("@remotion/bundler", () => ({
  bundle: vi.fn().mockResolvedValue("http://localhost:3001/bundle"),
}));

vi.mock("@remotion/renderer", () => ({
  selectComposition: vi.fn().mockResolvedValue({
    id: "recap",
    width: 1080,
    height: 1920,
    fps: 30,
    durationInFrames: 300,
    defaultProps: {},
  }),
  renderMedia: vi.fn().mockResolvedValue(undefined),
}));

// Mock fs/promises readFile and unlink
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from("fake-mp4-bytes")),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

// ---------- imports (after mocks) ----------
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";
import { readFile } from "node:fs/promises";
import {
  RemotionRenderer,
  FakeRecapRenderer,
  getRenderer,
  getEntryPoint,
} from "./render.js";
import type { RecapData } from "./types.js";

const sampleData: RecapData = {
  title: "Work out",
  kind: "DAY",
  dayNumber: 5,
  lengthDays: 50,
  stats: {
    daysCompleted: 5,
    totalAmount: 300,
    unit: "min",
    currentStreak: 5,
  },
  days: [
    { dayKey: "2026-06-01", completed: true, amount: 60 },
    { dayKey: "2026-06-02", completed: true, amount: 60 },
  ],
};

// ---------- FakeRecapRenderer ----------
describe("FakeRecapRenderer", () => {
  it("returns a non-empty Buffer", async () => {
    const renderer = new FakeRecapRenderer();
    const buf = await renderer.render(sampleData);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("starts with ftyp MP4 signature (00 00 00 xx 66 74 79 70)", async () => {
    const renderer = new FakeRecapRenderer();
    const buf = await renderer.render(sampleData);
    // bytes 4-7 should be "ftyp" = 0x66 0x74 0x79 0x70
    expect(buf[4]).toBe(0x66); // 'f'
    expect(buf[5]).toBe(0x74); // 't'
    expect(buf[6]).toBe(0x79); // 'y'
    expect(buf[7]).toBe(0x70); // 'p'
  });

  it("is deterministic — same bytes every call", async () => {
    const renderer = new FakeRecapRenderer();
    const buf1 = await renderer.render(sampleData);
    const buf2 = await renderer.render({ ...sampleData, title: "Different" });
    expect(buf1.equals(buf2)).toBe(true);
  });
});

// ---------- RemotionRenderer ----------
describe("RemotionRenderer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default mocks after clear
    vi.mocked(bundle).mockResolvedValue("http://localhost:3001/bundle");
    vi.mocked(selectComposition).mockResolvedValue({
      id: "recap",
      width: 1080,
      height: 1920,
      fps: 30,
      durationInFrames: 300,
      defaultProps: {},
    } as Awaited<ReturnType<typeof selectComposition>>);
    vi.mocked(renderMedia).mockResolvedValue(null as unknown as Awaited<ReturnType<typeof renderMedia>>);
    vi.mocked(readFile).mockResolvedValue(Buffer.from("fake-mp4-bytes") as unknown as string);
  });

  it("calls bundle with an entryPoint pointing to Root.tsx", async () => {
    const renderer = new RemotionRenderer();
    await renderer.render(sampleData);
    expect(bundle).toHaveBeenCalledOnce();
    const callArg = vi.mocked(bundle).mock.calls[0]![0] as { entryPoint: string };
    expect(typeof callArg.entryPoint).toBe("string");
    expect(callArg.entryPoint).toMatch(/Root\.tsx$/);
  });

  it("getEntryPoint returns a path ending in Root.tsx", () => {
    const ep = getEntryPoint();
    expect(ep).toMatch(/Root\.tsx$/);
  });

  it("calls selectComposition with id='recap' and inputProps===data", async () => {
    const renderer = new RemotionRenderer();
    await renderer.render(sampleData);
    expect(selectComposition).toHaveBeenCalledOnce();
    const args = vi.mocked(selectComposition).mock.calls[0]![0];
    expect(args.id).toBe("recap");
    // inputProps is the cast version of sampleData (same reference via cast)
    expect(args.inputProps).toStrictEqual(sampleData);
    expect(args.serveUrl).toBe("http://localhost:3001/bundle");
  });

  it("calls renderMedia with codec='h264' and inputProps===data", async () => {
    const renderer = new RemotionRenderer();
    await renderer.render(sampleData);
    expect(renderMedia).toHaveBeenCalledOnce();
    const args = vi.mocked(renderMedia).mock.calls[0]![0];
    expect(args.codec).toBe("h264");
    expect(args.inputProps).toStrictEqual(sampleData);
    expect(typeof args.outputLocation).toBe("string");
    expect(args.outputLocation as string).toMatch(/\.mp4$/);
  });

  it("reads the temp output file and returns its contents as Buffer", async () => {
    const expected = Buffer.from("mock-render-output");
    vi.mocked(readFile).mockResolvedValue(expected as unknown as string);

    const renderer = new RemotionRenderer();
    const result = await renderer.render(sampleData);
    expect(readFile).toHaveBeenCalledOnce();
    expect(result).toBe(expected);
  });
});

// ---------- getRenderer ----------
describe("getRenderer", () => {
  const origEnv = process.env.RECAP_FAKE;

  afterEach(() => {
    if (origEnv === undefined) {
      delete process.env.RECAP_FAKE;
    } else {
      process.env.RECAP_FAKE = origEnv;
    }
  });

  it("returns FakeRecapRenderer when RECAP_FAKE=1", () => {
    process.env.RECAP_FAKE = "1";
    const renderer = getRenderer();
    expect(renderer).toBeInstanceOf(FakeRecapRenderer);
  });

  it("returns RemotionRenderer when RECAP_FAKE is unset", () => {
    delete process.env.RECAP_FAKE;
    const renderer = getRenderer();
    expect(renderer).toBeInstanceOf(RemotionRenderer);
  });

  it("returns RemotionRenderer when RECAP_FAKE is '0'", () => {
    process.env.RECAP_FAKE = "0";
    const renderer = getRenderer();
    expect(renderer).toBeInstanceOf(RemotionRenderer);
  });
});
