---
version: 1
slug: "song-library-sidebar"
primary_target: "src/App.tsx"
related_targets: ["src/components/SongLibraryPanel.css", "src/components/ProjectManagementPanel.tsx", "src/components/SongLibraryRow.tsx", "src/components/SongLibraryFilters.tsx", "src/components/LibrarySelectionSummary.tsx", "src/hooks/useSongLibraryPreferences.ts", "src/lib/songLibraryPreferenceSync.ts"]
---

# Song library sidebar

Mode: Operate. Existing-world, code-led refinement continuing the user-selected playlist appearance. User asked on 2026-10-27『歌曲庫你也可以開始設計』after selecting B’s mature clear queue and A’s per-song direct settings for setlists, explicitly no bottom inspector. Library is a collection of source songs rather than an ordered performance list: do not add sequence numbers, editable per-song Key/Capo or a bottom inspector.

THESIS: Make browsing and finding a song immediate, and let secondary management actions appear on demand.
OWN-WORLD: Existing green ChordMaster accent, semantic light/dark surfaces, Inter/PingFang UI,16px row titles,12px metadata and44px interactive targets. Preserve source song facts and every permission boundary. No new brand, images, seed or comp tournament.
FIRST VIEWPORT: A quiet muted header with flexible Search, permitted New song and one labeled More control on the same horizontal row, followed by All/Recent/Favourites and collapsible filters, then count/native sort. Recent shows last-opened order instead of native sort. Keep Song library as a screen-reader heading without a repeated visible title row. At container widths of 300px or less, New song shows only its plus icon, retaining its full accessible name, tooltip and 44px target so Search stays usable. The `canEditTeamSongs` gate still controls New/More; viewers get the search field's full width without empty management-action slots and retain personal favourites. Flat divided rows give long names a wrapping title. A 64px minimum identity block reserves authors/translator (20px), version and lyric-language labels (20px), then musical facts (24px); missing authors/version receive explicit labels. Editing presence occupies its own area rather than replacing identity. The displayed key is a neutral tile with 26px minimum width and 24px height, followed by tempo and meter. Separate sibling 44px favourite and permitted overflow targets occupy the right action stack. Soft green marks the current song. Linked team source updates retain their own meaningful visible state.
STORY: Click a song to preview through the existing guarded selection handler and record its use. Literal lyric hits show an excerpt around the original matching phrase from the current lyric document; metadata-only hits do not show a lyric excerpt. All/Recent/Favourites combine with search and Key/BPM/meter filters, whose state survives collapse. More offers existing edit/duplicate/transfer/archive/restore/permanent-delete capabilities as permissions allow. Header More exposes batch management, imports, exports and Include archived when archived songs exist. Enabling Include archived adds archived songs to active results and shows “含封存” beside the count. Bulk management keeps one selected-song collection across searches and filters: its disclosure reviews all selected songs, supports individual removal and Clear selection, and retains the hidden-selection note. Share/archive/restore/delete and duplicate cleanup act on the complete selection; Select results only adds/removes current results. Personal duplicate cleanup archives identical selected active copies after confirmation, keeps the first and preserves setlist references/undo. Search, sort, long-press, IME-safe rename commit and permissions preserve current behavior.
FORM: Same flat-row language and neutral header ground as the chosen playlist, with no repeated file icon blocks, nested cards or ornamental shadows. Library scroll insets are 8px horizontally and selection content adds 8px; setlist detail uses a 12px pane inset, with a 4px list outdent and 4px row inset. These are local compositions, not one shared 12px inset rule. Native sort control, clear search and optional clear-search recovery remain. No new entrance animation on a high-frequency library switch; existing drawer and anchored menu motion remain. Light and dark contrast use established semantic tokens.
QUALITY BAR: At280px sidebar and390px phone, complete titles wrap, metadata has a clear hierarchy, all actions are readable and reachable. Menus are portal-based siblings of selection controls and do not select a song when opened. Viewers retain browsing without write/export controls. Archived rows expose correct actions. Batch controls do not push the list off screen. Existing sync notices and preview position behavior stay intact; no production score/database writes.
PREFERENCE SYNC: Favourites and the most recent 100 opened songs are personal to the signed-in account/library. They update immediately, retain an immutable per-operation outbox across reloads, and merge through the configured NAS Supabase RPC; they do not change shared song content. Per-song false favourite states, confirmed recent-history state and remote-aware clocks protect cancellation and ordering. Only server-applied source IDs acknowledge pending work; unavailable sources stay pending until a source save/retry succeeds. Focus/online/visible return and entering Recent/Favourites refresh, without background polling. Failed or missing RPC/migration shows Retry rather than implying success. Formal cross-device availability requires the NAS migration followed by frontend deployment; both remain unapplied/unpublished in this task.
FINISH: Parent captures and opens actual App desktop/sidebar, mobile and menu/bulk states. Focused behavior tests plus existing relevant App regressions, lint/build and one static detector. Fresh independent finish reviewer then documenter; no commit/deployment unless requested.

## Implemented evidence

The actual App library branch and `src/components/SongLibraryPanel.css` implement this contract. The 2026-10-28 compact header measures 105px rather than 157px at a 339px sidebar. Current captures are `.impeccable/review/compact-search-20261028/library-after.png`, `library-mobile.png`, `library-narrow.png` and `library-dark-en.png`, covering the sidebar, 390px phone, 304px narrow viewport, and dark/English state. Focused header/navigation/library validation passed 34 tests, typecheck and production build. An independent finish review returned **SHIP** after correcting root New contrast and confirming that setlist search waits until a pointer click completes before collapsing. The preview uses synthetic fixtures; these changes are local and unpublished, with no production backend writes.

The preceding row-composition evidence remains `.impeccable/review/balanced-library-20261027/library-desktop.png`, `library-mobile.png` and `library-dark.png`. Its independent review and 405 tests across 11 files covered the corrected library/setlist rows; its former heading-and-search stack is superseded by the compact header above, and its 44px metadata area is superseded by the 2026-11-06 identity block.

Earlier captures in `.impeccable/review/song-library-20261027/` retain menu and bulk-management evidence. Their layout and prior ship verdict are superseded by the corrected hierarchy above: the user rejected the preceding plain library appearance on 2026-10-27. The current 64px identity area and key tile are the canonical composition; the former visible-only share selection is superseded by the full selected-song collection.

The preceding row refinement's four scoped detector advisories concern the local warning color, native-select corner radius and two compact archive labels. They remain intentional local details, not additions to the global token system. The compact-header layout detector returned no findings. Pre-existing sidecar/token drift is outside this refinement.

## Touch selection and sidebar state — 2026-11-06

Long-press enters multi-selection without native text selection or the iOS callout on song selection surfaces; editable text fields retain native selection. Bulk controls explicitly expose “刪除所選（可還原）” for active songs using the existing recoverable archive handler; permanent deletion remains in archived-song management. Scroll/multitouch cancels a pending long-press.

Touch/pen sidebar controls commit on the first primary press and ignore their matching compatibility click. The expansion toggle's green state represents actual expansion. Press the current workspace entry again to close it; switching Songs/Setlists opens that workspace. Synthetic hover after touch must not reopen a closed drawer. iPad-size native touch emulation and focused tests cover first-press open/green, next-press close and keyboard activation. Evidence: `output/playwright/interaction-feedback-20261106/ipad-check.log`. Physical iPad Safari remains unverified.

## Rendering reuse — 2026-11-06

歌曲列以 memoized `SongLibraryRow` 與穩定事件重用；搜尋／排序 memo 包含 `dictionaryState`。`ManagementActions` 首次開啟才掛載 `AnimatedPopover`，之後保留關閉動畫、Escape 與焦點返回。既有列排版、權限和選取流程不變。

本機正式 fixture build 的 500 首搜尋 7 筆中位數為 27.8→25.9 ms；清空窄搜尋為 72.3→69.1 ms，改善有限，仍全量掛載結果。指標為輸入事件到第二次 requestAnimationFrame 的代理值，非 INP 或實體裝置數據。Chromium 390×844、834×1194、1280×900 驗證 500→15→500、首次開啟選單與 Escape 焦點返回，無水平溢出。獨立 finish review：**SHIP**。完整量測、測試及限制見 `docs/performance-improvements-2026-11-06.md`；畫面與 `visual-check.log` 位於 `output/playwright/performance-20261106/`。未部署，無生產資料讀寫。

## Interaction motion evidence — 2026-11-06

桌機／平板側欄採 200ms 開啟、160ms 關閉：導覽 rail 固定，內容維持完整寬度並從 rail 後方滑入；桌機工作區只切換一次最終寬度，不逐幀擠壓歌曲列。手機保留固定寬度及 240ms／200ms 邊緣滑入／退出。側欄遮罩移除 backdrop blur，調整寬度立即跟隨操作。關閉內容立即 inert；鍵盤操作與 reduced motion 不做位移。偏好切換時明確停止並落定既有位移，即使終點相同也不得繼續原動畫。

顯示模式、小節高度等互斥選項使用 160ms 共用底色移動，文字固定、選項立即生效；依實際按鈕寬度量測，快速連點可中途轉向，resize／文案重排直接校正，wrap 保留靜態選取。開關、Key／Capo、Tempo 與底部面板同步遵守鍵盤／reduced、焦點回復及退出期間不可再操作的規則。譜面與音符輸入不新增動畫。

已核對 `output/playwright/sidebar-motion-20261106/controls-chromium.json` 與 `controls-webkit.json`，各 12 項通過，包含快速選取、操作先於動畫完成、鍵盤／reduced、焦點、sheet inert exit 與偏好切換。最終 `sidebar-{chromium,webkit}-final.json` 均通過 phone／tablet／desktop 開啟、關閉、反轉、固定內容寬度與 rail 位置、鍵盤即時、reduced 無位移及無水平溢出；入場中變更 reduced 後，位移落定且 native animation 數為 0。摘要為 `sidebar-final-summary.json`。`controls-{chromium,webkit}-layout.json` 另確認 390px 深色選取底色可見及 resize 對齊，未宣稱完整深色對比審計。

Menus、editor、controls 獨立 review 通過；sidebar review 發現的 live reduced 同終點問題已修正，最終方案 review 回報 **SHIP**。整合 17 files／541 tests、lint 與正式 build 通過，保留既有大於 500 kB 的 chunk 警告。靜態掃描 13 檔仍有 11 warning／390 advisory，11 個 warning 為既有樣式宣告，本次未引入。最終畫面為 `after-{chromium,webkit}-{phone,tablet,desktop}.png`；已開圖檢查 Chromium 手機／桌機、WebKit 平板及深色手機選取底色。完整結果集中於 `docs/motion-interaction-fixes-2026-11-06.md`。

Chromium 最終開啟首 frame gap 為手機 99.4ms、平板 97.6ms、桌機 86.8ms，仍有約 80–100ms 首段延遲，包含 App render 與量測，不等同純動畫成本；WebKit 的 15／37／30ms 為不同引擎取樣，不作效能比較。不可據此宣稱全部卡頓消失、穩定 60fps 或實體 iPad Safari／PWA 已驗證。變更維持本機，未部署、未操作生產資料。

## Search, identity, selection and preference sync — 2026-11-06

歌詞命中列顯示原文摘要；同名歌曲使用作者／譯者、版本／歌詞語言、Key／BPM／拍號三層固定欄位，metadata 最低 64px，presence 獨立。新增收藏／最近使用，以及可收合且保留條件的 Key、BPM 範圍、拍號篩選。跨搜尋的已選清單可展開、逐首取消與清空；分享、封存與個人重複清理一致使用完整選取。這些契約取代上述歷史截圖中的 44px metadata 與 visible-only 分享行為。

登入偏好同步已實作，使用既有 NAS-target Supabase client 的 RPC 與本機 migration `supabase/migrations/20261106112858_song_library_preferences.sql`。Immutable outbox、false favourite tombstone、confirmed recent base、反序回應合併及裝置時鐘差異已有測試；未上傳的來源歌曲不誤認已同步，僅對已觀察到且後續移除的來源 ID 清理 pending。RLS 限本人帳號、可見來源及相符曲庫，RPC 使用 security invoker。失敗保留本機操作並顯示重試；正式跨裝置使用仍須先在 NAS 套 migration、再部署前端。本次未連接 NAS／Cloud、未 commit 或部署。

`output/playwright/library-ux-20261106/` 的 Chromium／WebKit 各涵蓋 390×844、834×1194、1440×900、320×740：摘要、收藏、組合篩選／收合保留、跨搜尋選取／清空通過，無水平溢出。同步 smoke 使用真實 App／hook 與合成 API，離線操作、重試及 focus 拉取另一裝置資料後均為 3 首收藏（各 4 次呼叫）；不是 NAS 整合測試。已開圖檢查 Chromium 手機摘要／篩選、WebKit 平板選取、同步失敗／恢復與深色手機。深色該畫面 title／authors-version／snippet 對比為 14.64／6.64／9.64，非全 app 對比審計。

最終 focused 9 files／111 tests、lint、build、diff whitespace check 通過；獨立 reviewer **SHIP**，另獨立跑過 18 項同步測試。Disposable PGlite 套用全部 36 migrations 與 38 項 SQL statements 通過。Detector 為 0 warning／15 advisory，含既有及局部小字、圓角、筆記語意色，未宣稱全 app 無問題。500 首本機 Node 搜尋＋全部摘要冷快取 100.496ms，兩次後續輸入暖快取 1.622／1.114ms；不包含 React／browser layout，非 INP 或實體裝置效能。完整證據、首次翻頁提示與筆記間距修復、部署順序及限制見 `docs/library-ux-improvements-2026-11-06.md`。

# Phone workspace switching — 2026-11-06 follow-up

The phone drawer's Songs/Setlists tabs retain the existing 160ms shared selection and 125ms content fade. Keep the covered preview mounted while switching categories so hidden score layout does not compete with that feedback. The preview is inert while covered, resumes current props/callbacks on close, and cannot retain content across account/library/selected-resource changes. Desktop/tablet preview behavior and explicit song-selection drawer dismissal remain unchanged. Pause preview scroll tracking while the phone drawer covers it. See `docs/mobile-workspace-tabs-2026-11-06.md` for verification and limits.

## Setlist row hit area — 2026-11-06 follow-up

The native song-selection button now covers the entire left reading area, including bottom padding and blank space. Keep drag and overflow buttons above its hit area; Key/BPM remain independent. The keyboard focus outline follows the full selectable area. Native touch, scrolling, reordering and responsive checks are recorded in `docs/setlist-song-hit-area-2026-11-06.md`; not yet deployed.

The follow-up audit also extends library song selection over its source/presence notes and setlist-card selection over card padding. Independent actions and multi-selection remain separate targets. Popover exit, rapid toggles, reduced motion and swipe-close checks passed without altering motion timings. See `docs/interaction-hit-area-audit-2026-11-06.md` for confirmed issues, rejected hypotheses and validation scope; not yet deployed.

## Search relevance — 2026-11-11

Rank the song name before secondary fields: complete literal title, complete title pronunciation/initials, title prefix, title fragment, author/version/section and other metadata, then literal lyrics. Within each title tier, literal input precedes phonetic input and keyboard recovery. Strip trailing parenthesized version/status labels only when scoring the base title; keep the complete stored title searchable. Equal relevance preserves the caller's current ordering, including recent/name sorting. An empty query preserves that ordering entirely. Dictionary loading must recompute results for the existing query, and filtering must not select a different song.

Regression fixtures cover `dr`/`DR`/`ㄉㄖ` placing 點燃 above unrelated Drop sections, full versioned titles, Chinese prefixes/fragments, metadata, lyrics, stable ties and lazy dictionary readiness. Focused search/library/setlist/sidebar validation passed 5 files / 108 tests; TypeScript and the production build passed. Browser evidence is recorded in `output/playwright/search-ranking-20261111/` using the actual App with six synthetic songs resembling the reported search. This change adds no visual styles and performs no production data reads/writes; it remains local and undeployed.
