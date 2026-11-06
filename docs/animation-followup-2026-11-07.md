# 音符鍵盤、面板中斷與批次操作動畫

本輪依使用者「繼續看哪些動畫可以改進」的要求，接續前一輪側欄與閱讀畫面改善。以 improve-animations 做唯讀審查、animate 實作修正，再依 review-animations 與 React 檢查原則驗證。僅使用本地合成歌曲；未讀寫正式後端，未發佈。

## 修正與交互理由

| Before | After | Why |
| --- | --- | --- |
| 音符鍵的 `transform: none` 沒有覆蓋 Tailwind 的獨立 `translate`、`scale`，按住仍有細微位移／縮小 | 音符與工具鍵位置固定，按下立即變色；手機／平板的浮動按鍵預覽保留 | 高頻輸入不需鍵帽移動，也不應讓命中區域看起來漂移。`PreviewKeyboard.css` |
| 手指按住後，鍵盤開始退出，放開仍可能透過合成 click 多輸入一次；預覽也可能停留在已關閉的鍵盤上方 | presence 改為退出時取消該次按壓，保持相容 click 的攔截直到放開；同時移除按鍵預覽，拒絕 inert 區域的新輸入 | 關閉已經代表停止編輯，退出動畫僅作視覺收尾。`PreviewBarEditor`、`useKeyboardTouchPress`、`useKeyboardKeyPreview` |
| 使用滑鼠／觸控打開面板後立刻改用 Tab 或打字，已開始的滑入仍繼續 | 音符鍵盤、原生對話視窗、底部面板立即完成目前動態；內容切換淡入立即顯示完整內容 | 實體鍵盤接手時要提供穩定的焦點與位置；共享事件觀察器，只在輸入方式改變時通知，不因每次按鍵重繪整張歌譜。`useKeyboardMotionInterrupt` 及相關 motion hooks |
| 批次工具列與移動／複製專案視窗共用 AnimatePresence，卻沒有不同的 key，視窗可能直接消失，跳過退出 | 給工具列、專案視窗及兩個離開共享確認視窗明確 key；批次工具列改用已有的 PresenceSurface | 每個獨立表面必須有自己的生命週期；取消後立即 inert／aria-hidden，淡出期間不能重複操作。`App.tsx` |
| 一部分載入圖示在「減少動態效果」下仍持續旋轉 | 該偏好下停止共用 animate-spin 旋轉，保留圖示與載入文字 | 尊重減少動態偏好，仍可辨識載入狀態。`index.css` |

## 驗證

- 10 個相關測試檔、226 項測試通過，涵蓋取消按壓、相容 click、presence 退出及反向、實體鍵盤接手、過期動畫完成回呼、原生視窗焦點／捲動鎖、底部面板與 App 側欄。
- `npm run lint`、`npm run build`、`git diff --check` 通過。建置仍提示既有部分 chunk 超過 500 kB；本輪沒有宣稱改善載入大小。
- Chrome 與 WebKit，390、834、1440 px：實際 PreviewBarEditor 按鍵按住前後幾何不變，獨立 translate／scale 為 none；鍵盤進出、原生視窗、底部面板在 Tab 接手後停穩，退出後移除 DOM 並解除捲動鎖；內容淡入不妨礙輸入。
- 手機／平板尺寸合成 touch 事件：按住 D、開始關閉、放開及相容 click 後，新增輸入次數為 0，按鍵預覽消失。桌面不使用該觸控轉換路徑；另外以 WebKit 的實際滑鼠按住／關閉／放開，在三種尺寸均確認新增輸入次數為 0。
- Chrome 的實際 App：選取歌單、開啟「移到專案」、關閉視窗時仍存在退出 DOM，立即 inert；動畫結束後視窗移除、同一個批次工具列保持；取消選取後工具列立即 inert 並完成移除。
- 減少動態：三種尺寸、兩個瀏覽器的鍵盤沒有位移，載入圖示不旋轉。
- 瀏覽器驗證按實際繪製幀取樣；不是 FPS 基準測試，也不是實體 iPad 的量測。

本地證據：`output/playwright/animation-round2-20261107/` 中的 `chrome-check.log`、`webkit-check.log`、`app-batch-check.log`、`native-release.log` 與畫面截圖。測試頁在 `tmp/animation-round2-20261107/`，使用真實元件與合成資料，不讀取正式憑證。桌面主矩陣中的強制合成 click 故意繞過瀏覽器 inert，不能當作使用者輸入結果；桌面取消輸入結論以 `native-release.log` 的實際滑鼠操作為準。

## 審查結論

Approve：本輪修改在所測範圍內通過。音符輸入維持立即回饋，表面進出可以中斷，退出不留下可操作的舊控制項。未為歌詞、搜尋結果、切歌或閱讀譜面新增移動動畫。

本輪未改動快捷鍵說明視窗的焦點管理，也未擴大到所有 popover 的進場中斷；這些不列為已修正項目。前一輪側欄／歌詞閱讀修正見 `animation-followup-2026-11-06.md`。
