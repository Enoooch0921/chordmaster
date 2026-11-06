# 歌曲庫與歌單切換效能紀錄 — 2026-11-06

本次減少歌曲庫與歌單切換時不必要的資料重建及譜面重繪。本機正式 fixture build 的歌單切歌與演出跨歌指標有明顯改善；500 首歌曲搜尋的差異較小，清空搜尋後仍會全量掛載結果，因此不能視為卡頓已全部消除。

改動與驗證均在本機完成，未部署，也未讀寫生產歌曲資料。獨立完成檢查回報 **SHIP**，本次效能改動沒有 blocker。

## 實作範圍

- 歌曲庫使用 memoized `SongLibraryRow` 與穩定的事件回呼，讓不相關的狀態變更不必重新繪製每一列。搜尋與排序結果以 memo 重用，依賴包含 `dictionaryState`，字典載入或更新後仍會重新計算。
- `setlistEditableSongs` 重用已預備的歌曲資料。`setlistBasePreviewSongs` 不再隨選取歌曲重建；有編輯草稿時，才在預覽集合中替換對應的當前歌曲。
- 演出模式下，背景的選取互動不再使所有譜面重畫。跨歌仍透過正常 React／版面更新處理，保留返回前一首最後一頁或最後一組雙頁的行為。
- `ManagementActions` 在第一次開啟時才掛載 `AnimatedPopover`；之後保留關閉動畫所需的生命週期，以及既有選單定位、鍵盤操作與焦點返回。

既有歌曲列排版、操作目標尺寸、權限、長按與批次操作流程沿用原本行為。本次沒有新增視覺 token。

## 正式建置量測

比較檔案為 [before-production.json](../output/playwright/performance-20261106/before-production.json) 與 [after-production-final.json](../output/playwright/performance-20261106/after-production-final.json)。兩者皆為 localhost 的正式 fixture build，以 Chromium 和合成資料測量：歌曲庫 500 首；歌單 8 首，每首 48 小節。歌單切換使用 1280×900，演出跨歌使用 768×1024。

[summary.json](../output/playwright/performance-20261106/summary.json) 保留各組樣本數、中位數與最小／最大值。同目錄另存 `fixture.tsx.txt`、`vite.config.ts.txt`、`benchmark.js.txt`、`run-benchmark.py.txt` 及 `visual-check.js.txt`，供重查量測資料、設定及操作步驟。

指標是輸入事件到第二次 `requestAnimationFrame` 的時間代理值，單位為毫秒；它不是 INP、完整呈現完成時間，亦不代表實體手機或平板的反應時間。樣本數有限，應以相同操作的前後對照解讀。

| 操作與樣本 | 修改前 | 修改後 | 解讀 |
| --- | ---: | ---: | --- |
| 歌單切歌，`switch-1` 至 `switch-5`，5 筆中位數 | 90.2 ms | 38.2 ms | 減少選取切換引發的重建與重繪 |
| 演出跨歌，5 筆 `performance-*-from-2` 中位數 | 117.9 ms | 40.7 ms | 跨歌切換改善；仍需正常 React／版面更新 |
| 歌曲庫搜尋，`search-0` 至 `search-6`，7 筆中位數 | 27.8 ms | 25.9 ms | 差異小，不能據此宣稱搜尋已大幅加速 |
| 清空窄搜尋，15 列恢復為 500 列，`search-6` 單筆 | 72.3 ms | 69.1 ms | 改善有限，仍需掛載大量結果 |

`switch-0` 與進入演出模式不納入上述切歌中位數；進入演出模式的單筆值為 89.9→87.5 ms，這次沒有明顯改善。修改後清空搜尋仍記錄到 69 ms long task，部分切歌及進入演出也仍有 long task，故不承諾所有操作均無停頓。

同目錄的 `before-dev.json`／`after-dev.json` 只供開發模式診斷，不作為正式建置的改善數據。CPU 降速檔案僅代表曾要求 CDP throttle，降速程度尚未校準，不作為實體慢速裝置的證據。

## 操作與畫面驗證

[visual-check.log](../output/playwright/performance-20261106/visual-check.log) 記錄 Chromium viewport 驗證；不是實體 iPhone、iPad 或 Safari 測試。

| Viewport | 搜尋結果 | 歌曲選單 | 水平溢出 | 演出跨歌返回 |
| --- | --- | --- | --- | --- |
| 390×844 | 500→15→500 | 首次開啟成功，Escape 返回觸發按鈕焦點 | 無 | 下一首後返回前一首第 2／2 頁 |
| 834×1194 | 500→15→500 | 首次開啟成功，Escape 返回觸發按鈕焦點 | 無 | 下一首後返回前一首第 2／2 頁 |
| 1280×900 | 500→15→500 | 首次開啟成功，Escape 返回觸發按鈕焦點 | 無 | 返回前一首雙頁組起點 1，涵蓋第 1、2 頁 |

畫面位於 [performance-20261106](../output/playwright/performance-20261106/)：`library-{phone,tablet,desktop}.png`、`menu-{phone,tablet,desktop}.png` 與 `performance-{phone,tablet,desktop}.png`。

已開圖檢查手機歌曲庫、平板選單與手機／桌機演出畫面，既有版型與選單保留，未見本次改動引入的視覺回歸。臨時伺服器與隔離瀏覽器已關閉。

## 檢查結果

- 相關測試第一組：6 個檔案、82 項通過；原始紀錄 `/tmp/chordmaster-performance-tests-2.log`，已保存為 [tests-remaining.log](../output/playwright/performance-20261106/tests-remaining.log)。
- 最後回歸測試：5 個檔案、36 項通過；原始紀錄 `/tmp/chordmaster-performance-tests-final.log`，已保存為 [tests-final.log](../output/playwright/performance-20261106/tests-final.log)。兩組包含重複的 `sidebarRendering` 測試，不能直接相加作為不重複測試總數。
- `lint`（`tsc --noEmit`）通過；原始紀錄 `/tmp/chordmaster-performance-lint.log`，已保存為 [lint.log](../output/playwright/performance-20261106/lint.log)。
- 正式應用程式 build 通過；原始紀錄 `/tmp/chordmaster-performance-app-build.log`，已保存為 [build.log](../output/playwright/performance-20261106/build.log)。既有大於 500 kB 的 chunk 警告仍存在。
- [detector.json](../output/playwright/performance-20261106/detector.json) 保留原有 2 個 warning 與 59 個 advisory；本次沒有新增視覺 token。

## 剩餘限制

清空窄搜尋後，歌曲庫仍全量掛載 500 列，尚未採用列表虛擬化或分段掛載。這是後續改善大量結果操作的方向，需連同焦點、長按選取、批次操作及捲動位置一起驗證。

本次合成資料不涵蓋所有真實譜面複雜度、網路同步、冷啟動與實體裝置資源限制；也沒有證明實體 iPad Safari／PWA 的延遲已改善。正式建置量測顯示切歌的局部改善，並不取代真實裝置上的長時間演出測試。
