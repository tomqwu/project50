# project50 — Master Program Plan (A–E)

> Date: 2026-06-01
> Status: living roadmap. A+B complete & merged. This plan sequences C, D, E and the A+B
> polish into a single end-to-end "full working case."

## The full working case (definition of done for the demo)

A real user can: sign in → create a 50-day challenge → log daily activities **with photos** →
watch streak/badges/ring → on a milestone (day 7/25/50) the app **auto-generates a recap
video** (day / week / 50-day) → **share** that video + image card to Facebook / Instagram /
WeChat (hybrid) → and do the capture-heavy parts from a **native app**. Everything stays
behind the hard 99% coverage gate + Playwright/e2e + CI auto-merge.

## Sub-projects & status

| | Sub-project | Status |
|---|---|---|
| A | Backend API + data model | ✅ done (Phases 0–2, 4) |
| B | Web PWA | ✅ done (Phases 0–4) |
| C | Native iOS/Android (React Native + Expo) | planned below |
| D | Social publishing (FB / IG / WeChat — hybrid) | planned below |
| E | Recap animation engine (Remotion-led) | planned below |
| — | A+B polish (media upload + real counts) | planned below (foundation for E) |

## Locked technical decisions (from this session)

- **Recap animation (E):** **Remotion** as the primary engine — render real MP4s server-side
  from React compositions, parameterized by a challenge's data. Lottie templates may be
  embedded inside compositions for designer-made motion; an in-browser canvas/WebCodecs path
  is a fallback only if a server render is infeasible. Momentum visual system throughout.
- **Social publishing (D):** **Hybrid** — generate the asset (image card from Phase 4 + recap
  video from E), then: Web Share / native share sheet + deep links everywhere; real platform
  APIs where feasible (Facebook Graph video/photo publish, Instagram Content Publishing API)
  behind app-review, abstracted behind a `Publisher` interface so each platform is pluggable;
  WeChat via JS-SDK share (official content API needs a China MP entity — stub the adapter
  with a clear capability flag). No fake "posted!" states — capabilities are explicit.
- **Native (C):** **React Native + Expo (TypeScript)** — reuse `@project50/core` (pure domain
  logic) and the same REST API. Tested with Jest (unit) + Detox or Maestro (e2e). The web's
  99% gate doesn't transfer 1:1 to native; native gets its own coverage target (start high on
  `core`-consuming logic, pragmatic on RN screens).

## Integration architecture

All clients (web B, native C) speak to the **same A backend API**. New backend capabilities
needed by C/D/E are added to A and reused:
- **Media (photos/videos):** S3-compatible object storage (MinIO dev) via presigned uploads;
  `ActivityMedia` already in schema. The recap engine reads media + `DayStatus` to compose.
- **Recap jobs (E):** a `Recap` record + a render pipeline (Remotion render → store MP4 in
  object storage → expose a URL). Triggered on milestone or on demand.
- **Publishing (D):** a `Publisher` abstraction in the backend (or a server action) that takes
  a generated asset + target platform and returns a share result/URL; per-platform adapters
  with capability flags.
- **Shared domain logic** stays in `packages/core` (framework-free) and is consumed by web,
  native, and the recap engine alike.

## Sequence to the full working case (each = its own spec → plan → build → PR → auto-merge)

1. **Increment 1 — Media upload + truthful counts (A+B polish).** Presigned photo upload to
   MinIO from the log-activity flow; render photos in feed/celebrate; wire dashboard
   badges/cheering + feed cheer counts from real data. *Unblocks compelling recaps.*
2. **Increment 2 — Recap animation engine (E).** `packages/recap` Remotion compositions
   (day / week / 50-day) in the Momentum system; a backend render endpoint producing an MP4
   stored in object storage; a `Recap` record; web UI to generate + preview + download on the
   celebrate screen. *Delivers the signature feature.*
3. **Increment 3 — Social publishing (D, hybrid).** `Publisher` interface + adapters
   (Facebook, Instagram, WeChat-stub) + Web Share/deep-link; share the recap video + image
   card from celebrate; capability flags surfaced honestly in the UI.
4. **Increment 4 — Native app (C, Expo).** Expo TS app reusing `@project50/core` + the API:
   auth, dashboard, photo-capture log, feed, celebrate/share. Native test stack.

Within each increment we keep the established discipline: phased TDD tasks, sub-agent
execution, two-stage review, hard coverage gate (per-package), CI, auto-merge on green.

## Risks & notes
- **Platform API gating (D):** FB/IG need app review; WeChat needs a China MP entity. The
  hybrid design ships value now (share sheet + asset) and lights up official APIs as approvals
  land — adapters are capability-flagged, never faked.
- **Remotion render cost (E):** server render is CPU-heavy; start synchronous for short clips,
  move to a queue if needed. Keep compositions deterministic for testable snapshots.
- **Native coverage (C):** RN UI is harder to unit-test to 99%; we hold the line on
  `core`-consuming logic and use e2e for screens, documenting the target explicitly.

Each increment's detailed spec + plan will be written just-in-time before its build.
