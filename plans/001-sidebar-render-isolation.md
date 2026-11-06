# 001 — Isolate sidebar motion from chart rendering

- **Status**: DONE
- **Commit**: 768fefd7
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: App.tsx, targeted integration test, synthetic browser fixture

## Problem

`src/App.tsx:3104` currently recreates the source list on every render:
```tsx
const setlistSongsWithSource = (selectedSetlist?.songs ?? []).map((item) => {
  const sourceSong = getSetlistSongSource(item);
  return { item, sourceSong };
}).filter((entry): entry is { item: SetlistSong; sourceSong: StoredSong } => entry.sourceSong !== null);
```
The new reference invalidates `setlistPreviewSongs` at 10393 and `setlistPreviewSheet` at 10490+, including expensive full JSON clone/normalization of every song. Sidebar hover, menu toggles and other chrome changes thus rerender the chart, starving motion. `getSetlistSongSource` at 3062 is currently an ordinary closure. Other unstable dependencies in this memo path must be checked rather than assuming a single memo fixes it.

`src/App.tsx:12908` sidebar content has `className="min-w-0 min-h-0 flex-1 flex flex-col"` and style only `pointerEvents`. Its available width collapses to zero when the desktop rail closes, causing the entire hidden list to reflow and resize again on open.

## Target

Sidebar/menu/chrome changes must produce zero additional ChordSheet renders for a stable loaded setlist, while real song edits, capo/key/display settings, note visibility, permissions, language and selection still update immediately with fresh callbacks. Stable data identity is preferred over custom memo comparisons. Keep existing phone drawer full `transform` string and UI_DRAWER_EASE `[0.32, 0.72, 0, 1]`, normal enter 240ms/exit 200ms; desktop layout width intentionally updates once, with no width tween. Keep sidebar content at its resolved expanded width and clip it with the existing outer shell; do not squeeze hidden text to zero width. Keep hidden controls inert, keyboard input immediate and reduced motion opacity-only 125ms.

## Repo conventions to follow

Existing `React.useMemo` data projections in App.tsx:2460 and `useCallback` chart handlers. `src/lib/uiMotion.ts` full transform strings; `useUiMotion` reduced/instant preference. `src/components/PersonalChordSheet.tsx` already memoizes its inner ChordSheet but new song props defeat it. Preserve callbacks rather than ignoring function props in memo comparisons.

## Steps

1. Memoize getSetlistSongSource with exact dependency songs (or a memoized song lookup) and memoize setlistSongsWithSource by selectedSetlist.songs and that resolver. Inspect all relevant memo dependency identities, stabilize only those demonstrably invalidating preview on chrome actions. Do not broadly rewrite unrelated state.
2. Set a fixed expanded flex-basis/width for the sidebar content (resolvedSidebarWidth minus desktop rail width; phone has zero rail). Existing absolute shell clips it at collapsed size. Keep pointer/focus/resize/overlay behavior.
3. Add meaningful regression coverage counting ChordSheet renders after a settled multi-song setlist: hover open/close and toolbar menu toggles must not rerender scores. Verify edits, selected song actions and display/key/capo changes still repaint the required scores and callbacks remain fresh. Include read-only/joined source fallback where useful.
4. In an isolated worktree, create synthetic browser fixture (no production data) with at least 8 songs / 32 bars each. Measure before/after sidebar hover, phone drawer and setlist navigation with requestAnimationFrame/long-task or CDP tracing. Do baseline before changing code. Also inspect Project/list slide transitions so this is the user's whole left area. Do not claim a real-device FPS result from jsdom.

## Boundaries

No dependencies, auth/backend or production row changes; no commits/push/deploy. Other work is active in the parent tree. Preserve its guitarist-mode and conditional-sharing changes. Work in an isolated git worktree with snapshot copies of relevant dirty frontend files only; do not copy secrets. Explicitly disable Supabase using empty VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY for fixture runs. Browser automation must follow playwright skill. Only merge your reviewed changes to original workspace after parent review.

## Verification

Mechanical: `npm run lint`; targeted App navigation/drummer/mobile/setlist control tests plus new regression tests; `npm run build`. Browser fixture desktop 1440x900, tablet 1024x768, phone 390x844, ordinary and reduced motion; rapid reversal must not leave inert/outgoing layers. Capture a screenshot/filmstrip and performance summary. At slow animation playback confirm the mobile drawer translates as a rigid panel, stable list text, no blank/wrapped content during motion; keyboard commands immediate. Done when unnecessary score renders are eliminated and measured sidebar traces improve without stale edits.

## Verified follow-up scope

CPU sampling after the initial fix found development jsxDEV bookkeeping dominated remaining root render time. Also measured startup-library eager clone work (~6ms per hover pair) and repeated library dirty serialization (~2ms per pair). Convert only the two saved-song/setlist clone useState arguments to lazy initializers and memoize libraryIsDirty by songs/savedSongs. Compare formally built synthetic baselines before making frame-rate claims; discard the HMR-interrupted run with negative cumulative CDP counters. No shipped performance instrumentation.

Production browser capture also found invalid intermediate keyframes (`translate0d(0%, 0, 0)`) when moving between transform:none and translate3d variants. Approved follow-up: keep translate3d identity strings even in keyboard/reduced/desktop modes. For App use identical calc argument shapes, open/identity `translate3d(calc(0% - 0px), 0, 0)` and closed `translate3d(calc(-100% - 24px), 0, 0)`; SetlistNavigator uses `translate3d(0%, 0, 0)` identity and existing percentage offsets. Update targeted motion tests, keep reduced displacement zero and keyboard duration0, verify no invalid-keyframe console warnings.

## Result

Completed in original workspace. Final production16-page workload: six hover cycles240→0 actual score renders, p95 frame gap110→10.9ms, max159.5→29.2ms, longtasks38→0. Parent final43 targeted tests plus381 focused tests, typecheck/build pass. See output/playwright/animation-performance-20261106/verification.json.
