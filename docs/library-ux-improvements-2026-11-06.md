# 歌曲庫與演出提示改善 — 2026-11-06

本次完成歌曲庫搜尋辨識、個人瀏覽偏好、跨搜尋批次選取，以及首次翻頁提示被個人筆記擋住的修復。登入帳號的收藏／最近使用已具備跨裝置同步實作，獨立收尾 review 為 **SHIP**；正式啟用仍須先在 NAS 套用本機 migration，再部署前端。本次未連接 NAS 或歷史 Supabase Cloud，未修改生產資料、commit 或部署。

## 介面與行為

| 項目 | 完成的行為 | 主要來源 |
| --- | --- | --- |
| 首次翻頁提示 | 有個人筆記入口時，依共用底部 offset、44px 入口高度與 safe-area 將提示上移，保留 12px 間隔；提示確認與筆記入口各自可操作。保留 idle 可讀、手寫時隱藏及原翻頁流程。 | `src/App.tsx`、`src/index.css` |
| 歌詞搜尋 | 只有歌詞命中顯示摘要，取目前歌詞文件中的原文與命中附近內容。正規化搜尋仍能對回繁簡、全形、標點、跨行及 Unicode 原文；標題／metadata 命中不加無關歌詞。 | `src/lib/songSearch.ts`、`src/components/SongLibraryRow.tsx` |
| 同名辨識 | metadata 最低 64px，固定作者／譯者、版本／歌詞語言、音樂資料三層；缺漏作者／版本明確標示。版本後綴僅用於顯示拆分，語言取自歌詞文件，不改原歌曲名稱。協作 presence 獨立。 | `src/lib/songLibraryPresentation.ts`、`src/components/SongLibraryRow.tsx`、`src/components/SongLibraryPanel.css` |
| 常用歌曲與篩選 | 全部／最近使用／收藏搭配搜尋；Key、BPM 範圍與拍號可組合、收合保留並顯示條件數。最近使用依開啟順序，最多 100 首；未知調性／拍號不產生篩選選項，無效 BPM 範圍顯示錯誤。 | `src/components/SongLibraryFilters.tsx`、`src/App.tsx` |
| 批次管理 | 跨搜尋／篩選保留一份完整已選清單，可展開、逐首移除及清空；分享、封存／還原、刪除與重複清理均依同一清單。「全選目前結果」只改目前結果，不清掉其他選取。 | `src/components/LibrarySelectionSummary.tsx`、`src/App.tsx` |

個人曲庫的重複清理只比對已選且未封存歌曲的完整來源內容，保留第一份、確認後封存相同副本；歌單既有引用及撤銷保留。團隊曲庫不新增自動合併。管理、匯入／匯出與修改仍遵循原權限；收藏屬於個人偏好，不修改共用譜面。高頻搜尋與篩選立即生效，沒有新增歌曲列或譜面動畫。

## 登入偏好同步

`src/hooks/useSongLibraryPreferences.ts` 與 `src/lib/songLibraryPreferenceSync.ts` 使用既有 Supabase client 呼叫 `sync_song_library_preferences`，帳號與曲庫隔離。即時本機回饋之外，每次操作有獨立且不可覆寫的 outbox key，可跨重新載入重試；這不是僅限單一裝置的設計。

- 收藏逐首保留版本與 false 取消紀錄，合併反序回應時不復活已取消的收藏；最近使用分開保留伺服器確認的 `recentStates` 與尚未確認的樂觀顯示。確認後採伺服器時間，避免快時鐘紀錄永久壓住後續歌曲。
- 操作時鐘參考已觀察到的遠端時鐘；RPC 對過快的用戶端時間設上限。測試涵蓋慢／快時鐘、取消、反序回應及跨分頁合併。
- 每次 RPC 最多送 100 首，15 秒逾時。只清除伺服器 `applied` 確認的操作；來源歌曲尚未儲存到後端時保留 pending，不假裝完成。刪除清理只對本 scope 曾觀察到、後續確定移除的 ID 差集生效，避免清掉另一分頁尚未上傳的新歌。
- focus、online、回到可見頁面、進入收藏／最近使用、來源歌曲儲存及手動重試會刷新；沒有背景輪詢。切換帳號／曲庫不接受舊 scope 回應。
- 離線、RPC 失敗或 migration 尚不存在時，保留本機操作並顯示「收藏與最近使用尚未同步」及重試。成功合併才撤除提示。

本機 migration 為 `supabase/migrations/20261106112858_song_library_preferences.sql`。偏好表 RLS 限登入本人、目前可見的來源歌曲及相符曲庫；RPC 採 `security invoker`，沿用來源歌曲權限，不能把別人的帳號或另一曲庫歌曲寫入偏好。

正式部署順序為：先在生產 NAS 的 self-hosted Supabase 套用這份 migration，再發布包含本次 RPC／UI 的前端，最後以登入帳號驗證跨裝置收藏與最近使用。這些部署與生產驗證尚未執行；歷史 Cloud 專案不是部署目標。

## 驗證與證據

證據集中於 `output/playwright/library-ux-20261106/`，使用真實 App 與合成來源資料；網路攔截阻擋非本機請求。同步畫面使用真實 hook 搭配合成 API，沒有連線生產後端。

| 驗證 | 結果與證據 |
| --- | --- |
| Focused tests | 9 files／111 tests 通過（32.61 秒），含最後新增的快時鐘 confirmed recent-state 回歸；記錄 `/tmp/chordmaster-library-ux-tests.log`。獨立 reviewer 最終 **SHIP**，另獨立跑過 18 項同步測試。 |
| SQL | Disposable PGlite 套用全部 36 migrations，`supabase/tests/song_library_preferences.sql` 的 38 項 SQL statements 通過；記錄 `/tmp/chordmaster-library-preferences-sql.log`。非 NAS 整合測試。 |
| 靜態／建置 | lint、正式 build、`git diff --check` 通過。Build 5.61 秒，保留既有大於 500kB chunk 警告。 |
| 歌曲庫 Chrome／WebKit | 各驗證 390×844、834×1194、1440×900、320×740 的歌詞摘要、收藏、組合篩選、收合保留、跨搜尋選取與清空；無水平溢出。見 `{chromium,webkit}-library-check.json` 與對應 library／lyrics／filters／selection 截圖。 |
| 筆記與翻頁提示 Chrome／WebKit | 舊間距可重現 overlap=true；修復後 390×844、844×390、834×1194、320×740 均 overlap=false、間距 12px，筆記仍可開啟。見 `{chromium,webkit}-notes-check.json`、phone-notes-before-spacing 與各 notes-after 截圖。 |
| 同步 Chrome／WebKit | 模擬失敗時收藏仍立即可見；重試合併遠端與 pending 收藏，focus 再取得遠端更新，最終各 3 首收藏、4 次 API 呼叫、無溢出。見 `{chromium,webkit}-sync-check.json` 與 phone-sync-offline／restored 截圖。 |
| 深色手機 | 已開圖檢查 `chromium-phone-dark-lyrics.png`。Computed styles 的 title 對比 14.64、authors/version 6.64、snippet 9.64，背景 `rgb(22,27,34)`，無水平溢出；見 `chromium-dark-check.json`。只代表此畫面的文字，非全 app 對比審計。 |
| Detector | `ux-detector.json`：0 warning／15 advisory，包含既有及局部 10／11px 小字、5／6／7／14px 圓角、筆記語意色；不將它們提升為全域 token，也不宣稱全 app 掃描無問題。 |

已開圖檢查 Chromium 手機／摘要／篩選、WebKit 平板已選清單、筆記 before／after、同步失敗／恢復及深色手機。瀏覽器與合成 fixture 已於驗證後關閉。

## 搜尋量測與限制

`search-benchmark.json`／`search-benchmark.mjs` 使用 Node v22.23.2、darwin arm64 的 500 首合成歌曲，每首 1,306 個 UTF-16 字元，命中位於歌詞末段。量測涵蓋篩選／排序與全部 500 個摘要；正規化歌詞與原文位置映射會依歌曲文件重用，識別資訊依不可變歌曲物件與語言快取。

| 快取狀態 | 搜尋／排序 | 摘要 | 合計 |
| --- | ---: | ---: | ---: |
| 首次冷快取 | 51.184ms | 49.312ms | 100.496ms |
| 後續多輸入一字 | 1.096ms | 0.526ms | 1.622ms |
| 再多輸入一字 | 0.771ms | 0.343ms | 1.114ms |

這是一筆冷快取與兩筆暖快取的本機診斷，不是統計效能保證；不含模組初始化、查詢建構、React render 或 browser layout，也不是 browser INP／實體裝置數據。冷快取仍約 100.5ms，不宣稱搜尋卡頓或所有延遲已消失。未驗證實體手機、iPad Safari／PWA、真實雙裝置同步或生產 NAS RPC。先前側欄與切歌效能的證據及限制仍分別以 `motion-interaction-fixes-2026-11-06.md`、`performance-improvements-2026-11-06.md` 為準。
