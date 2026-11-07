---
version: 1
slug: "src-app-performance-mode"
primary_target: "src/App.tsx"
related_targets: ["src/hooks/usePerformanceChrome.ts", "src/index.css", "src/App.performanceSafety.test.tsx", "src/App.lyricsLayout.test.tsx", "docs/performance-display.md"]
---

# Immediate performance page turns

Mode: Operate / Read. Preserve the existing white A4 pages, dark surround, single/dual-page fit, idle chrome and full-height page-turn hit areas.

Within-song turns update the measured translation and page metadata without a workspace render. The page ref is authoritative for immediate tap/swipe/pedal input; reapply it before unrelated React commits paint. Continuous lyrics updates its dedicated range span. Cross-song changes retain normal React/layout and previous-song final-spread semantics.

Chrome uses a per-control `data-performance-chrome-hidden` attribute and the existing two-second hide timer. The overlay visibility attribute is diagnostic only: never key styling off a changing overlay ancestor, which invalidates thousands of cached score descendants. Only chrome items fade and stop taking pointer input; the independent previous/next buttons remain active. Keep timer cleanup on exit and reopening visible. Notation layout remains unchanged; the explicitly requested swipe feedback is documented below.

## Direct swipe feedback and discovery — 2026-11-06

The score stays stationary during a swipe. On release, a horizontal gesture of at least 44px turns the page immediately. Taps on the explicit half-screen turn targets also complete on touchend, without waiting for Safari to synthesize click; suppress the compatibility click to avoid a second turn. The two transparent tap targets support pointer and assistive activation. Omit directional arrows and animated feedback from the stage. Preserve vertical and multi-touch cancellation, handwriting exclusion, compatibility-click suppression and previous-song final-spread navigation.

The first-use inline note explains both horizontal swipe and tapping the screen halves. It remains readable when idle chrome fades, has a 44px acknowledgement and remembers acknowledgement/successful swipe locally. Hide it while handwriting is active. When the authenticated non-lyrics surface offers personal notes, position the hint above the shared launcher bottom offset and 44px launcher height with a 12px gap plus safe-area inset. Keep both the hint acknowledgement and notes launcher reachable; neither covers the other. Synthetic desktop/tablet/phone evidence is in `output/playwright/performance-swipe-20261106/`, with the later overlay-spacing correction below; physical-device performance is not established.

Explicit Exit closes both presentation and fullscreen on primary pointer press, with click retained for keyboard/accessibility. A genuine native fullscreen-to-windowed transition also closes the presentation; rejected/unsupported entry leaves windowed performance available. Automatic fullscreen cleanup remains ownership-aware. Verify both standard/WebKit events, early press without click, reopening, and the normal workspace viewport after exit.

Verified WebKit iPad emulation at 834×1037 and 1112×759 with a synthetic three-song, 96-measure-per-song fixture. Portrait/landscape rotation, odd final spread, emulated touch after idle, and page-boundary transitions retain page selection. Same-host development profiling measured within-song next-frame median 172ms before versus 23ms after; these are diagnostic measurements, not physical-device performance. Relevant tests cover no workspace render, lyrics range refresh, swipe/click pairing, offline/reconnect, pedal keys and idle cleanup. Physical iPad App/PWA testing remains unverified.

## Cross-song rendering reuse — 2026-11-06

`setlistEditableSongs` 重用預備資料，`setlistBasePreviewSongs` 不依選取歌曲重建；有編輯草稿時才替換對應的當前曲。演出時背景選取互動不再使譜面重畫。跨歌仍走正常 React／版面更新，保留返回前一首最後一頁／雙頁組的語意。

本機正式 fixture build（Chromium，8 首合成歌曲、每首 48 小節）的歌單切歌 5 筆中位數為 90.2→38.2 ms，演出跨歌 5 筆為 117.9→40.7 ms。這是輸入事件到第二次 requestAnimationFrame 的代理值，非 INP 或實體 iPad／Safari 數據；進入演出模式及所有停頓並未一併解決。Chromium viewport 驗證手機／平板返回前曲第 2／2 頁，桌機返回雙頁組起點 1（含第 1、2 頁），獨立 finish review：**SHIP**。證據為 `output/playwright/performance-20261106/before-production.json`、`after-production-final.json`、`visual-check.log` 及 `performance-*.png`；完整範圍、測試與限制見 `docs/performance-improvements-2026-11-06.md`。未部署，無生產資料讀寫。

## First-use hint and personal notes — 2026-11-06

首次翻頁提示原本與登入後的個人筆記入口重疊。提示現在共用筆記底部 offset／44px 高度，向上預留 12px 與 safe-area，只有可用筆記的非歌詞演出 surface 套用。保留既有提示確認／記憶、idle 可讀、手寫時隱藏與立即翻頁行為，不改譜面尺寸或翻頁演算法。

`output/playwright/library-ux-20261106/{chromium,webkit}-notes-check.json` 均重現舊間距 overlap=true；修正後 390×844、844×390、834×1194、320×740 均 overlap=false、提示到筆記入口間隔 12px，筆記仍可開啟。已開圖檢查 before／after。與歌曲庫改動合併的 9 files／111 tests、lint、build 通過；獨立 review **SHIP**。完整紀錄見 `docs/library-ux-improvements-2026-11-06.md`。使用合成資料與瀏覽器 viewport，未驗證實體手機／iPad，未連接生產後端或部署。

## Idle taps and style invalidation — 2026-11-07, v0.12.27

Profile the complete App, including the touchstart/focus/chrome phase and work after animation-frame callbacks. A next-frame callback alone does not prove completed layout/paint. Chromium traces found 4,137–8,730 nodes restyled by the overlay chrome selector; per-control state narrowed the corresponding update to 12 nodes in the same synthetic fixture. Details, native WebKit touch coverage and physical-device limits are in `docs/release-0.12.27.md`.

The v0.12.27 implementation prepared one neighbor per idle callback after 500ms of quiet input; the v0.12.28 correction below replaces that scheduling policy. Rearm during page commands and active pen/finger movement; retain the current chart and up to two neighbors in each direction so a quick second tap can stay warm. Evict distant entries during the idle preparation pass. Keep source song IDs, personal ink, page offsets and per-entry fitting intact. Handwriting tools remain operable while the deferred buffer fills.

Suspend editable keyboard-capture refocusing during touch/pen contacts and the following compatibility mouse phase. Document capture must guard the React overlay capture handlers; retain normal heartbeat/foreground recovery after release and clear abandoned contacts on blur/pagehide/hidden visibility.

## Keep up with rapid song turns — 2026-11-07, v0.12.28

The user clarified that only rapid consecutive forward turns still felt delayed; waiting before the next song avoided it. Do not debounce every page turn by 500ms: that starves preparation while the user advances. Allow the active score a rendering opportunity, then prepare one chart per idle pass and continue filling without a per-chart half-second delay. Prioritize the next song, then the previous one and the remaining upcoming set. Keep a bounded working set of at most eight entries, with a 512-source-measure budget for optional charts; always include the active song and immediate neighbors. Record cold visited entries too so rapid returns retain their actual DOM/ink.

Pause while pen/finger contacts remain on the score, and resume after release/quiet. Preserve the per-entry page fitting, local navigation, touchend activation, focus protection, leaf chrome styling and accessible inactive controls. Browser evidence and limitations are in `docs/release-0.12.28.md`; do not treat next-frame callback timing as actual iPad presentation latency.

## First display of a prepared chart — 2026-11-07, v0.12.29

Keep the personal note tools inside their owning performance overlay. Mounting each new song's tools directly on the document body triggered a long first-visit style recalculation in WebKit. The retained layers include a transparent one-pixel gutter so WebKit can paint them before selection. Preserve the paper's content box, scale, ink coordinates and immediate switch. Verification is in `docs/release-0.12.29.md`.
