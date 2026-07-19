# Changelog

## 0.9.1 - 2026-07-19

### Added

- 新增 iPad 優先的共用歌單導覽，統一總覽、曲目內容、加入歌曲與專案管理狀態，並支援全部、未分類、自有專案、共享專案與別人分享篩選
- 歌單卡片新增專案／共享標籤、歌曲數與前三首摘要；新增歌單會先確認名稱與專案，特定專案篩選時會自動預填
- 預覽續行空白處新增常駐「＋ 分段」入口，未命名段落顯示「＋ 命名」，點擊後直接進入段落名稱編輯

### Changed

- 觸控裝置選歌後會自動收合歌單側欄，重新開啟時回到目前歌單曲目；桌機滑鼠版維持側欄開啟
- 預覽縮放改為保持手勢焦點下的譜面位置，避免整行在放大縮小時偏移後跳回
- 手機歌曲資訊改為緊湊網格，並為底部自訂鍵盤保留安全捲動空間，避免最後一個小節被遮住
- 歌單曲目與頂端 Key／Capo 統一標示為「歌單 Key／Capo」與「目前歌曲 Key／Capo」，共用原有更新與權限流程

### Fixed

- 修正舊資料或複製段落帶有重複 bar ID 時，預覽可能同時選中多個小節或編輯錯誤位置的問題
- 修正和弦鍵盤連續輸入升降記號時後一個覆蓋前一個；現在可依序輸入 `E#b`、`Eb#5` 等內容
- 修正手機長按段落名稱拖曳時整張譜面跟著滑動，並阻止原生文字選取與長按選單干擾排序

## 0.9.0 - 2026-07-18

### Added

- 新增預覽優先編輯流程：可直接在譜面選取和弦、節奏與段落內容，電腦使用錨定編輯器，iPhone／iPad 使用底部觸控工具與自訂和弦鍵盤
- 新增預覽段落動作選單，支援重新命名、複製到後方與刪除段落；iPhone／iPad 顯示底部選單，電腦顯示錨定浮動選單
- 新增完整的歌曲資訊 WYSIWYG 面板，可在預覽頁首編輯標題、版本、翻譯、Key、Capo、Tempo、Time 與 Shuffle
- 新增歌曲批量選取與分享，可將多首歌曲以同一條連結分享，並在分享頁逐首預覽和弦譜或歌詞
- 新增「導入到我的個人歌庫」，支援單首與整批導入、Google 登入後回到原分享頁，以及直接開啟第一首導入結果

### Changed

- 段落複製、刪除與排序改為預覽與左側編輯器共用同一套不可變操作，歌單覆寫模式會同步維持 `sectionOrder` 與 Undo 歷史
- 歌曲管理模式由僅批量刪除擴充為一般選取模式，加入「分享所選」、「全選目前結果」與統一的系統分享／複製連結對話框
- iPad 和弦輸入鍵盤改為全寬底部固定，預覽編輯的選取、鍵盤導覽與結構操作在觸控與電腦上使用同一套語意

### Fixed

- 修正複製段落可能沿用舊 bar ID 的問題；新段落與所有小節現在都會產生唯一 ID，並保留轉調後的音樂內容，不會突變原歌
- 修正 `%`、`0h` 等記號在預覽中的拍點擁有權，使選取、導覽、插入與刪除會依實際拍長處理
- 修正歌曲重複導入的衝突判斷，改以分享來源 ID 追蹤，不會把同名但不同來源的歌誤判為同一首
- 導入衝突可選擇保留現有版本並另存新副本，或保留接收者 song ID 並以分享內容覆蓋；整批操作在同一個交易內完成

## 0.8.32 - 2026-06-04

### Added

- 新增「吉他手模式」切換按鈕（僅在專案／歌單模式的側欄顯示）：開啟後，所有歌單中尚未設定 Capo 的歌會自動套用吉他友善調（C/D/E/G/A）的最小 Capo 把位，Capo 數字越小優先。此模式為即時顯示覆蓋層，不會寫入或更動既有 Capo 設定，可隨時關閉完整還原；按鈕開關狀態會記憶於瀏覽器。

## 0.8.22 - 2026-06-02

### Added

- 新增桌面分割編輯器寬度拖曳調整與自動吸附，讓筆電與固定側欄時可更穩定使用完整編輯版面
- 新增歌曲 metadata 的「進階設定」收合區，將版本、翻譯、速度、Shuffle、顯示設定與 Reference 欄位集中管理
- 新增工作區 / 團隊側欄小入口，預設收合，點開後才顯示團隊切換、建立團隊與成員管理

### Changed

- 歌曲庫側欄移除搜尋區與歌曲列表之間的上下拖曳拉桿，列表直接貼到搜尋工具下方
- 歌單列表頂部改為精簡工具列，把返回、目前專案、`+ 新歌單`、搜尋、數量與排序整合成較低高度的版面
- 歌曲庫與歌單側欄移除重複的 ChordMaster 大標題，降低頂部資訊佔用空間
- 桌面與窄版 editor 小節工具按鈕改為固定四欄，Copy / Paste 控制會依容器寬度收合文字，減少按鈕擠壓
- 歌單預覽現在只顯示目前選取的歌單歌曲，避免整份歌單預覽過長干擾目前編輯焦點

### Fixed

- 修正節奏跨小節連線在預覽中無法精準接到下一小節第一個音頭的問題，並改善跨欄層級與量測
- 修正只有不可見簡譜內容時仍撐出 bottom lane 的情況，預覽會依實際可見簡譜或 placeholder 判斷
- 修正節奏編輯預覽容器裁切 accent / tie 等符號的問題
- 改善窄版 metadata、歌單側欄與歌曲庫側欄的文字截斷與捲動穩定性

## 0.8.8 - 2026-05-28

### Added

- 新增 iPadOS / Capacitor 專案設定與 Xcode 同步流程，支援把同一套 React/Vite app 打包到 iPad 實機測試
- 新增 iPadOS deep link 登入回跳，Google/Supabase 登入後可回到 ChordMaster app

### Changed

- 歌單模式預覽滑到哪一首歌，頂部 Key / Capo / 編輯狀態會自動跟著切換到目前歌曲
- 歌單歌曲排序改為 pointer/touch 拖曳手把，改善 iPad 上拖動歌曲時變成文字選取的問題
- `maj7` 與 `dim` 縮寫只在同一小節剛好有三個有效和弦、且包含 `maj7` 或 `dim` 時觸發

### Fixed

- 修正 iPad app 登入後停在 app 內網頁而不是回到 app route 的問題
- 修正 `°7(#4)` 這類和弦中 `°7` 與 `(#4)` 重疊的問題，保留 extension 位置並下移 `°7`

## 0.8.7 - 2026-05-26

### Added

- 新增多小節休止符記號 ── 在和弦欄位輸入 `|N|` (例如 `|4|`) 即可顯示 N 個小節休止
- Jianpu 元件現在接收 `timeSignature` prop，依拍號動態計算每拍 unit 容量

### Changed

- 小節工具列的 1234 / ♬ 圖示改成「簡譜」/「節奏」文字按鈕，並調整為相鄰排列
- 單和弦小節，以及第 1+3 拍兩個和弦的小節，不再自動壓縮，和弦會以原始大小從拍點開始顯示

### Fixed

- 修正 6/8 等複合拍子簡譜在第一拍以後的音會溢出小節線的問題
- 自動推斷音符時值（autoDurationShorthand）現在會依 `tokenCapacityUnits` 判斷，6/8 一拍 3 個音會自動視為 8 分音符
- 修正 `1maj7/3` 等 maj7 + 斜線低音和弦中，△ 與 `/3` 之間視覺間距過大的問題

## 0.8.5 - 2026-05-19

### Changed

- 歌單模式右側預覽現在會依歌單順序直向顯示所有歌曲，方便習慣往下滑瀏覽整份歌單的使用者
- 目前選中的歌單歌曲仍可從預覽點擊回編輯器定位，其他歌曲則作為只讀預覽瀏覽

## 0.8.4 - 2026-05-07

### Added

- 新增 Supabase migration，合併同一帳號重複建立的個人區，並限制每個帳號只能有一個 personal library

### Fixed

- 修正 Team Invite 接受失敗時只顯示泛用錯誤，現在會顯示 Supabase 回傳的實際原因
- 修正重複 personal library 會在 workspace 切換列顯示成多個「個人區」的問題
- 修正手機窄版節奏列中，三連音數字被裁切或顯示不完整的問題

## 0.8.3 - 2026-05-06

### Fixed

- 修正歌曲 Key 選擇 `Bb` 時，右側預覽或同步轉調結果顯示成 `A#` 的問題
- 修正 key 轉調輸出可能產生不在正式 KeyPicker 清單中的同音異名 key
- 修正新增段落後焦點直接跳到第一小節，現在會先聚焦新段落標題欄位

## 0.8.2 - 2026-05-06

### Changed

- TAP tempo 現在可用 `T` 鍵觸發，並在 TAP 按鈕內即時顯示偵測 BPM
- 版本與翻譯欄位會提供歌曲庫已出現過的值作為沿用建議

### Fixed

- 修正 TAP tempo 在 BPM 更新時造成重 render，導致點擊卡頓、延遲或數字跳動的問題
- 修正版本與翻譯欄位無法輸入空白鍵，影響英文名稱輸入的問題
- 修正 Segno / Coda 導覽記號與小節數重疊時，小節數蓋住記號的問題

## 0.8.1 - 2026-05-05

### Changed

- 改善 Song Library、Setlist 與加入歌曲搜尋的文字正規化
- 搜尋時 `你 / 祢` 會視為同一個字，適合敬拜歌曲常見用字差異
- 搜尋時會用 OpenCC 統一簡繁文字，讓簡體與繁體可互相命中

## 0.8.0 - 2026-05-05

### Added

- 新增歌曲層級 YouTube Reference，單首歌可保存 `樂團版本` 與 `歌手版本` 兩組 reference
- Reference 可保存 YouTube URL、原調與 BPM，並會隨歌曲資料一起保留、匯入、同步與分享
- 新增 Reference mini player，可在歌曲模式、歌單預覽與 Performance Mode 直接播放，不必跳出譜面
- 新增樂團 / 歌手切換、播放 / 暫停、前後跳秒、BPM 式速度調整與原 BPM 回復
- 新增 reference key、目前譜面 key、相差半音與練習 BPM 顯示
- 新增 TAP tempo，可用滑鼠按下節拍估算 BPM 並套用到目前 reference
- 新增 YouTube URL 解析工具，支援 `watch?v=...`、`youtu.be/...`、`embed/...`、`shorts/...`

### Changed

- Reference 速度控制改以樂手習慣的 BPM 增減呈現，支援 `-10 / -5 / -1 / 原 BPM / +1 / +5 / +10`
- 調整 Reference metadata UI，移除過重卡片感並改善窄螢幕欄位重疊
- 調整 Reference player 版面，將樂團 / 歌手切換移到標題列，BPM 控制獨立成第二行
- 更新 YouTube / Transpose 插件提示文案，清楚區分「在 YouTube 開啟」與「安裝 / 啟用插件」

### Fixed

- 修正 TAP tempo 等待滑鼠放開才計算造成的體感延遲，現在按下即算
- 修正未填 reference BPM 時歌手版本無法使用 BPM 式速度控制的問題，現在會 fallback 到歌曲 tempo
- 修正部分 YouTube iframe 載入失敗或黑畫面時缺少清楚 fallback 提示的體驗問題
- 修正 reference 編輯區在瀏覽器縮窄時 URL、Key、BPM、TAP 控制互相擠壓或被吃掉的問題

## 0.7.0 - 2026-04-23

### Added

- 新增 Supabase 帳號與同步基礎，支援 Google OAuth、Email Magic Link、個人歌曲庫與歌單同步
- 新增歌曲 / 歌單公開唯讀分享連結，包含 SPA fallback、Edge Functions、分享連結複製與剪貼簿 fallback
- 新增 shared setlist 加入流程，可在登入後開啟受邀歌單，並透過 RPC 載入已加入的 shared setlists
- 新增 shared setlist 管理能力，支援成員關係、離開 shared setlist，以及個人 Key / Capo / 顯示控制覆蓋
- 新增 Performance Mode 入口與行動版底部操作，並加入 PDF 匯出取消按鈕

### Changed

- 大幅改善行動版 editor、側邊欄、picker overlay 與 responsive toolbar 的互動版面
- 重整 PDF 匯出流程，改為 single-canvas render、行動裝置 adaptive pixel ratio 與 JPEG 輸出，降低記憶體壓力
- 改善 shared setlist 與歌詞模式 UI，shared page 現在可顯示完整歌單歌曲細節
- 調整 lyrics pagination density、lyrics mode bar layout 與譜面小節編號位置
- 移除測試版本警告 banner，正式介面不再顯示資料可能不保留的提示

### Fixed

- 修正 Supabase PKCE session recovery、分享匯入、auth redirects 與 create share link 前 session refresh 的問題
- 修正 share functions 的 CORS、JWT gateway 與 service-role 驗證相關部署/執行問題
- 修正 performance mode 的 page clipping、viewport height、pagination offset、切歌 layout jitter 與 keyboard stale closure
- 修正 setlist 預覽 section order / active section 同步、preview key behavior 與 chord anchor default
- 修正 chord bar 按 Enter 的焦點跳轉，以及全休止符在小節中的置中顯示

## 0.6.0 - 2026-04-09

### Added

- 新增 `Service Setlist` 工作流，可從 Song Library 建立服事歌單，並為每個 SetlistSong 保留獨立的 `Key`、`Capo`、`section order` 與編輯內容副本
- 新增 setlist 層級顯示設定，支援 `Nashville Number System`、`Chord + Fixed Key`、`Chord + Movable Key`，並可統一切換是否顯示歌詞
- 新增全站共用的 `KeyPicker` 與 `CapoPicker` 元件，Song Library、Service Setlist 與預覽列的調性控制改為同一套 popup UI
- 新增 setlist 側邊欄加入歌曲流程，可直接搜尋 Song Library 並將歌曲加入目前歌單，空歌單也能直接開始加入

### Changed

- 重做一般歌曲與服事歌單模式的上方編輯資訊列，改為更緊湊的 metadata toolbar，整合 `Title / Key / Capo / Tempo / Time / Display` 控制
- setlist 模式下的右側編輯與預覽，現在會先讀取 Song Library 原曲，再套用 `SetlistSong` 覆蓋值，不再直接編輯原始 Song Library 資料
- setlist 預覽與 PDF 匯出現在會統一套用 `displayMode`、`showLyrics`、`overrideKey`、`capo`、`sectionOrder`
- setlist 側邊欄與編輯畫面改為更緊湊的工具式 UI，並補上一般歌曲模式與 setlist 模式的清楚切換提示

### Fixed

- 修正多處 setlist 模式下 `Key / Capo` 不同步、重複顯示或 UI 不一致的問題
- 修正 setlist 預覽未沿用一般歌曲模式的 section / bar 高亮導覽問題
- 修正簡譜在預覽縮放後切換歌詞顯示時可能使用錯誤寬度重排的量測問題
- 修正多處 setlist 編輯工具列、切換開關與側邊欄卡片的版面溢出與元件重疊問題

## 0.5.0 - 2026-04-04

### Added

- 新增段落轉調功能，可直接為某段設定 key，並讓後續段落一起承接新的調性
- 新增預覽中的段落轉調 `Key: X` 標示，第一個有效小節左上角會顯示目前段落 key
- 新增弱起拍 `0` 小節流程，editor 可獨立編輯簡譜與節奏，預覽也可在第一小節前顯示弱起內容

### Changed

- section key change 現在會直接改寫 editor 內該段與後續段落的實際和弦，Nashville 級數不受影響
- 複製或拖曳段落到已升調區域後，若該段沒有自己的獨立轉調設定，和弦會自動對齊目的地 key
- 調整簡譜升降記號在 preview 與 editor 的距離，讓預覽更緊湊、編輯更清楚
- 微調段落轉調按鈕位置與尺寸，讓它更貼近段落標題區的工具列設計

### Fixed

- 修正 section 轉調只改文案、不影響預覽和弦或簡譜的問題
- 修正預覽中的臨時升調標記有時不顯示，或與備註重疊的問題
- 修正段落重排後 key 繼承沒有更新，導致拖到升調區仍維持原調的問題

## 0.4.0 - 2026-04-03

### Added

- 新增預覽縮放與拖曳視窗，右側譜面可獨立放大、縮小、置中與平移
- 新增固定調顯示模式，簡譜可一鍵切換為絕對音顯示，頁首同步標示 `1=C`
- 新增更多導覽記號與文字標示，包括 `D.S.`、`D.C.`、`Fine`、`D.S. al Fine`、`D.S. al Coda`
- 新增和弦 `Fermata` 工具列按鈕，可直接在和弦上方加入無限延音記號
- 新增段落建議 `Breakdown`，並擴充更多段落色彩分類
- 新增舊歌資料容錯與自動修正，較早版本的歌譜在載入與匯入時會先做 sanitize

### Changed

- 重做段落顏色規則，`Turnaround`、`Chorus`、`Refrain`、`Breakdown` 現在可分開顯示不同色系
- 改善段落標籤、備註 badge 與 section title 編輯體驗，支援多行段落名稱與更準確的名稱建議排序
- 更新小節內導覽記號定位，`Segno / Coda` 會更準確對齊小節線，文字型記號也更醒目
- 調整 `D.S. al Coda`、annotation、bar number、fermata 等元素的避讓邏輯，減少互相遮擋
- 改善 PDF 輸出與列印品質，移除頁面淡框並提高圖片式 PDF 的清晰度
- 更新 README、About、Help 與版本資訊頁內容，讓文件與 UI 功能描述一致

### Fixed

- 修正大量簡譜編輯 bug，包括八分 / 十六分 / 四分音符切換、跨拍占位、左右鍵導航與選框寬度不一致
- 修正連接線 / 延音線在刪除下一顆音或整個小節後殘留的問題
- 修正空小節、未使用小節與空卡片容器之間的顯示邏輯，避免關閉線誤顯示或漏顯示
- 修正預覽點擊小節後左側編輯器不會順暢置中、或被其他 scroll 行為拉回的問題
- 修正部分舊歌譜可出現在歌單中但無法打開的資料相容性問題
- 修正固定調、導覽記號、反覆記號、bar number 和 chord modifier 之間的多處排版衝突

## 0.3.0 - 2026-04-03

### Added

- 新增簡譜複製 / 貼上按鈕與 `Cmd/Ctrl + C`、`Cmd/Ctrl + V` 支援
- 新增簡譜升降記號輸入與工具列按鈕
- 新增共用 bar label，可作為簡譜或節奏前置標籤，也可單獨顯示
- 新增小節數顯示模式：不顯示、每行開頭、每小節
- 新增和弦卡片上的即時小節數顯示
- 新增從任一中間小節拆分新段落的編輯功能
- 新增中文預設介面與更新後的中英文文案檔

### Changed

- 改善簡譜時值排版，讓附點音不再不自然撐滿整個小節
- 調整八分音符 / 十六分音符切換與附點四分音符的編輯行為
- 改善簡譜與節奏連接線的定位與視覺對齊
- 調整升降記號在預覽模式中的位置、字重與可讀性
- 更新快捷鍵行為，方向鍵上下可更直覺地切換高音 / 中音 / 低音
- 更新 README，補充目前功能與編輯流程

### Fixed

- 修正複製小節後簡譜內容無法直接編輯的問題
- 修正新增段落標題時預設帶入文字與輸入焦點跳走的問題
- 修正只有前面幾拍有簡譜時，預覽被強行拉滿整個小節的問題
- 修正簡譜與節奏標籤顯示邏輯不一致的問題
