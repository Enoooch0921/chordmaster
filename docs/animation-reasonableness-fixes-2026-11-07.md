# 動畫合理性修正｜2026-11-07

已完成前輪審查的 A01–A05，以及可選的曲序拖曳預覽。依使用者指示，已棄用的完整「編輯歌曲」頁面不在本輪範圍；檔案雜湊確認 `SongEditor.tsx` 未改動。本輪沒有正式資料讀寫、提交或發佈。

## 已完成

| Before | After | Why |
| --- | --- | --- |
| A01：參考音源 TAP 播放縮放、陰影回彈，與鼓手 TAP 不一致 | 按下立即變色，按住維持、放開／取消／失焦恢復；滑鼠、觸控、Enter／Space／T 使用一致回饋。移除縮放及陰影動畫，忽略鍵盤自動重複 | 高頻測速需要即時反應。保留原有取樣與 BPM 估算方式，不讓動畫參與節拍計算 |
| A02：左滑動作 4 秒後自動收起，會移除正在使用的焦點 | 移除自動收起計時；由點外部、離開焦點、Escape、開啟另一列或執行動作關閉。關閉仍聚焦的動作時將焦點交回該列 | 操作不應在使用者閱讀／選擇途中自行消失 |
| A03：左滑收尾中途改用鍵盤或減少動態，動畫仍繼續 | 接入共用鍵盤中斷與偏好更新；CSS 同步立即取消 transition，程式完成目前目標並清理狀態 | CSS 可在 React 收到偏好變更前生效；手指直接拖動仍正常運作 |
| A04：曲序拖曳邊緣捲動按每幀移動量計算 | 改為最高 600px/s、依距邊緣的距離調整，以經過時間計算位移，單幀時間上限 32ms；累積小數像素，避免 WebKit 截斷造成更新率差異 | 相同時間的操作應得到一致距離。長幀後不突然跳躍，取消手勢即停止捲動 |
| A05：鼓手聲音／MIDI 設定有進場，關閉卻直接消失 | 共用設定表面：進場 250ms、退出 160ms，`transform`／`opacity`、既有 `UI_EASE_OUT`；減少動態僅 80ms 淡出。關閉立即 inert，快速重開從當前位置接續；鍵盤接手立即完成 | 邏輯關閉不等待動畫；退出期間不能誤按，也不能由過期完成回呼移除重開後的面板 |
| 曲序拖曳只讓原格變淡，捲動後不容易辨識正在搬哪段 | 增加不可點擊、對輔助技術隱藏的積木預覽。直接跟隨指標，觸控長按後才啟用，預覽放在手指上方。放開／取消淡出 125ms，減少動態為 80ms，鍵盤取消立即清除 | 提供必要的手勢回饋，維持原有插入指示線；不增加歌譜或資料本身的移動 |

鼓手細分拍選單一併接入共用 `AnimatedPopover`。Esc 使用邏輯開啟狀態判斷，不因選單仍在視覺退出階段而吞掉下一次 Esc。焦點巡覽排除退出中的 inert 控制項。視窗捕捉階段處理的 Esc 也會通知共用鍵盤動態觀察器。

新增預覽特別排除了原生對話視窗的一般按鈕 transition，避免直接修改 transform 後仍出現 100ms 的跟手拖尾。拖曳像素寫入獨立 DOM ref，不經過 App state；只有啟用、放下及插入位置改變會更新對應元件狀態。

主要實作：

- [SongMetadataPanel.tsx](../src/components/SongMetadataPanel.tsx)、[SongMetadataPanel.css](../src/components/SongMetadataPanel.css)
- [SwipeActionRow.tsx](../src/components/SwipeActionRow.tsx)、[SwipeActionRow.css](../src/components/SwipeActionRow.css)
- [SongMapEditor.tsx](../src/components/SongMapEditor.tsx)、[SongMapEditor.css](../src/components/SongMapEditor.css)
- [DrummerSettingsSurface.tsx](../src/components/DrummerSettingsSurface.tsx)、[DrummerMode.tsx](../src/components/DrummerMode.tsx)、[DrummerMidiSettings.tsx](../src/components/DrummerMidiSettings.tsx)

## 驗證

- **9 個測試檔、125 項測試通過。** 涵蓋 Tap 按住／放開／取消／鍵盤重複、左滑焦點與中斷、60／120Hz 含小數截斷的捲動、長幀限制、拖曳取消、設定面板快速重開／過期回呼／減少動態／Strict Mode，以及既有鼓手與預覽操作。測試紀錄（本機：`tmp/motion-fixes-20261107/tests.log`）
- **`npm run lint`、`npm run build` 通過。** 建置仍有既有部分 chunk 超過 500kB 的提示；本輪沒有宣稱改善初次載入體積。
- **Chromium，390／834／1440px：** 參考音源 TAP 在鍵盤及減少動態下，transform／scale 均為 none、動畫數為 0；深色模式按住維持顏色，放開恢復。TAP 證據（本機：`output/playwright/motion-fixes-20261107/metadata.log`）
- **Chromium，390px：** 左滑動作等待 4.3 秒仍保有焦點且非 inert；鍵盤與減少動態中斷後 transition 為 none、動畫數為 0。左滑證據（本機：`output/playwright/motion-fixes-20261107/swipe.log`）
- **WebKit，390／834／1440px：** 聲音與 MIDI 設定皆有 160ms 退出，立即 inert，快速重開正常；Esc 完成關閉並恢復觸發按鈕焦點；減少動態為 80ms、沒有位移。鼓手面板證據（本機：`output/playwright/motion-fixes-20261107/drummer.log`）
- **WebKit，390／834／1440px：** 拖曳預覽沒有 transition、追蹤期間動畫數為 0，結束後沒有殘影。以合成 touch 事件驗證手機尺寸的長按、跟隨及取消。拖曳證據（本機：`output/playwright/motion-fixes-20261107/map.log`）
- **WebKit 控制 callback 時間的實驗：** 同樣 250ms、相同邊緣位置，模擬 60Hz／120Hz 都捲動 140px。減少動態下實際指標拖放能改變順序，預覽以 80ms 淡出，Esc 取消後預覽數為 0。拖放與取消證據（本機：`output/playwright/motion-fixes-20261107/map-drop.log`）

使用 animate 實作、animation-performance 檢查動態成本，並按 react-best-practices 檢查事件清理、暫態資料、焦點及重繪範圍。**Approve：本輪 A01–A05 與拖曳預覽已完成並通過上述驗證。**

手機／平板／桌面是瀏覽器尺寸驗證；觸控事件與更新率使用可控模擬，不等同於實體 iPad／iPhone 的手勢或 FPS 實測。前輪註記的整體鼓手快照轉場真機效能風險，沒有新增證據，不宣稱已量測或消除。
