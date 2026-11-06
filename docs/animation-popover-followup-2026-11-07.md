# 小選單與鍵盤操作的第三輪改善

接續使用者「還有嗎」的要求，針對前一輪未涵蓋的小選單、展開區與快捷鍵說明檢查。沿用 improve-animations 的唯讀審查，再以 animate 實作。沒有增加歌譜或歌詞位移，未讀寫正式資料、未發佈。

| Before | After | Why |
| --- | --- | --- |
| AnimatedPopover 與 AnimatedDisclosure 在滑鼠打開後立即按鍵，原本的縮放／淡入仍可能繼續 | 接入既有 useKeyboardMotionInterrupt，以 MotionValue 完成當前動畫；退出同樣正常釋放 presence | 同層工具在鍵盤接手時應穩定顯示；不為按鍵重繪 App，不另設動畫時間或曲線 |
| KeyboardPopover 在 visibility:hidden 的定位階段呼叫 focus；Enter 開啟「設定」後，Tab 跳到背景「顏色」按鈕 | 定位狀態提交、面板可見後才 focus；調整位置時保留面板內輸入焦點；按關閉鈕或 Escape 返回觸發按鈕 | 畫面顯示與可操作焦點必須一致，不能只看到選單卻操作到背景 |
| 快捷鍵說明只在開啟時 focus 關閉鈕，Tab 可以離開視窗，關閉後沒有還原焦點 | 重用 useModalFocus，限制 Tab／Shift+Tab 並在關閉後還原開啟前焦點；維持立即開關 | 快捷鍵操作不應等待動畫，也不應在關閉後丟失鍵盤操作位置 |

## 驗證與範圍

- 7 個相關測試檔、196 項測試通過，涵蓋 popover／disclosure 的鍵盤中斷、退出、快速反向、尚未定位、Key／Capo 選取、音符鍵盤、歌曲庫展開區、焦點限制與還原。
- `npm run lint`、`npm run build`、`git diff --check` 通過。仍有既有大型 chunk 警告，沒有宣稱本輪改善下載大小。
- Chrome／WebKit，390、834、1440 px：選單與展開區在 Tab 接手後停穩，退出立即 inert 並移除；快速反向保留同一個面板；減少動態時沒有縮放。
- 同一批尺寸確認「設定」可見後獲得焦點、Tab 進入面板、resize 不搶走輸入框焦點、明確關閉返回觸發按鈕；快捷鍵視窗鍵盤開啟後可循環 Tab，Escape 返回開啟前焦點。
- Chrome 實際 App 合成歌單頁驗證快捷鍵按鈕、Tab／Shift+Tab、Escape、`?` 重新開啟、按鈕關閉，焦點皆正確；視窗本體沒有進出動畫。
- WebKit 的滑鼠點按按鈕依平台慣例不一定聚焦該按鈕。焦點還原以開啟前實際焦點為準，沒有強制改寫 Safari 的滑鼠聚焦規則。
- 曾懷疑 KeyboardPopover／NotationColorControls 關閉時清空 position 會跳過淡出，但實際 React／Motion 驗證顯示 AnimatePresence 保留退出元素的既有樣式，淡出正常，因此沒有修改這段行為。

本地證據位於 `output/playwright/animation-round3-20261107/`：`before-keyboard-popover.log`、`chrome-check.log`、`webkit-check.log`、`app-help-check.log` 及截圖；測試頁在 `tmp/animation-round3-20261107/`，全部使用本地元件與合成資料。瀏覽器驗證不代表實體 iPad 的 FPS 量測。

Approve：本輪修改通過所列範圍。保留既有小選單 160／125ms 與展開區 125ms 的指標操作回饋，鍵盤接手立即完成，不增加裝飾性動態。延續紀錄見 `animation-followup-2026-11-07.md`。
