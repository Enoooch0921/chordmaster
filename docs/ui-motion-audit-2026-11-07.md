# ChordMaster 跨尺寸互動與動畫盤點 — 2026-11-07

本輪僅檢查、重現與整理，沒有修改產品程式、提交或發佈，沒有讀寫正式歌曲或 NAS 資料。使用 `choreograph`、`animation-performance`、`break-ui` 三個技能，另以 Playwright 執行瀏覽器檢查。

修復時複核更正：**11 個可重現問題、2 個體驗改善點、1 個待實機驗證風險**。原 F04 使用不符合型別的測試資料，已撤回。同一根因影響多個元件的情況合併計算。元件測試重現與完整 App 重現分開標明，避免把可控測試情境誤當成正式資料已出錯。

修復結果見 [2026-11-07 修復紀錄](ui-motion-fixes-2026-11-07.md)。11 個確認問題與 O02 已修正；O01 改依使用者最新偏好，歌單保留版本、鼓手清單移除額外版本與語言資訊。R01 已改善定位，實體軟鍵盤仍待驗證。

## 檢查方式與限制

| 項目 | 本輪範圍 |
| --- | --- |
| 手機尺寸 | 320×640、390×844、橫向 844×390 |
| 平板／桌面尺寸 | 834×1112、1440×900 |
| 瀏覽器 | 本機 Chromium、WebKit；不是實體 iPhone／iPad |
| 完整 App | 歌曲庫、歌單側欄、譜面、一般演出模式、鼓手模式 |
| 真實元件＋合成 props | KeyPicker、CapoPicker、TempoPicker、Toast、SongMapEditor |
| 資料邊界 | 0／1／8／1,000 首、長歌名、同名不同作者、多語文字、缺 BPM、72.5／400 BPM、36 段曲序、長檔名 |
| 顯示邊界 | 深色、根字級 16→32px 壓力測試；後者不等同於每種 OS 的文字放大行為 |
| 操作邊界 | 反覆開關、快速切換、動畫中改用鍵盤、焦點停留、拖曳到捲動邊界 |

效能數字來自 **本地開發版＋React Profiler**，用途是定位瓶頸；不能直接宣稱正式版或真實手機延遲相同。本輪沒有驗證登入同步、實機軟鍵盤、音訊延遲、Bluetooth／MIDI、低階裝置 FPS 或正式環境網路。

工作區原先已有大量未發佈變更，檢查期間另有對話修改歌詞排版；本輪只新增 `tmp/ux-audit-20261107`、證據檔與本報告。檢查時版本資訊及變更中的檔案見 snapshot.json（本機：`output/playwright/ux-audit-20261107/snapshot.json`）。

## 優先順序

P1：主要操作被阻斷／明顯卡住；P2：錯誤結果、操作中斷或重要互動不一致；P3：可操作但視覺品質或可讀性有問題。這是本產品的修復排序，不是資安分級。

| ID | 優先 | 問題 | 已重現範圍 |
| --- | --- | --- | --- |
| F01 | P1 | 矮視窗中 Key／Capo 選單超出畫面，下方項目無法完整點選 | App Chromium 橫向；元件 WebKit |
| F02 | P1 | 大量搜尋結果一次建立，主執行緒出現約 0.6 秒長任務 | App Chromium、1,000 首 |
| F03 | P1 | 演出模式定時把焦點從「退出」等按鈕移走 | App Chromium、桌面鍵盤 |
| F04 | 撤回 | 測試資料含不存在的 `bar.lyrics`，不是產品 bug | 不計入問題數 |
| F05 | P2 | 貼上 BPM 範圍會靜默轉成另一個可儲存值 | Tempo 元件 WebKit；App 鼓手模式 |
| F06 | P2 | 正在操作通知按鈕時，通知仍自動消失並丟失焦點 | Toast 元件 WebKit |
| F07 | P2 | 曲序拖曳到邊界後停住，無法持續自動捲動 | SongMapEditor 元件 WebKit |
| F08 | P2 | 已開啟的 Key 選單在 disabled 後仍可改值 | KeyPicker 元件 WebKit |
| F09 | P2 | 鼓手模式進場動畫在改用鍵盤後繼續跑 | App Chromium、桌面 |
| F10 | P3 | 通知中的長檔名溢出卡片與手機畫面 | Toast 元件 WebKit、390px |
| F11 | P3 | 字級放大後手機「歌曲／歌單」直排、選取底色變形 | App WebKit、390px、根字級 200% |
| F12 | P3 | 平板鼓手模式「播放」被擠成兩行 | App Chromium、834px 直向 |

## 可重現問題與證據

### F01 — 選單只調位置，沒有處理「面板比視窗高」

- **重現**：844×390 開啟工具列 Capo。面板 top=12、height=441、bottom=453，最後選項約 y=412.5～444，超出視窗。完整 Key 元件帶大小調切換、原調資訊、觸控尺寸時，面板 bottom=509.45。
- **影響**：選單看起來已打開，但下方選項無法完整觸及。視窗矮、橫向與文字放大都可能觸發。
- **原因／位置**：[useAnchoredPortalPanel.ts:61](../src/components/useAnchoredPortalPanel.ts#L61) 只夾限 top／left；[CapoPicker.tsx:182](../src/components/CapoPicker.tsx#L182) 沒有可用高度上限且 overflow-hidden；[KeyPicker.tsx:276](../src/components/KeyPicker.tsx#L276) 同樣缺高度限制。
- **修復方向**：限制到可視高度，讓選項區內部捲動；保留目前焦點項目可見。開啟方向與 transform-origin 需跟隨最終位置。
- **證據**：Capo 畫面（本機：`output/playwright/ux-audit-20261107/capo-landscape.png`）、完整 Key 畫面（本機：`output/playwright/ux-audit-20261107/webkit-key-full-short.png`）、`picker-check.log`、`components-check.log`。

### F02 — 歌曲庫的卡頓主要出現在建立／移除大量列

| 操作 | 結果列數 | 最長 React render | 主執行緒長任務 | 最大 rAF 間隔 |
| --- | ---: | ---: | ---: | ---: |
| 1,000 首 → 無結果 | 0 | 145ms | 188ms | 183ms |
| 清空搜尋 → 1,000 首 | 1,000 | 430ms | 618ms | 633ms |
| 1,000 首 → 單一歌名 | 1 | 130ms | 164ms | 150ms |
| 單一結果 → 歌詞「盼望」命中全部 | 1,000 | 451ms | 648ms | 667ms |

- **影響**：搜尋、清空搜尋時畫面可能短暫不回應；主執行緒繁忙也會讓同時進行的互動顯得卡頓。不能只靠調動畫秒數解決。
- **原因／位置**：[App.tsx:3108](../src/App.tsx#L3108) 同步搜尋與摘要；[App.tsx:13239](../src/App.tsx#L13239) 完整 map 結果。命中全部時約 25,228～26,228 個 DOM 節點。這些證據支持大量列掛載是主要嫌疑，尚未把搜尋計算與 DOM 成本分別剖析。
- **修復方向**：先限制實際掛載列數／虛擬化可變高度列，再量測搜尋與摘要快取。維持跨搜尋選取、焦點、捲動位置及輔助閱讀能力。
- **證據**：量測紀錄（本機：`output/playwright/ux-audit-20261107/library-perf.log`）、1,000 首畫面（本機：`output/playwright/ux-audit-20261107/library-1000.png`）。此表均為開發版數據，正式版仍需重測。

### F03 — 演出模式的焦點保活會搶走控制按鈕焦點

- **重現**：一般演出模式，聚焦「退出」。100ms 時仍在 BUTTON，約 1.7 秒後焦點變成演出模式 DIV；工具列仍可見。
- **影響**：外接鍵盤使用者停頓後，Enter／Space 不再送到原先的按鈕，焦點位置也會跳走。
- **原因／位置**：[usePerformanceKeyboardFocus.ts:14](../src/hooks/usePerformanceKeyboardFocus.ts#L14) 只保留 select、textarea、contenteditable；第 29 行每 1,500ms restore。一般 button 不在豁免範圍。
- **修復方向**：保留 iPad 鍵盤保活的目的，但使用者正在演出介面的互動控制上時不要奪焦點；只在適當的非互動狀態復原。
- **證據**：焦點紀錄（本機：`output/playwright/ux-audit-20261107/performance-focus.log`）。尚未把同一流程搬到實體 iPad 外接鍵盤重測。

### F04 — 已撤回：測試資料不符合產品結構

修復時 TypeScript 檢查發現 `Bar` 並沒有 `lyrics` 欄位，譜面也不讀取這個欄位。上一輪的合成資料額外塞入了 `bar.lyrics`，因此「搜尋不到」不能證明產品有問題。此項是審查誤判，不擴充歌曲 schema，也不納入已修復數量。保留原始紀錄供追溯，修正測試 fixture 移除此非法資料情境。

### F05 — BPM 輸入會把錯誤文字變成看似合法的數值

- **資料／重現**：貼上 `100–120`，TempoPicker 顯示 `100`，套用可用，結果確實為 100。鼓手模式輸入同樣內容後 Enter 也得到 100。
- **影響**：原本帶有範圍或無法解析的來源被靜默變成確定速度；使用者不一定發現。
- **原因／位置**：[tempoUtils.ts:4](../src/utils/tempoUtils.ts#L4) 先移除非數字再截前三位；[DrummerMode.tsx:613](../src/components/DrummerMode.tsx#L613) 有另一份同類邏輯。
- **修復方向**：保留輸入草稿，驗證完整格式；範圍應提示選定單一速度，或拒絕套用。兩處共用解析規則。
- **證據**：`components-check.log` 的 `tempo-paste`／`tempo-applied`；`drummer-matrix.log` 的 `drummer-range`。

### F06 — 通知到期會移除正在使用的操作按鈕

- **重現**：元件通知 duration=1,600ms，聚焦「復原測試」，1,850ms 後通知消失且焦點變 BODY。此短時間是加速重現；App 也有 6,500ms 的撤銷通知。
- **影響**：使用者閱讀通知或準備撤銷時，動作目標突然消失。對鍵盤與觸控輔助操作尤其不友善。
- **原因／位置**：[Toast.tsx:65](../src/components/Toast.tsx#L65) 到期無條件 dismiss，沒有 hover／focus 暫停；實際撤銷用途見 [App.tsx:3870](../src/App.tsx#L3870)。
- **修復方向**：操作中暫停剩餘倒數，離開後恢復；新增通知擠掉舊通知時也應考慮其中是否有焦點。
- **證據**：`components-check.log` 的 `toast-before`／`toast-after`。本輪未另外驗證被第 4 則通知擠掉的情境。

### F07 — 曲序長距離拖曳需要不停晃動指標

- **資料／重現**：36 段曲序，將第一段拖到捲動區下緣並停住 750ms。scrollTop 在停住前後都是 16，仍有 447px 可捲動範圍。
- **影響**：拖曳到長清單後半部時，看起來像卡住；必須持續移動指標才繼續捲。
- **原因／位置**：[SongMapEditor.tsx:81](../src/components/SongMapEditor.tsx#L81) 只在 move 事件裡每次加減 16px，停住後不再執行。
- **修復方向**：拖曳期間靠近邊界啟動 rAF 自動捲動，離開邊界、放開、cancel、關閉對話框即停止；可依接近邊界程度決定速度。
- **證據**：拖曳紀錄（本機：`output/playwright/ux-audit-20261107/map-drag.log`）、36 段曲序畫面（本機：`output/playwright/ux-audit-20261107/webkit-map-many.png`）。此輪用 WebKit 滑鼠拖曳，尚未實機觸控。

### F08 — KeyPicker 的 disabled 沒有涵蓋已開啟的面板

- **重現**：元件先打開 C 選單，再由父層設 `disabled=true`；點 D 仍呼叫 onChange，值變 D。
- **影響**：若操作途中切成唯讀／不可用，畫面和控制狀態不一致。
- **原因／位置**：[KeyPicker.tsx:124](../src/components/KeyPicker.tsx#L124) disabled 沒有收起既有面板；[KeyPicker.tsx:179](../src/components/KeyPicker.tsx#L179) handleSelect 沒有 disabled 檢查。
- **修復方向**：不可用時關閉，提交入口也檢查最新狀態；關閉後焦點移到仍可用的合理目標。
- **證據**：`components-extra.log` 的 `disabled-open-key`。**僅確認元件契約問題；未證實正式權限變動會走到此流程，更未證實能越權寫入後端。** Capo 有相似程式模式，本輪不另算一個已重現問題。

### F09 — 鼓手模式動畫未跟上鍵盤中斷策略

- **重現**：滑鼠開啟鼓手模式，在進場期間按 Tab。`data-ui-input` 已變 keyboard，但 `drummer-from-button` 在約 183ms 處仍 running，`data-drummer-transition=enter` 還在。
- **影響**：使用者已轉為鍵盤操作，面板仍縮放進場；與其他選單「鍵盤接手立即完成」的互動規則不同。
- **原因／位置**：[drummerTransition.ts:17](../src/lib/drummerTransition.ts#L17) 只在啟動前檢查輸入方式；[DrummerMode.css:503](../src/components/DrummerMode.css#L503) 的 view transition 沒有對中途 keyboard 狀態結束動畫。
- **修復方向**：鍵盤接手時結束目前視覺過場，保留已提交的模式、焦點與捲動狀態，不再重做一次資料更新。
- **證據**：動畫與回歸紀錄（本機：`output/playwright/ux-audit-20261107/motion-regression.log`）。本輪沒有證明這會吞掉按鍵，不應把「仍在動畫」誇大成「鍵盤完全失效」。

### F10 — 通知內長檔名沒有斷行策略

- **資料／重現**：description 使用 `Sunday_Worship_Rehearsal_2026_11_08_Traditional_Chinese_English_Updated_Final_Revision_12.chordmaster.json`。390px 視窗內卡片 clientWidth=357，scrollWidth=687，文字超出右側。
- **原因／位置**：[Toast.tsx:190](../src/components/Toast.tsx#L190) 標題與描述未設長字串換行。
- **修復方向**：文字區 `overflow-wrap:anywhere` 或適當斷行；保留關閉鈕的固定空間。對錯誤訊息、URL、匯入檔名都應適用。
- **證據**：通知溢出畫面（本機：`output/playwright/ux-audit-20261107/webkit-toast-long-name.png`）、`components-check.log`。這是實際 Toast 元件的資料邊界測試，並非聲稱特定正式匯入流程一定顯示此檔名。

### F11 — 手機導覽在放大字級時被旁邊控制擠壓

- **重現**：390×844，根字級由 16px 改成 32px。「歌曲」「歌單」各變兩行，選取底色變成狹長直條。
- **原因／位置**：[MobileSidebarNavigation.tsx:33](../src/components/MobileSidebarNavigation.tsx#L33) 導覽可無限縮小，Logo／更多／完成不縮；字體與間距以 rem 放大，但選取底色 inset／gap 傳固定 px。
- **修復方向**：字級增大或可用寬度不足時改用合適排列；選取底色依實際項目位置／尺寸計算，不只假設等分空間。不能僅縮小文字抵銷使用者放大。
- **證據**：200% 字級深色畫面（本機：`output/playwright/ux-audit-20261107/webkit-large-font-dark.png`）、`coverage.log`。需再用實際 Safari／Chrome 文字放大設定驗證。

### F12 — 平板鼓手模式的播放文字直排

- **重現**：834×1112，鼓手模式左欄約 350px，播放鈕約 72.6px 寬；圖示加文字後，「播放」顯示為上下兩字。
- **影響**：頻繁使用的主要按鈕不如手機／桌面一致，掃視較慢。按鈕本身仍可操作，屬 Ugly 而非功能阻斷。
- **原因／位置**：[DrummerMode.tsx:625](../src/components/DrummerMode.tsx#L625)、[DrummerMode.css:47](../src/components/DrummerMode.css#L47) 及後續媒體規則，控制列寬度分配不足以容納圖示＋標籤。
- **修復方向**：依左欄寬度調整主按鈕比例／圖示配置，保留單行標籤與現有觸控高度；避免單靠整個視窗寬度判斷。
- **證據**：平板鼓手模式（本機：`output/playwright/ux-audit-20261107/drummer-834.png`）、`drummer-matrix.log`。

## 另外兩個體驗改善點

### O01 — 鼓手模式沒有延續歌曲庫的同名版本識別

合成資料有兩首 `Same God`，作者不同，但 BPM 和拍號相同。歌曲庫能顯示作者，鼓手模式清單卻只剩順序、歌名、拍號與速度；手機清單看不到作者，必須靠記憶歌序分辨。這不是資料遺失，而是同一資料到了演出介面缺少識別線索。

建議同名時在穩定位置補一行版本／作者摘要，先針對重名項目顯示，避免把所有演出列都加高。位置：[DrummerMode.tsx:667](../src/components/DrummerMode.tsx#L667)。證據：手機鼓手模式（本機：`output/playwright/ux-audit-20261107/drummer-390.png`）、歌曲庫對照（本機：`output/playwright/ux-audit-20261107/webkit-library-390.png`）。

### O02 — 手機側欄「⋯」選單仍是瞬間出現／消失

打開原生 details，25ms 後 subtree animations=0；程式也未套用共用 popover 動畫。這不算功能 bug，但和 Key／Capo 等選單的出場邏輯不一致。

適合加以觸發鈕為起點的短淡入／微幅縮放，整個面板一起動；不需要逐項延遲。關閉沿相同方向收回。鍵盤與減少動態直接到位。位置：[MobileSidebarNavigation.tsx:50](../src/components/MobileSidebarNavigation.tsx#L50)，證據 `motion-regression.log` 的 `mobile-more-motion`。

## 待實機驗證，不列為已確認 bug

**R01 — 軟鍵盤出現後，共用浮動面板可能仍以舊可視範圍定位。**

[useAnchoredPortalPanel.ts:61](../src/components/useAnchoredPortalPanel.ts#L61) 依 window.innerHeight／innerWidth 計算，監聽 window resize／scroll／orientationchange，未直接使用 visualViewport 的可視尺寸及 offset。若瀏覽器只改變 visual viewport，BPM 等面板可能被鍵盤遮住或偏離觸發位置。

下一步需要 iPhone Safari、iPad Safari／獨立安裝模式，依序測開 BPM → 聚焦 → 軟鍵盤開啟 → 橫豎轉換 → 收鍵盤。此輪的桌面視窗縮放不能證明該問題一定存在。

## 已通過或未重現的回歸項目

- 平板 834px、桌面 1440px 反覆開關側欄，各記錄 63／70 個 rAF 樣本；歌譜 x、y、width、height 的變動範圍都是 0。這次未重現整張歌譜抖動。
- 手機「歌曲／歌單」連續交替點擊 6 次，最終只有「歌單」選取，導覽沒有殘留 inert。這確認最後操作狀態正確，不代表已證明所有實機逐幀動畫一致。
- 320px／390px 的一般字級長歌名、多語歌名沒有把歌曲庫撐出視窗；作者、版本、語言列可比較。
- WebKit 的 0 首與 1 首資料可正常顯示空狀態／單首結果。
- 鼓手模式主要播放、TAP 控制在 320×640、390×844、834×1112、1440×900、844×390 均在可視範圍內；F12 是標籤換行問題，不是按鈕消失。
- 曲序的內部可捲動區與底部儲存鈕是正常配置，沒有把內容超出捲動區的座標直接當成破版。
- 測試用資料切換列有一次擋住底部控制，隱藏測試列後重測正常；已排除，不計為產品 bug。

## 動畫編排結論

| 互動 | 觸發後立刻 | 視覺過場 | 接手／反向時 |
| --- | --- | --- | --- |
| 側欄開關 | 更新開關狀態 | 側欄本身移動，譜面保持位置 | 保持目前連續反向能力；本輪不建議重做 |
| Key／Capo | 決定可用範圍、讓選項可操作 | 整個面板以觸發處為中心進場 | 選取立即生效；disabled 時停止操作並收起 |
| 鼓手模式 | 提交模式與焦點 | 保留現有 280ms 左欄過場 | 鍵盤接手時結束視覺動畫，不重複提交 |
| 手機側欄更多 | 開啟且可操作 | 建議約 100～140ms 面板淡入，無項目 stagger | 反向開關從當前狀態銜接；鍵盤立即完成 |
| 通知 | 顯示內容／操作 | 短進出場即可 | 操作中暫停消失，不讓焦點跟著通知被刪除 |
| 歌曲庫搜尋 | 輸入立即更新 | 不新增大量逐列進場動畫 | 先降低大量列渲染成本，避免用動畫掩蓋卡頓 |

建議修復順序：**F01／F02／F03 → F05～F08 → F09～F12 → O01／O02**。R01 和手機／平板實機回歸一起驗證。

## 證據與可重跑資料

- 完整結構化結果（本機：`output/playwright/ux-audit-20261107/results.json`）
- App 合成資料入口（本機：`tmp/ux-audit-20261107/fixture.tsx`）：`demo`／`worst`／`empty`／`one`／`huge`。
- 實際元件測試入口（本機：`tmp/ux-audit-20261107/components.tsx`）
- 瀏覽器腳本：`tmp/ux-audit-20261107/*.js`；截圖與各腳本完整回傳：`output/playwright/ux-audit-20261107/`。
- 本地預覽沿用 `tmp/animation-followup-20261106/vite.config.ts`，空 Supabase 設定、獨立測試來源與合成 IndexedDB 資料。App 測試網址：`http://127.0.0.1:3150/tmp/ux-audit-20261107/index.html?data=worst`。

本報告是修復清單，**不代表這些問題已修好或已發佈**。
