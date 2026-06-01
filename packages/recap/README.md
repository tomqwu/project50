# @project50/recap

Remotion-based recap video engine for project50. Generates shareable MP4 highlight videos (day / week / 50-day) from challenge data using a Momentum-styled animation.

## Compositions

The package exports a single Remotion composition (`id: "recap"`) via `RemotionRoot`, which uses `RecapVideo` to render different layouts based on the `kind` field:

| Kind | Description |
|------|-------------|
| `DAY` | Single-day highlight — latest completed day's stats + photo |
| `WEEK` | 7-day summary — streak ring, stats, photo strip |
| `FIFTY` | Full 50-day recap — milestone count, ring fill, photo collage |

All compositions are 1080×1920, 30fps, and take `RecapData` as `inputProps`.

### Components

- `BigNumber` — Anton-font count-up animation (driven by `useCurrentFrame`)
- `RingFill` — Animated volt-accent ring, fill driven by progress ratio
- `PhotoStrip` — Fades through an array of photo URLs
- `TitleCard` — Challenge title with entrance animation
- `StatLine` — Key/value stat with fade-in

## RECAP_FAKE

Set `RECAP_FAKE=1` in the environment to use `FakeRecapRenderer` instead of the real Remotion renderer. The fake renderer returns a tiny (28-byte) valid MP4 buffer without launching Chromium. This is used in:

- **e2e tests** (`apps/web/e2e/`) via `playwright.config.ts` webServer env
- **CI** via the `RECAP_FAKE: "1"` env on the `pnpm test:e2e` step in `.github/workflows/ci.yml`

```bash
RECAP_FAKE=1 pnpm dev   # Use fake renderer in local dev (fast, no Chromium)
```

## Renderer interface

```typescript
interface RecapRenderer {
  render(data: RecapData): Promise<Buffer>;
}

// Pick the right renderer based on RECAP_FAKE env:
import { getRenderer } from "@project50/recap";
const buffer = await getRenderer().render(recapData);
```

## Local real-render smoke test

To prove the real Remotion rendering pipeline works end-to-end (requires Chromium):

```bash
pnpm --filter @project50/recap render:sample
```

This will:
1. Bundle the Remotion Root via `@remotion/bundler`
2. Select the `recap` composition with sample `RecapData`
3. Render to MP4 using `h264` codec via `@remotion/renderer`
4. Write the output to `/tmp/project50-recap-sample.mp4`

On first run, `@remotion/renderer` will download Chromium (~300MB). Allow a few minutes.

**Do NOT run this in CI.** CI uses `RECAP_FAKE=1` so no Chromium render is attempted.

## Types

```typescript
type RecapKind = "DAY" | "WEEK" | "FIFTY";

interface RecapData {
  title: string;
  kind: RecapKind;
  dayNumber: number;
  lengthDays: number;
  stats: {
    daysCompleted: number;
    totalAmount: number;
    unit?: string;
    currentStreak: number;
  };
  days: {
    dayKey: string;
    completed: boolean;
    amount?: number;
    photoUrl?: string;
  }[];
}
```
