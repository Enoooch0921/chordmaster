---
version: 1
slug: "src-app-performance-mode"
primary_target: "src/App.tsx"
related_targets: ["src/hooks/usePerformanceChrome.ts", "src/index.css", "src/App.performanceSafety.test.tsx", "src/App.lyricsLayout.test.tsx", "docs/performance-display.md"]
---

# Immediate performance page turns

Mode: Operate / Read. Preserve the existing white A4 pages, dark surround, single/dual-page fit, idle chrome and full-height page-turn hit areas.

Within-song turns update the measured translation and page metadata without a workspace render. The page ref is authoritative for immediate tap/swipe/pedal input; reapply it before unrelated React commits paint. Continuous lyrics updates its dedicated range span. Cross-song changes retain normal React/layout and previous-song final-spread semantics.

Chrome uses one container presentation attribute and the existing two-second hide timer. Only chrome items fade and stop taking pointer input; the independent previous/next buttons remain active. Keep timer cleanup on exit and reopening visible. No new animation or notation layout change.

Explicit Exit closes both presentation and fullscreen on primary pointer press, with click retained for keyboard/accessibility. A genuine native fullscreen-to-windowed transition also closes the presentation; rejected/unsupported entry leaves windowed performance available. Automatic fullscreen cleanup remains ownership-aware. Verify both standard/WebKit events, early press without click, reopening, and the normal workspace viewport after exit.

Verified WebKit iPad emulation at 834×1037 and 1112×759 with a synthetic three-song, 96-measure-per-song fixture. Portrait/landscape rotation, odd final spread, emulated touch after idle, and page-boundary transitions retain page selection. Same-host development profiling measured within-song next-frame median 172ms before versus 23ms after; these are diagnostic measurements, not physical-device performance. Relevant tests cover no workspace render, lyrics range refresh, swipe/click pairing, offline/reconnect, pedal keys and idle cleanup. Physical iPad App/PWA testing remains unverified.
