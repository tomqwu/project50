# Mobile build assets

These are the icon / splash / notification assets referenced by
`apps/mobile/app.json`. They are **on-brand placeholders** (Momentum charcoal
`#121013` background + volt `#D6FF3F` "P50" wordmark), generated so Expo builds
succeed. **Final brand artwork is the designer's job** — replace these in place
(keep the same filenames + dimensions).

## Files

| File | Dimensions | Alpha | Used by (`app.json`) |
| --- | --- | --- | --- |
| `icon.png` | 1024 × 1024 | no (RGB) | `expo.icon` — iOS/Android app icon source |
| `adaptive-icon.png` | 1024 × 1024 | yes | `android.adaptiveIcon.foregroundImage` (content kept inside ~66% safe zone) |
| `splash.png` | 1284 × 2778 | yes | `expo.splash.image` (`resizeMode: contain` on `#121013`) |
| `notification-icon.png` | 96 × 96 | yes | `expo-notifications` plugin `icon` (monochrome white) |

## TODO — final artwork

Final store/marketing artwork (1024² icon without alpha, 512² Play icon,
1024×500 Play feature graphic, screenshots, etc.) is tracked and spec'd in
**`docs/store/STORE-ASSETS.md`** (the build-asset section there mirrors this
table). Closes the build-asset portion of #95 (iOS) and #113 (Android).
