# 現行介面動畫合理性檢查｜2026-11-07

**後續狀態：** 使用者已授權全部調整；A01–A05 與曲序拖曳預覽已完成，詳見[修正與驗證紀錄](animation-reasonableness-fixes-2026-11-07.md)。以下保留當時審查內容。

本輪是唯讀檢查，沒有修改產品程式、資料或發佈。依使用者最新指示，**已棄用的「編輯歌曲」完整頁面不列入待修範圍**。目前使用中的歌曲資訊、歌單左滑操作、歌譜曲序編排、鼓手模式仍在範圍內。

使用 [review-animations](/Users/zhangenchi/.codex/skills/review-animations/SKILL.md) 判斷交互合理性、[animation-performance](/Users/zhangenchi/.codex/skills/animation-performance/SKILL.md) 檢查效能風險、[find-animation-opportunities](/Users/zhangenchi/.codex/skills/find-animation-opportunities/SKILL.md) 篩選必要的新回饋，並用 [Playwright](/Users/zhangenchi/.codex/skills/playwright/SKILL.md) 驗證。

結論：現有共用動畫已經相當接近合理；本輪留下 **5 項待調整問題、1 項可選改善**。主要需要補齊例外路徑，沒有必要替整張歌譜、搜尋結果或每次切歌增加移動動畫。

## 待調整問題

下表 After 是建議方案，**尚未實作**。A01、A02 優先處理；A03–A05 接續統一。

| Before | After | Why |
| --- | --- | --- |
| **A01／優先：參考音源 TAP 還會縮小回彈。** [SongMetadataPanel.tsx:172](../src/components/SongMetadataPanel.tsx#L172) 每次觸發 150ms 的縮放、顏色及陰影動畫；按住另有 `active:scale-95`。實體鍵盤與減少動態模式也會執行。 | 與鼓手 TAP 一致：按下立即以語意色回饋、按住維持、放開恢復，移除縮放和外圈陰影脈衝。鍵盤、觸控、減少動態使用同一套直接回饋；節拍取樣時間不受動畫影響。 | TAP 是高頻、需要精準時機的操作。兩層縮放會疊加，且不同 TAP 的反應不一致。Chromium 在 390／834／1440px 都重現減少動態 + Enter 仍播放 150ms 縮放；按住時同時存在 WAAPI transform 與 CSS scale。這是回饋設計問題，**不能據此宣稱 BPM 計算有 150ms 延遲**。 |
| **A02／優先：左滑動作在使用途中自動收起。** [SwipeActionRow.tsx:91](../src/components/SwipeActionRow.tsx#L91) 展開後一律啟動 4 秒計時，沒有暫停於焦點或游標停留。 | 動作區有焦點、游標停留或按壓時不自動收起；離開後才恢復計時，或改由點外部／Escape／開啟另一列關閉。任何必要的程式關閉都要保留合理焦點。 | Chromium 實際以方向鍵展開並聚焦動作，4.3 秒後按鈕變成 inert、隱藏，焦點落到 body。這不只是動畫不自然，而是使用者仍在操作時控制項消失。 |
| **A03：左滑的收尾動畫沒有跟上輸入方式切換。** [SwipeActionRow.tsx:82](../src/components/SwipeActionRow.tsx#L82) 只在 settle 開始時計算 inline transition；中途改用鍵盤或開啟減少動態不會完成它。 | 接上共用鍵盤中斷機制及即時偏好變更：收到切換時直接完成至目前目標並清理 transition。一般放手仍保留既有 160ms、`cubic-bezier(0.23, 1, 0.32, 1)`；手指拖動期間保持直接跟隨。 | 在 160ms 收尾途中按 Shift，頁面已是 keyboard 模式，transition 仍 running；途中啟用 reduced-motion 也相同。屬於共用規則的漏網處，與 A02 的自動關閉原因不同。 |
| **A04：曲序拖曳靠近邊緣時，捲動速度由螢幕幀數決定。** [SongMapEditor.tsx:99](../src/components/SongMapEditor.tsx#L99) 每次 requestAnimationFrame 最多移動 12px，沒有使用 elapsed time。 | 採時間計算速度，沿用 [useSetlistSongDrag.ts:138](../src/hooks/useSetlistSongDrag.ts#L138) 的模式：速度上限 600px/s、依邊緣距離調整、每幀 elapsed 上限 32ms。觸控拖曳捲動屬必要操作，不因減少動態停用。 | 控制 callback 時間的瀏覽器實驗中，同樣 250ms：模擬 60Hz 捲動 180px，120Hz 捲動 360px。程式也可直接確認速率依幀數倍增。這是前輪加入連續邊緣捲動後仍需補齊的一致性問題；**不是實體 120Hz 裝置的 FPS 實測**。 |
| **A05：鼓手聲音／MIDI 設定有進場，卻瞬間關閉。** [DrummerMode.css:354](../src/components/DrummerMode.css#L354)、[DrummerMode.tsx:697](../src/components/DrummerMode.tsx#L697)、[DrummerMode.tsx:741](../src/components/DrummerMode.tsx#L741)：進場位移 250ms、透明度 200ms，關閉立即 hidden 或卸載。 | 偶爾操作的設定面板保留進場；指標操作關閉時以 160ms、`cubic-bezier(0.23, 1, 0.32, 1)` 做 opacity 1→0、translateX 0→8% 的短退出。關閉指令立即生效、內容立即 inert，允許重新打開；鍵盤立即收尾，減少動態取消位移並只留至多 80ms 淡出。 | WebKit 在 390／834／1440px 均確認進場正在 transition，關閉後聲音面板 display:none、MIDI 面板 DOM 數量為 0，沒有退出階段。這是開關節奏不一致，**不是已量測的效能卡頓**。細分拍選單有相似條件渲染，可於修正時一併檢查，但本輪不另算已重現問題。 |

## 判定與修正順序

- **影響操作感受：** A01 的高頻縮放應簡化成直接狀態回饋；A02 要先確保動作不會在使用者仍聚焦時消失。
- **效能與速度一致性：** A04 用時間控制捲動速率，避免高更新率畫面移得更快。A01 的陰影與顏色 keyframes 也可隨簡化一起移除，但沒有實測掉幀數，不將它報成已確認卡頓。
- **中斷與時序：** A03 補中途切換鍵盤／偏好；A05 補短退出及可重開的生命週期，不能讓動畫延後操作真正生效。
- **一致性與無障礙：** A01、A03 接回共用動態規則；A02 保護焦點。現有共用元件已有相應做法，適合重用。

**Verdict：Block（上述路徑的動畫審查尚未通過）。** 這是待修品質判定，並非要求停用整個應用或新增發佈審批。舊「編輯歌曲」頁面已排除，不計入這 5 項。

## 值得新增的回饋

僅保留一項可選改善，優先度低於上表問題；不是要替介面增加裝飾。

| # | Location | Today | Purpose | Frequency | Suggested motion |
| --- | --- | --- | --- | --- | --- |
| 1 | [SongMapEditor.tsx:80](../src/components/SongMapEditor.tsx#L80)、[SongMapEditor.css:25](../src/components/SongMapEditor.css#L25) | 曲序積木拖曳時原格變淡、顯示插入線；沒有跟隨指標的積木，捲動後原格可能離開畫面。 | 手勢回饋與空間連續性：持續辨識目前拿的是哪一段。 | 偶爾編排時使用，非演出中的高頻控制。 | 手勢確定成立後，顯示同尺寸、`pointer-events:none` 的積木預覽，以 `translate3d` 直接跟隨指標，拖動期間 0ms、不加 lag 或彈簧；完成或取消後只做 125ms opacity 1→0，`cubic-bezier(0.23, 1, 0.32, 1)`。減少動態可保留必要的直接跟隨，收尾淡出縮為 80ms；鍵盤移位維持立即，不顯示拖曳預覽。 |

此候選通過四道篩選：偶爾操作、有辨識拖曳物的功能、追蹤不延遲、沒有妨礙讀譜。仍須用觸控真機確認預覽位置不遮住插入點；不是已證實的操作失敗。

刻意不加動畫的地方：

1. **演出翻頁／切歌時整張歌譜移動：** 閱讀內容與高頻操作不適合裝飾位移；也違反使用者希望畫面固定、局部回饋的偏好。
2. **搜尋結果逐列進場或排序時大幅移動：** 打字頻繁，延後辨識結果，對大量歌曲額外增加工作；不通過速度與頻率篩選。
3. **音符鍵盤每次輸入縮小／回彈：** 高頻精準輸入，現有直接變色與必要的浮動鍵預覽已足夠；不通過頻率篩選。
4. **每次節拍讓 BPM 數字跳動或放大：** 資料本身需要穩定閱讀，現有拍點提示較適合；不通過功能篩選。

**新增動畫判定：只需少量補足操作線索。** 最有價值的候選是曲序拖曳預覽，而不是更多視窗或歌譜移動。後續可交給 `improve-animations plan 曲序拖曳預覽` 整理實作方案；本輪不執行。

## 驗證範圍與證據

依目前本機未發佈的工作目錄檢查；沒有改寫前輪的修復結果。先掃描動畫宣告、共用 motion hooks、輸入方式與 reduced-motion 處理，再針對例外做瀏覽器驗證。實際操作使用本地 Vite、合成歌曲及真實產品元件，沒有正式資料讀寫。

| 路徑 | 執行環境 | 證據 |
| --- | --- | --- |
| 歌曲資訊／參考音源 TAP | Chromium，390／834／1440px；實體鍵盤模擬、減少動態及滑鼠按住 | metadata.log（本機：`output/playwright/motion-review-20261107/metadata.log`） |
| 左滑動作焦點、收尾中斷 | Chromium，390px；方向鍵開啟、等待 4.3s、收尾途中鍵盤／偏好切換 | swipe.log（本機：`output/playwright/motion-review-20261107/swipe.log`） |
| 鼓手聲音／MIDI 設定開關 | WebKit，390／834／1440px，掛載實際 App／DrummerMode | drummer-panels.log（本機：`output/playwright/motion-review-20261107/drummer-panels.log`） |
| 曲序編排邊緣捲動 | Chromium，390px；僅控制 autoScroll callback 時間，比較 250ms 的 15／30 幀 | map-scroll.log（本機：`output/playwright/motion-review-20261107/map-scroll.log`）、拖曳畫面（本機：`output/playwright/motion-review-20261107/map-drag.png`） |
| 原始碼未變更 | 檢查前後 536 個 src 檔案 SHA-256 一致，無新增／刪除 | source-integrity.json（本機：`output/playwright/motion-review-20261107/source-integrity.json`） |

證據界線：

- 390／834／1440px 是手機、平板、桌面尺寸的瀏覽器檢查，**不等同於實體 iPhone／iPad 效能量測**。本輪沒有報告 FPS 改善，也沒有重新執行建置或全套測試；此次未改產品程式。
- 鼓手模式整體的原生 View Transition 含快照與裁切，是否在特定 iPad／低階裝置掉幀仍需真機 trace；保留為待量測風險，不列為第 6 項已確認 bug。
- 參考音源 TAP 程式雖含白色 keyframe，深色主題實際 computed style 受到既有 CSS 覆蓋；**不宣稱已重現白色閃爍**。
- 部分音符鍵原始 class 尚有 active scale／translate，但既有鍵盤 CSS 已覆蓋，不能僅憑字串搜尋再報為問題。
- 共用面板、選取指示、鍵盤中斷和減少動態已有一致機制；本輪不是建議全部重寫。展開區目前刻意使用短淡出再一次移除幾何，不因缺少高度動畫判為缺陷。
- 舊完整「編輯歌曲」頁面曾做拖曳探查；使用者已明確說棄用，因此其紀錄只留在本地探查檔，不列入問題、修正順序或本輪結論。
