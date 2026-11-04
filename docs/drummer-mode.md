# 鼓手模式第一版

從歌單詳情的「鼓手模式」開啟；手機也能從更多選單進入。開啟時使用目前歌單的排列、編曲速度與顯示設定，並以當下選取的歌曲為起點。

## 操作

- 點歌曲整列，立即從第一拍播放該曲。播放中點另一首也會立即換歌，沒有預選或「下一首」確認步驟。
- 歌單左側顯示 BPM，右側由上而下顯示拍號、歌名。
- 大字 BPM 可直接輸入；左右按鈕每次調整 1 BPM，TAP 依連續點按估計速度。
- BPM 上方只顯示拍號（例如 4/4）與目前音符，移除可見的計拍單位文字；BPM 欄位的螢幕閱讀器描述仍提供計拍單位。逐拍重音區不顯示額外操作提示。
- 每拍用三格表示強弱，點整欄循環切換輕拍、一般、重音、靜音。該拍靜音也會關閉其細分聲音，但繼續數拍。
- 平時只顯示目前選用的音符，點音符後展開四個純音符選項，選好自動收起。4/4 的選項依序為四分、八分、八分三連音、十六分；其他拍號依目前 BPM 計拍單位顯示相應音符。螢幕閱讀器保留名稱，畫面及滑鼠提示不顯示音符名稱。
- 6/8、12/8 可在設定中選擇八分音符或附點四分音符為 BPM 單位；播放中需先停止才能變更拍號與計拍單位。
- 播放／停止、TAP、上一首及下一首在手機樂譜頁仍可操作；上下首直接切歌並播放，首尾停在邊界。iPad 讓樂譜與控制區並排。
- 未設定 BPM 或尚未確認拍號的歌曲會先停止，需要在此處補齊才能播放。

## 演出模式

標頭「演出模式」進入鼓手演出；窄手機以全螢幕圖示顯示入口。沿用既有全螢幕處理，在點擊時請求瀏覽器全螢幕，支援標準及 WebKit API。瀏覽器不支援或拒絕時保留視窗全版配置；支援重試時會顯示「全螢幕」按鈕。

寬度 600 px 以上，除下述手機橫向配置外，完整 A4 固定在右側。進入與換歌預設「整頁」，依可用寬高等比例縮放；旋轉螢幕時自動重新計算。一般左欄取 42vw，限制在 300–440px；演出恢復較寬的控制台，取 50vw，限制在 360–640px，啟用原本速度／數拍並排及大按鍵排列。符合下述手機橫向條件時，改用左控制、右歌單配置。左上 MIDI 與模式切換列沿用一般模式的寬度，按鈕位置不隨演出左欄加寬而移動。可手動改成適合寬度或放大，不改動樂譜內容與分頁。

除手機橫向配置外，一般與演出模式都讓歌單在上方、演奏控制在下方；左上是換歌清單，左下固定演奏操作區；歌單獨立捲動，不會推走按鍵。寬控制台將速度與數拍並排，播放／TAP 使用 76 px 高的大按鍵，速度加減為 64 × 72 px，拍號與目前音符合為一個至少 52 px 高的緊湊選擇鈕，選單選項至少高 60 px。手機橫向使用下述獨立配置，聲音設定仍開啟完整側面板。直式窄手機保留歌單／樂譜分頁，演奏控制同樣固定下方。

點歌立即播放並同步切換樂譜；進出演出模式本身不會重建音訊引擎或改變速度、細分、音色。測試也涵蓋進入、換歌與視窗尺寸變更後，完整 A4 在可用寬高內。

現場多頁樂譜一次只顯示一張完整 A4，點樂譜左／右半或左右滑動翻頁，左側控制固定。一般模式維持垂直捲動。鼓手模式的通用按鈕樣式排除縮放樂譜內的按鈕，讓 ChordSheet 段落標籤保留原有尺寸、圓角、顏色與完整不透明度。測試預覽第二首「兩頁樂譜示範」提供兩頁範例，與正式歌譜資料無關。

目前歌曲整列使用深綠底白字並保留 `aria-current`，不再顯示「目前」或「播放中」狀態文字；換歌會將該列捲進可見範圍。拍號與音符合為同一按鈕；四分、八分、三連音、十六分直接共用既有 RhythmNotation 的符幹、符尾與符槓幾何。

「聲音與拍號」改用完整高度面板，手機佔滿寬度，較高的 iPad 可一次看到主要欄位；不在節拍器底下塞小型捲動區。

「一般模式」返回原配置並明確退出目前全螢幕，也適用進入前已全螢幕的情況；自動清理仍只退出本功能取得的全螢幕。退出鼓手模式會先停止音訊。Escape 優先關閉音符選單，其次離開演出模式；瀏覽器自行退出全螢幕時也同步回一般模式。不支援或拒絕全螢幕時仍可使用視窗版演出模式。

## MIDI 與電腦鍵盤

標頭 MIDI 設定可以選擇「MIDI 控制器」或「電腦鍵盤」，配置儲存在這台裝置，不跨裝置同步。MIDI 需先連接與選取裝置，再學習速度旋鈕、TAP、播放／停止、上一首、下一首。旋鈕先向右、再向左慢轉數格，辨識常見 Relative CC 編碼及反向；每格可選 1 或 0.1 BPM。硬體按鍵使用 momentary Note 或 CC，放開、連續重複的按住訊息不會再執行一次。

電腦鍵盤不需要 MIDI 裝置或權限。點功能的「開始學習」，按下所需按鍵，再命名及儲存配置。速度拆成加速與減速，各 1 BPM；可按住連續調整。TAP、播放及換歌忽略長按自動重複。設定中不執行演奏動作，文字輸入框、輸入法組字及 Command/Ctrl/Alt 組合鍵不會被攔截；Esc、Tab 保留導覽。一個按鍵只能對應一個功能，遇到重複會提示，無法默默覆蓋。

建議鍵盤：↑／↓ 調速、T 做 TAP、Space 播放／停止、←／→ 上下首。這是建議配置，仍由使用者學習設定。

電腦瀏覽器以 Web MIDI 接收；iPad App 以 CoreMIDI 原生橋接，只有前景會接收演奏指令。iPad Safari 沒有 Web MIDI，需更新包含此橋接的 App，無法僅靠網頁更新接 USB MIDI。此版未加入 MIDI 時鐘同步、輸出或燈號回饋。裝置拔除會清掉目前連線並保留配置，重新接上後選取裝置；離開時釋放連線與事件監聽。

機型、接線與實機測試方式見 [鼓手控制器指南](drummer-controller-guide.md)。

## TAP 取得速度與延遲

一次新的點按手勢不再從原曲 BPM 慢慢爬升。第二下以該次間隔取得速度，前幾下收斂，後續以穩健估計降低抖動；間隔超過 3.5 秒重啟測量，三個一致且明顯改變的間隔會重新取得速度。觸控在按下時處理，放開不會多算；鍵盤與 MIDI 使用事件／封包原始時間，減少回呼到達時間不均對估計的影響。TAP 調整速度，不是 MIDI Clock 或音訊輸出延遲校準。

自動測試驗證 40、70、120、180、240 BPM、新速度取得、異常點按、連續變速及回呼延遲模擬。這些證據不能取代 iPad、控制器及音效卡的端到端實測，也沒有宣稱實際輸出為零延遲。

## 資料與音訊範圍

速度、拍號、計拍單位及各拍強弱只保留於這次開啟的鼓手模式，按歌單項目 ID 分開記錄，因此同曲重複出現可使用不同速度。離開不會改寫樂譜或雲端歌單。每首歌的細分會依歌單項目與 BPM 計拍單位分開保存在此裝置，下次開啟仍保留；例如第一首四分、第二首八分不會互相覆蓋。這項設定尚不跨裝置同步。音色與音量是此裝置的共用個人偏好，切歌與重新開啟後仍保留。在「聲音與拍號 → 音色」選擇 MultiTracks Click（預設）、Drive Click 或 Ableton Live Classic；載入中與播放中都可切換音色，會取消原本的載入與節拍，以新音色、目前速度及節奏設定重新起拍；停止時切換不會發聲。拍號與計拍單位仍須停止後才能變更。舊版音量偏好會保留，無效或未設定的音色使用 MultiTracks Click。

以 Web Audio 音訊時鐘提前排程，畫面計拍不負責音訊定時。切換歌曲及離開模式會取消已排程的聲音；換到背景或音訊遭中斷時停止，需要手動恢復。螢幕喚醒鎖僅在瀏覽器支援時使用。此版尚未承諾 iOS 背景或鎖屏播放。

MultiTracks Click 來自使用者確認的 [Goodness of God 官方 Click Track 公開試聽](https://www.multitracks.com/songs/Bethel-Music/Victory/Goodness-of-God/multitracks/)。AAC 試聽解碼後擷取兩個完整單拍，高音用於重音、低音用於一般拍及細分拍；它們是試聽取樣，並非未壓縮原始母檔。保留 44.1 kHz 雙聲道、原音高及衰減至量化噪聲底，不做合成、等化、正規化或變速。`src/assets/audio/multitracks-click/provenance.json` 記錄來源、時間範圍、處理方式、用途及 SHA-256。節奏與強弱仍由鼓手模式設定決定。

Ableton Live Classic 保留從使用者安裝的 Ableton Live 12 Suite 12.4.15 取得的原音：`Metronome.wav` 用於一般拍與細分拍，`MetronomeUp.wav` 用於重音。兩檔逐位元複製至 `src/assets/audio/ableton-classic/`，來源與 SHA-256 記錄於同目錄的 `provenance.json`。播放保持原始音高、音檔長度與衰減，強弱只調整增益。

Drive Click 從使用者提供的 `Click(150).wav` 擷取原本的重音與一般拍，保留 48 kHz、雙聲道、24-bit PCM 的樣本內容、音高與衰減，不使用音量校準過的比較試聽檔。每拍由音訊引擎重新排程，能自由設定 BPM，無須播放固定 150 BPM 的整段音軌。來源與確切 frame 範圍記錄於 `src/assets/audio/drive-click/provenance.json`。

首次播放只載入所選音色的兩檔，並行解碼並按音色快取；之後切歌或換回該音色會重用。若載入失敗會停止並可重試，不會默默改用其他音色，也不會清掉另一組已載入的快取。六個帶雜湊檔名的 WAV 都隨建置納入離線快取，正式路徑與 iPad 封裝使用 Vite 產生的資源 URL，執行時不連線至來源網站取得音訊。

## 驗證

相關測試涵蓋三組音色的載入、各自快取與失敗重試、過期載入不覆蓋新選擇、偏好記憶與舊設定相容、播放中與載入中換音色重新起拍、停止時換音色保持靜音，以及切歌重用、載入中取消、完整尾音停止、音訊排程與中斷、三連音時距、逐拍靜音、直接切歌、缺漏速度、TAP、6/8 計拍單位、重複歌單項目、暫時修改不寫回資料、鍵盤隔離及檢視者入口。演出模式覆蓋不中斷播放的進出與換歌、Escape 層級，以及共用全螢幕處理的標準／WebKit API、失敗重試、延遲完成清理與外部全螢幕保留。手機與 iPad 目前以瀏覽器尺寸模擬檢查，仍需在實際裝置搭配輸出設備試播後評估現場延遲。


## 操作回饋與歌單細分（2026-10-31）

觸控／滑鼠按鍵按下立即縮至 97% 並變暗，放開 160ms 回復；TAP 額外使用綠色按下狀態。音符選單從觸發點以 200ms 展開，設定面板以 250ms 進入。沿用共用 UI 動態 token，鍵盤操作保持即時，減少動態偏好改為透明度回饋。節拍計時與聲音不等待動畫。

MIDI 與鍵盤的前六項採相同順序與排版：加速／減速、TAP／播放、上一首／下一首。MIDI 另保留速度旋鈕，七項均可獨立學習儲存；按鍵每次 ±1 BPM，旋鈕保留 1／0.1 BPM 選擇。

歌單每列右側顯示目前細分音符，音符選單可直接調整未播放歌曲，不改變目前選曲與播放狀態；未設定的 4/4 歌曲預設四分。其他拍號沿用 BPM 計拍單位顯示相應音符。切歌時只移動歌單內的捲動位置；樂譜在首度顯示前測量可用尺寸，避免換曲時短暫放大再縮回。

現場翻頁與歌曲播放獨立，首尾按鈕禁用，進入現場或換曲回到第一頁；完整 A4 與頁碼保留。放大後可在當頁捲動查看細節。

歌單的細分控制使用與節拍器相同的四個音符按鈕，展開不顯示文字選項。選單放在鼓手對話框內的固定浮層，避免被歌單捲動區裁切；按外部、捲動、視窗尺寸變更會關閉，方向鍵可導覽，Escape 關閉並返回觸發鈕。只改該首歌的細分，不切歌或播放。

控制台永久保留 40px、兩行高的狀態區；就緒時留空，未設定 BPM、拍號或錯誤訊息出現時不新增高度。較長訊息可在狀態區內捲動。


## 最新操作調整

演出模式點樂譜左半回上一頁、右半到下一頁，仍可左右滑動；底部不再配置翻頁箭頭。頁碼保留在樂譜本身，鍵盤聚焦樂譜後可用 PageUp／PageDown。

BPM 旁固定顯示還原圖示，修改速度後即可回到原曲 BPM；未變更或原曲無 BPM 時停用。圖示使用絕對定位，顯示狀態不影響版面高度。未設定速度時以速度欄「—」及停用播放呈現，取消文字提示及預留高度；其他錯誤訊息採浮層，不參與高度計算。此規則取代上方固定 40px 狀態區的說明。

主介面左側「歌單」下方有獨立鼓手模式按鈕，透過分隔線與額外間距區隔。吉他手模式移出側欄與歌單操作：桌面在右上角「更多」三點選單，直接放於「使用 Google 登入」下方；手機在「更多 → 帳號與設定」的登入／帳號區下方。只保留這個較深的入口，切換仍是自己的 Capo 偏好。仍使用目前選定歌單作為鼓手模式起點。


## 固定工具列與工作區切換

一般與演出模式共用固定位置的左側標頭，歌單在上、節拍器在下；演出恢復原有寬版控制台。MIDI 和演出／一般切換按鈕固定在同一位置，標頭名稱不隨模式改變。演出加寬控制台以恢復速度／數拍並排與大按鍵，右側仍完整顯示 A4。按「一般模式」立即更新模式並明確退出目前全螢幕。

進出鼓手模式參考 macOS 精靈效果，以實際按下的鼓手入口為錨點。左側標頭、歌單及節拍器共用一個完整容器；進入時由按鈕位置透過曲線裁切與縮放展出，退出時反向收束回按鈕。動畫為 280ms，使用既有 UI ease-out，不逐幀重排版面。右側預覽不平移，保留舊畫面作底，讓新預覽於 160ms 內淡入，避免兩張畫面同時淡出露出空白。

退出時先停止音訊，再切回主工作區。鍵盤、減少動態偏好或不支援 API 時採即時切換。快速反向操作會先完成前一次更新並清除暫存狀態，避免舊回呼再次套用動畫。方向標記、裁切路徑與快照名稱在結束後還原，不寫入歌曲資料。手機樂譜檢視採原位銜接，保留歌單／樂譜切換與底部控制。


歌單側欄在進入鼓手模式前會記住固定、滑鼠展開與手機開啟狀態。鼓手模式及其退出動畫期間暫停背景側欄的滑鼠自動收合；返回時於同一批更新還原狀態。退出浮層產生的合成 mouseenter 不會再次展開歌單，直到真實 mousemove 才恢復 hover 行為。瀏覽器驗證返回前後均為展開、420px，避免先縮起再跳出的問題。

## Keyboard and controller press feedback

The six playing controls share pointer, focused Enter/Space, keyboard mapping and MIDI feedback: an immediate 100ms pressed marker, followed by the shared 160ms ease-out release. Repeated speed input extends the current press. Actions and original TAP timestamps execute before visual feedback; no chart render is added. Blur, visibility changes and unmount clear feedback. Disabled controls and protected input/settings do not show false presses. Reduced motion retains opacity/color but removes scale. This user-requested exception applies only to playing controls; keyboard menus/navigation remain instant.

## Performance space allocation

For tablet/desktop performance at least 600px wide and 650px high, allocate the right column to the width required by a complete A4 at the available height (16px padding; the chart toolbar is hidden in performance). The left gets the remainder, with a 360px floor. Keep the standard-width toolbar fixed.

The left is a compact workspace, never a height-stretched metronome. At 760px of available left-panel width, place the scrolling song list beside a 420–560px console. Below that, the scrolling list uses the space above a bottom-anchored compact console. In the wide arrangement the console also aligns to the bottom. Within the console, meter and previous/next share a row; BPM and beat accents share the next row; play/TAP share the third row. Buttons retain fixed 56–76px targets, BPM caps at 64px, and beat stacks stay 12px per segment. Below 420px of console content width, put accents and BPM on separate rows to keep three digits readable. Short viewports and standard mode retain their existing layouts. Spare height never enlarges controls.

## Fullscreen exit and chart-page mappings

Performance hides the entire chart zoom toolbar and always fits one complete A4 page. Standard mode retains zoom and fit-width controls. The compact bottom controls stay anchored in tablet, portrait and wide layouts; leave spare space simple without adding information cards.

On desktop with a fine pointer, actual fullscreen gives the left toolbar a 32px top clearance from the native reveal area. Standard exits on primary pointerdown and consumes the same gesture’s click, so moving/resizing the window cannot re-enter performance. Keyboard/assistive clicks still toggle normally. Native Escape and ownership-aware fullscreen cleanup remain supported.

Both MIDI and keyboard settings add 樂譜上一頁 / 樂譜下一頁 after previous/next song. MIDI keeps the relative BPM knob last. Any supported key or MIDI note/CC can be learned; PageUp/PageDown are now supported keyboard bindings. Save with the existing personal profile; old profiles load unchanged. Page controls clamp at the first/last page, never change songs or restart the click, and suppress held-button repeats. Normal mode moves to the corresponding page in the scrolling chart. Focused performance charts also retain PageUp/PageDown fallback when those keys are not mapped elsewhere.

Portrait performance now hides the chart and the phone Songs/Chart switch, dedicating full width to the setlist above a bottom-anchored console. Override the wide-panel side-by-side console layout in portrait. Outside the phone-landscape query below, landscape performance retains the complete chart and Standard keeps its existing chart access. Orientation changes preserve the mounted chart and page state.


Desktop performance uses a single left stack (setlist above, compact metronome at the bottom) at all widths. Landscape viewports ≥1200px and ≥650px high use a 480–560px left column; the right column fits a full-height A4 up to 880px wide. Center the bounded workspace (at most 1440px) in the existing muted surface so surplus screen width remains outside the controls. Keep 76px play/TAP targets. This supersedes the earlier 760px left-panel side-by-side arrangement. Tablet landscape and portrait-only controls retain their previous sizing.

Latest user correction: remove centered desktop workspace and outer gutters. Performance fills the viewport edge-to-edge, with the 480–560px stacked left column flush left and the chart region using all remaining width. Keep the A4 page proportionally contained in that region; never stretch the sheet. This supersedes the centered 1440px workspace cap.

Final desktop width allocation: the right chart gets exactly the width needed for a whole A4 at the available height (794/1123 ratio, 16px padding and 1px divider). All remaining width goes to the stacked left song list and bottom metronome, with a 480px minimum. Remove the 560px left-column cap; preserve fixed control heights and portrait chart hiding.

Desktop performance fallback keeps the console centered at a maximum 600px width, with meter/navigation and tempo/accents paired in rows. Play/TAP remain up to 200px each, separated by 12px, at 76px high. This cap remains the fallback for narrower desktops; the eligible desktop layout below supersedes it.

Latest desktop-only refinement (2026-10-31): landscape performance with a fine pointer and hover, a viewport at least 1440px wide and 650px high, and at least 760px of available console-container width uses three bottom-anchored groups. Tempo and +/- sit on the left; meter/subdivision, beat accents and sound settings form the middle group; Play/TAP sit above previous/next song on the right. Center the console at a maximum 1120px width, with fixed 56px / 76px / 56px grid rows and 8px vertical / 16px horizontal gaps. Play/TAP each cap at 176px wide and remain 96px high. Tempo caps at 360px wide, with a 72px base BPM font. Extra space does not stretch the controls.

The song list spans the full left width above the console. The right column still gets exactly the width required for a complete A4 page; viewport filling and proportional page fit are unchanged. Standard mode, mobile and iPad layouts retain their existing controls. Desktop windows that miss either the media or console-width condition retain the previous compact arrangement. No visual identity or shared design-system change is introduced.


本次音色切換、選曲狀態文字與樂譜標籤修正已通過 46 項相關測試及建置，完成審查結論為 **ship**。畫面驗證：[樂譜段落標籤](/Users/zhangenchi/.codex/visualizations/2026/10/31/01a19043-f572-7283-a5cd-7496de352fe6/drummer-mode/score-labels-fixed.png)、[音色選擇](/Users/zhangenchi/.codex/visualizations/2026/10/31/01a19043-f572-7283-a5cd-7496de352fe6/drummer-mode/sound-selection-fixed.png)。


## 手機橫向配置（2026-10-31）

依使用者參考圖，橫向且視窗寬度不超過 1000px、高度不超過 500px 時，一般與演出模式都隱藏樂譜、歌單／樂譜切換及重複歌曲標題。頂部工具列橫跨全寬、高 44px；下方左側約 64% 為節拍器、右側約 36% 為歌單（歌單至少 200px）。控制區上排以拍點柱填滿可用高度，中排放 BPM 與 48×56px 加減鍵、拍號／細分；下排並列播放、TAP、上一首與下一首，按鍵高 56px，底部保留 44px 聲音設定列。歌單獨立捲動，寬度低於 800px 時單欄，800–1000px 時雙欄。此規則取代先前短橫向手機的尺寸與上下排列；查詢範圍以外的桌面、iPad 橫向及所有直向規則維持原樣。

驗證使用 `tmp/drummer-phone-check/index.html` 掛載實際元件與合成歌曲資料；建置通過，版面偵測結果為 `[]`。已驗證下一首、停止、加速、速度還原、進入演出與原生全螢幕退出。完成審查結論為 **pass**，無重大發現；依據為原始碼與瀏覽器畫面，尚未實機測試。[844×390 演出畫面](/Users/zhangenchi/.codex/visualizations/2026/10/31/01a19043-f572-7283-a5cd-7496de352fe6/drummer-mode/phone-landscape-controls.png)、[568×320 小螢幕畫面](/Users/zhangenchi/.codex/visualizations/2026/10/31/01a19043-f572-7283-a5cd-7496de352fe6/drummer-mode/phone-landscape-small.png)。

手機橫向歌單卡片：左上序號、右上拍號，中間速度、下方歌名；卡片高 88px，長歌名單行省略並保留完整可存取名稱。此模式隱藏卡片內細分按鈕，節拍器上的細分選擇保留。歌單依選曲方向露出相鄰的上一排或下一排，同時保持目前卡片可見；例如單欄由第 3 首切回第 2 首會露出第 1 首。一般桌面清單仍只確保目前歌曲可見。

Click 播放／MIDI 音訊準備時，若瀏覽器支援 Audio Session API，會在建立或恢復 AudioContext 前同步設定 `navigator.audioSession.type = "playback"`，使支援的 iPhone／iPad 瀏覽器使用媒體播放類型。離開鼓手模式會還原原先類型（若其他功能已改成不同類型則保留）；API 缺少或拒絕設定時繼續原有 Web Audio 播放。此改動不啟用背景播放，隱藏頁面仍停止。自動測試涵蓋設定時序、無聲準備、不支援時回退與離開還原；尚未用實體 iPhone／iPad 靜音開關驗證。

手機橫向還原速度鍵改為速度區內獨立 44px 欄位，取消向下溢出的絕對定位；數字依剩餘寬度縮放，保持下排按鍵不重疊。TAP 按下立即變色並下壓 1px，取消縮放及透明度變化，放開立即解除按壓並以既有 100ms / ease-ui-out 回彈。鍵盤及 MIDI 的 TAP 脈衝縮為 50ms，減少連點黏滯感；減少動態效果時只保留即時顏色回饋。取樣仍使用 pointerdown／原始事件時間，pointerup 與 click 不重複計拍。
