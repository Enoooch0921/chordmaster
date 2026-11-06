---
version: 1
slug: "src-app-performance-mode"
primary_target: "src/App.tsx"
related_targets: ["src/hooks/usePerformanceChrome.ts", "src/index.css", "src/App.performanceSafety.test.tsx", "src/App.lyricsLayout.test.tsx", "docs/performance-display.md"]
---

# Immediate performance page turns

Mode: Operate / Read. Preserve the existing white A4 pages, dark surround, single/dual-page fit, idle chrome and full-height page-turn hit areas.

Within-song turns update the measured translation and page metadata without a workspace render. The page ref is authoritative for immediate tap/swipe/pedal input; reapply it before unrelated React commits paint. Continuous lyrics updates its dedicated range span. Cross-song changes retain normal React/layout and previous-song final-spread semantics.

Chrome uses one container presentation attribute and the existing two-second hide timer. Only chrome items fade and stop taking pointer input; the independent previous/next buttons remain active. Keep timer cleanup on exit and reopening visible. Notation layout remains unchanged; the explicitly requested swipe feedback is documented below.

## Direct swipe feedback and discovery — 2026-11-06

Updated after the user's 2026-11-06 request to keep the reading surface stationary: never translate, scale or fade the score for gesture feedback. A 40px pointer-transparent, aria-hidden direction cue appears 16px above the finger and follows only confirmed horizontal intent. It brightens at the existing 44px turn threshold and fades out over the shared 125ms UI fade; taps hold their cue for 100ms before fading. Use existing `--ease-ui-out` and `--ui-fade-duration`, no new motion library. Reduced motion keeps the cue at the initial touch position, with opacity feedback only. Keyboard/pedal and assistive activation do not produce touch motion. Keep the authoritative page translator independent and avoid hook/workspace state updates per touch move. Preserve the 8px intent threshold, cross-song previous/final-spread behavior, handwriting exclusion, cancellation and compatibility-click suppression across song changes.

The first-use inline note explains both horizontal swipe and tapping the screen halves. It remains readable when idle chrome fades, has a 44px acknowledgement and remembers acknowledgement/successful swipe locally. Hide it while handwriting is active. When the authenticated non-lyrics surface offers personal notes, position the hint above the shared launcher bottom offset and 44px launcher height with a 12px gap plus safe-area inset. Keep both the hint acknowledgement and notes launcher reachable; neither covers the other. Synthetic desktop/tablet/phone evidence is in `output/playwright/performance-swipe-20261106/`, with the later overlay-spacing correction below; physical-device performance is not established.

Explicit Exit closes both presentation and fullscreen on primary pointer press, with click retained for keyboard/accessibility. A genuine native fullscreen-to-windowed transition also closes the presentation; rejected/unsupported entry leaves windowed performance available. Automatic fullscreen cleanup remains ownership-aware. Verify both standard/WebKit events, early press without click, reopening, and the normal workspace viewport after exit.

Verified WebKit iPad emulation at 834×1037 and 1112×759 with a synthetic three-song, 96-measure-per-song fixture. Portrait/landscape rotation, odd final spread, emulated touch after idle, and page-boundary transitions retain page selection. Same-host development profiling measured within-song next-frame median 172ms before versus 23ms after; these are diagnostic measurements, not physical-device performance. Relevant tests cover no workspace render, lyrics range refresh, swipe/click pairing, offline/reconnect, pedal keys and idle cleanup. Physical iPad App/PWA testing remains unverified.

## Cross-song rendering reuse — 2026-11-06

`setlistEditableSongs` 重用預備資料，`setlistBasePreviewSongs` 不依選取歌曲重建；有編輯草稿時才替換對應的當前曲。演出時背景選取互動不再使譜面重畫。跨歌仍走正常 React／版面更新，保留返回前一首最後一頁／雙頁組的語意。

本機正式 fixture build（Chromium，8 首合成歌曲、每首 48 小節）的歌單切歌 5 筆中位數為 90.2→38.2 ms，演出跨歌 5 筆為 117.9→40.7 ms。這是輸入事件到第二次 requestAnimationFrame 的代理值，非 INP 或實體 iPad／Safari 數據；進入演出模式及所有停頓並未一併解決。Chromium viewport 驗證手機／平板返回前曲第 2／2 頁，桌機返回雙頁組起點 1（含第 1、2 頁），獨立 finish review：**SHIP**。證據為 `output/playwright/performance-20261106/before-production.json`、`after-production-final.json`、`visual-check.log` 及 `performance-*.png`；完整範圍、測試與限制見 `docs/performance-improvements-2026-11-06.md`。未部署，無生產資料讀寫。

## First-use hint and personal notes — 2026-11-06

首次翻頁提示原本與登入後的個人筆記入口重疊。提示現在共用筆記底部 offset／44px 高度，向上預留 12px 與 safe-area，只有可用筆記的非歌詞演出 surface 套用。保留既有提示確認／記憶、idle 可讀、手寫時隱藏與立即翻頁行為，不改譜面尺寸或翻頁演算法。

`output/playwright/library-ux-20261106/{chromium,webkit}-notes-check.json` 均重現舊間距 overlap=true；修正後 390×844、844×390、834×1194、320×740 均 overlap=false、提示到筆記入口間隔 12px，筆記仍可開啟。已開圖檢查 before／after。與歌曲庫改動合併的 9 files／111 tests、lint、build 通過；獨立 review **SHIP**。完整紀錄見 `docs/library-ux-improvements-2026-11-06.md`。使用合成資料與瀏覽器 viewport，未驗證實體手機／iPad，未連接生產後端或部署。
