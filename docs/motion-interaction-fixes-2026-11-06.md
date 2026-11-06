# 互動動態修復紀錄 — 2026-11-06

本次整理側欄、互斥選項、選單、底部面板與編輯器的動態行為。狀態與資料變更立即生效；動畫只說明介面位置或選取關係，不延後使用者的操作。所有改動在本機完成，未部署、未操作生產歌曲資料。

判斷依據為 Emil Kowalski 的 [animate](https://github.com/emilkowalski/skills/blob/main/skills/animate/SKILL.md)、[review-animations](https://github.com/emilkowalski/skills/blob/main/skills/review-animations/SKILL.md)，以及專案既有 [DESIGN.md](../DESIGN.md) 動態規範。沿用 React 19、Motion 12.23 與既有 `uiMotion` tokens；未安裝額外 skill 或動態套件。

## 行為與實作

| 範圍 | 修復後行為 |
| --- | --- |
| 桌機／平板側欄 | 200ms 開啟、160ms 關閉。導覽 rail 固定，內容維持完整寬度，在 rail 後方移動。桌機工作區一次採用最終寬度，歌曲列不隨動畫每幀換行。 |
| 手機側欄 | 固定寬度、240ms 開啟／200ms 關閉。關閉內容立即 inert；遮罩使用純色透明度，移除側欄 backdrop blur。直接 resize 不加過渡。 |
| 互斥選項 | 一個 160ms 選取底色依按鈕實際 bounds 移動，label 固定。不同寬度與連續選取可中途轉向；文字／順序／尺寸變化直接校正，等內容 options 陣列重建不重播；wrap 保留靜態選取。 |
| 鍵盤與 reduced motion | 選取底色及 switch thumb 不做空間位移；鍵盤關閉立即。既有 reduced opacity 回饋保留。主音符鍵保持即時、固定幾何；鼓手六個演奏控制保留明確授權的 keyboard／MIDI 按壓回饋例外，一般設定按鈕不套此例外。 |
| Key／Capo | 選取先同步呼叫 `onChange`，立即關閉並返回 trigger 焦點；Escape 取消待執行的開啟 focus frame，`preventScroll` 避免畫面跳動。外部關閉不搶走下一個控制的焦點。 |
| Tempo change | 第一次開啟後保留 presence host，取消關閉能完成退出；成功選項立即提交。Escape 先標記取消再移回焦點，避免 input blur 將尚未提交的 BPM 寫入。 |
| 底部面板 | 保留 240ms／200ms 及 reduced 160ms opacity；離場立即 inert、停止 pending drag frame。session／generation 排除舊 completion，重新開啟不被前一輪關閉；live reduced 不重播入場或撤回已決定的關閉。 |
| Fullscreen 說明 | 補上 AnimatePresence，原生 dialog 的 exit、top layer、focus 與解除捲動鎖定可完成。全螢幕請求仍在原始點擊內同步觸發。 |
| 編輯器／譜面 | 移除段落選取的放大／位置漂移與過寬的 geometry transition；保留色彩、邊框、焦點及原有拖曳語意。譜面、音符輸入與固定鍵盤祖先不新增位移。 |
| 讀譜捲動 | 管理中的歌單預覽／段落導覽採共用 scroll policy：鍵盤、reduced、位置恢復及超過一個 viewport 的跳轉立即定位；短距離指標導覽可 smooth。使用者直接捲動可中斷導覽，途中不把經過的歌曲誤選為目前歌曲。此規則不宣稱所有既有 scroll call 都已改寫。 |

側欄獨立 review 找到一個實際漏點：入場時開啟 reduced motion，若動畫終點未變，僅把 duration 改成零不能可靠停止已在跑的動畫。修正後在偏好切換時明確停止並落定既有位移，保留瀏覽器的原生動畫路徑。

主要來源：`src/App.tsx`、`src/components/SetlistCompactControls.tsx`、`src/components/ui/MeasuredSlidingSelection.tsx`、`src/index.css`、`src/components/preview-edit/PreviewKeyboard.css`、`src/components/DrummerMode.css`、`src/hooks/useBottomSheetMotion.ts`、`src/components/{KeyPicker,CapoPicker,TempoChangeControl,PerformanceFullscreenControl}.tsx`、`src/components/{SongEditor,ChordSheet}.tsx`、`src/hooks/useSetlistPreviewNavigation.ts`、`src/lib/navigationScroll.ts`。

## 已完成的瀏覽器證據

證據目錄：[sidebar-motion-20261106](../output/playwright/sidebar-motion-20261106/)。此處為本機 fixture 與瀏覽器 viewport 驗證，不是實體手機／平板測試。

| 證據 | 已確認內容 |
| --- | --- |
| [controls-chromium.json](../output/playwright/sidebar-motion-20261106/controls-chromium.json) | 12 項通過；快速選取底色對齊且 label 不動、資料先提交、鍵盤／reduced、Key／Capo 焦點、外部焦點保留、sheet exit inert 及偏好中途切換。 |
| [controls-webkit.json](../output/playwright/sidebar-motion-20261106/controls-webkit.json) | 相同 12 項通過；另有 indicator frame 取樣。WebKit 引擎驗證不等同實體 iPad Safari。 |
| [sidebar-chromium-final.json](../output/playwright/sidebar-motion-20261106/sidebar-chromium-final.json)、[sidebar-webkit-final.json](../output/playwright/sidebar-motion-20261106/sidebar-webkit-final.json) | 最終兩引擎均通過三種 viewport 的 open／close／reverse；內容寬度 variation 為 0、rail 固定。鍵盤即時、reduced 位移 range 為 0，無水平溢出。入場中實際收到 matchMedia change 後，phone 落定 x=0、tablet／desktop x=80，native animation 數為 0。 |
| [sidebar-final-summary.json](../output/playwright/sidebar-motion-20261106/sidebar-final-summary.json) | 彙整兩引擎 movement、preferences 與 live reduced 結果，含各次 frame gap。 |
| [controls-chromium-layout.json](../output/playwright/sidebar-motion-20261106/controls-chromium-layout.json)、[controls-webkit-layout.json](../output/playwright/sidebar-motion-20261106/controls-webkit-layout.json) | 390px 深色下，選中 button 為透明、marker 顯示，無水平溢出；resize 後 marker 與按鈕的 deltaX／deltaWidth 均為 0。範圍僅為選取底色覆蓋及對齊，並非完整深色對比審計。 |
| [before.json](../output/playwright/sidebar-motion-20261106/before.json)、[after.json](../output/playwright/sidebar-motion-20261106/after.json) | 三種 viewport 的開啟、關閉、反轉 frame 取樣；配對畫面為 `before-{phone,tablet,desktop}.png` 與 `after-{phone,tablet,desktop}.png`。此組不是 live reduced 最後修正的單獨證明。 |

Controls 畫面另見 `controls-chromium.png`、`controls-webkit.png`；最終側欄畫面為 `after-{chromium,webkit}-{phone,tablet,desktop}.png`。已開圖檢查 Chromium 手機／桌機、WebKit 平板及深色手機選取底色，保留既有版型。獨立完成檢查已通過 menus、editor、controls；sidebar 最終方案也回報 **SHIP**，核對首次開啟、StrictMode、原生動畫值與快速反轉。

## 測試與最終檢查狀態

- Controls：四組相關測試 240／240 通過；補上 StrictMode 等防護後，小範圍再驗證 14／14 通過。兩輪有重複案例，不相加為唯一測試數。
- Menus／sheets：最終 focused 測試 5 files／46 passed，紀錄 `/tmp/chordmaster-motion-agent-focused-final.log`。獨立 reviewer 已對照 `/tmp/chordmaster-motion-agent-ya5wg6w2` 基線並回報 SHIP。
- Controls 基線保存於 `/tmp/chordmaster-motion-controls-before`，獨立 review 通過；editor／讀譜捲動亦經另一位 reviewer 唯讀確認無新增 blocker。
- 靜態 detector 掃描 13 檔，回報 401 項：11 warning、390 advisory。11 個 warning 來自既有字體宣告、條件式灰文字與 indigo heading，未由本次改動引入；此結果不代表掃描乾淨，也不把既有 advisory 升格為新的全域設計規則。
- 最終整合回歸：17 files／541 tests 全數通過，36.82s；原始紀錄 `/tmp/chordmaster-motion-regression.log`。前述 focused 輪次與這組有重複案例，不累加為唯一測試總數。
- `npm run lint`（`tsc --noEmit`）exit 0；`npm run build` exit 0，6.50s。正式 build 仍有既有大於 500 kB 的 chunk 警告。
- 最終 sidebar Chromium／WebKit 三種 viewport 的 open／close／reverse、keyboard／reduced／live change 全數通過，原始 JSON 與摘要列於上一節。

## 已知限制

Chromium 最終開啟首 frame gap 為手機 99.4ms、平板 97.6ms、桌機 86.8ms，首段仍有約 80–100ms 延遲，包含 App render、layout 與量測，不等同純動畫瓶頸。WebKit 對應取樣為 15／37／30ms；不同引擎與取樣條件不可作為直接 frame 效能比較。縮短過渡與移除 blur，不能單獨證明首段延遲已消除；本次不宣稱全部卡頓消失或穩定 60fps。

瀏覽器合成 fixture 與 viewport 不涵蓋真實歌曲複雜度、冷啟動、同步流量、低資源裝置或長時間演出。實體 iPad Safari／PWA 尚未由這組證據驗證。此前歌曲庫搜尋／切歌的量測另見 [效能修正紀錄](performance-improvements-2026-11-06.md)，不混作本次動畫成果。
