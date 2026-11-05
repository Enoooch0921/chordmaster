# 個人譜面筆記

個人筆記在一般譜面、歌單譜面與演出模式上提供私人手寫圖層。登入者以頁首「手寫筆記」開啟工具；桌面與平板原編輯器按鈕改為此入口，手機亦有入口。一般畫面不再顯示重複的角落啟動鈕，演出模式收起工具後仍保留「個人筆記」入口。同一帳號、同一來源歌曲共用筆跡，歌單使用 `item.songId`，不使用歌單項目 ID。未登入時仍呈現原本的 `ChordSheet`。歌詞專用畫面不包含此功能。

筆記不修改共享歌曲、歌單、和弦、簡譜或演奏註記，也不取代歌曲編輯權限。圖層及工具標記為 `data-preview-edit-ui` / `data-preview-only-control`，由既有匯出清理移除；列印 CSS 亦隱藏兩者，匯出不包含私人筆跡。

## 使用行為

- 畫筆、螢光筆、整筆擦除、復原、重做、隱藏／顯示及完成。畫筆有五種顏色、三種固定粗細；螢光筆沿用既有顏色、固定寬度與 `0.36` 透明度，以獨立 SVG 的 `multiply` 混色保留黑色譜字的可讀性。隱藏不刪除筆跡，完成只收起工具。
- 筆與滑鼠左鍵書寫；手指保留導覽用途。一般預覽可用手指捲動及既有縮放，演出模式沿用翻頁手勢。書寫期間的觸控事件被抑制，避免掌觸造成導覽；這是瀏覽器事件處理，尚未完成實體掌觸驗證。
- 畫筆與螢光筆以一筆連續軌跡畫完後不抬筆，停住可將可辨識的形狀修成直線、圓圈／橢圓、方框、三角形、菱形、五邊形、六邊形、五角星或箭頭。五角星支援熟悉的交叉筆順及外框畫法；交叉星修形後仍保留內部交叉線，不改成外框星。箭頭也須連續畫出，不支援多筆合併辨識。修形前直接提筆保留手寫原貌，「停筆修形」可關閉。
- 停筆判斷使用約 500 ms 的安靜時間窗：水平、垂直範圍各不超過 24 個可見 CSS px，且整段與最近 150 ms 都沒有明顯的定向前進，才開始另 150 ms 的確認等待。緩慢持續畫線仍視為書寫，折角造成長時間窗位移互相抵消時，也會檢查最近的移動方向。譜面上不顯示進度環或旋轉指示；確認等待只在工具列顯示「正在修形，先別抬筆…」，未辨識時顯示「未辨識形狀，保留原筆跡」，成功則顯示形狀名稱。重新移動或提筆會清除仍在等待中的提示。
- 辨識座標依譜面縮放換算成可見 CSS px，使用完整原始軌跡；停筆時間窗不會裁掉最後一條邊或折角。封閉圖形以 64 個等弧長取樣點比對擬合模板，容許手畫偏差，不依賴固定折角數、封閉路徑的起點、順逆時針或旋轉角度。交叉五角星輸出 6 個點（含回到起點），外框五角星輸出 11 個點；直線另以整段軌跡擬合。仍排除過小字跡與不符合幾何條件的軌跡。
- 辨識使用容許變形的模板，成功後再以等比例縮放的理想幾何修整：接近圓形的圈修成正圓，三角形修成正三角形，五邊形、六邊形與五角星修成規則圖形，箭頭兩翼保持對稱。明顯拉長的橢圓與長方框保留長寬比例；交叉星與外框星保留各自畫法。修整保留原位置、整體大小與方向，只在接近主要軸向時輕微對齊。既有已儲存筆跡不會重新辨識或改寫。
- 登入且開啟手寫模式時，暫時抑制頁面文字選取、拖曳及 Safari 長按選單，避免書寫被原生介面打斷。防護透過 body 的 `user-select: none`／`-webkit-touch-callout: none`，以及 document 層的 `selectstart`、`contextmenu`、`dragstart` 取消與選取清除實作；輸入框、文字區及可編輯欄位保留原本選取操作。結束手寫後移除防護，恢復一般頁面選取。實體 iPad 的原生選單行為仍待試用。
- 工具開啟時，Command/Ctrl+Z 復原，Shift+Command/Ctrl+Z 重做，Esc 結束書寫。復原／重做歷史留在目前頁面的記憶體，不跨重新載入或裝置；已完成的操作仍持續儲存。
- 一般、歌單與演出模式共用工具開啟狀態；進入歌曲編輯時停止書寫，歌單只顯示目前選取歌曲的筆記工具。演出覆蓋層啟用時不留下第二組背景工具。
- 演出模式書寫時，翻頁按鈕縮為左右邊緣的 44px 按鈕，避免原本半頁大小的透明點擊區攔截筆跡；暫停隱藏鍵盤輸入的焦點維持，退出與翻頁按鈕在介面閒置時仍可見。一般演出模式保留原本的大面積翻頁點擊區。

停筆修形的操作參考 [Apple iPad 使用手冊](https://support.apple.com/zh-tw/guide/ipad/ipad8869ac3a/27/ipados/27) 所描述的連續畫完、停住後修整形狀。該指南未公開精確辨識演算法；此處為 ChordMaster 的瀏覽器實作，不宣稱與原生功能等同。

## 架構與定位

| 檔案 | 責任 |
| --- | --- |
| `src/App.tsx` | 連接登入帳號、來源歌曲 ID、共用手寫狀態與頁首入口，協調演出翻頁／焦點，僅在登入且手寫啟用時掛上選取防護，沿用既有匯出清理。 |
| `src/components/PersonalChordSheet.tsx` | 包裝原有譜面、管理工具與可見狀態，將圖層掛到每個列印頁。 |
| `src/components/PersonalNotesPage.tsx` | 分層 SVG 筆跡、Pointer Events 內即時更新畫筆／螢光筆路徑、觸控導覽、定位測量、批次擦除及停筆提示／計時。 |
| `src/lib/personalNotes.ts` | 筆畫／操作格式、包含新增圖形類型的資料驗證、合併、共用平滑幾何的增量即時路徑與已儲存路徑，以及命中測試。 |
| `src/lib/noteHold.ts` | 以 500 ms 時間窗及最近 150 ms 的方向進展判斷真正停筆，容許原地抖動。 |
| `src/lib/noteShapes.ts` | 以完整軌跡及容許變形的模板辨識圖形，再修成等比例理想幾何；保留明顯橢圓／長方框比例與交叉／外框星形畫法，排除過小字跡。 |
| `src/hooks/useHandwritingSelectionGuard.ts` | 手寫期間抑制非編輯區的選取與長按選單，結束後清理 document 事件及 body 標記。 |
| `src/components/PersonalNotes.css` | 筆跡及工具列樣式、限定手寫期間的選取／callout 防護與可編輯欄位例外。 |
| `src/lib/personalNotesDatabase.ts` | IndexedDB 操作記錄及待同步狀態。 |
| `src/lib/personalNotesStore.ts` | React 外部狀態、復原／重做、分頁廣播與私人雲端同步。 |

筆跡透過 SVG 疊在既有譜面上，不因每個輸入取樣重繪整張譜。輸入保留瀏覽器可用的 coalesced pointer samples；畫筆與螢光筆在同一個 Pointer Event 內直接更新即時 SVG path 的 `d`，不等待 React commit 或 `requestAnimationFrame` 佇列。`createLiveNotePath` 增量建立新增曲線，與已儲存筆跡的 `notePath` 共用平滑幾何，避免每次輸入重算整筆。橡皮擦的畫面更新仍以 `requestAnimationFrame` 合併，版面定位測量也保留逐幀排程。自由筆跡使用局部中點曲線平滑，保留尖角與筆尖終點；筆寬固定，不讀取壓力或傾斜資料，也未使用原生 PencilKit。

每筆開始時，在 60 個譜面像素範圍內選取最近的小節，以 `sectionId` + `barId` 作為錨點，座標相對於小節矩形儲存。段落、小節或版面移動後，重新測量矩形並投影原筆跡。頁首、頁邊等遠離小節的筆跡使用頁碼錨點。整筆只有一個錨點，因此跨小節長筆畫仍跟隨起筆時的錨點；頁面錨點跟隨頁碼而非音樂內容。錨點小節不在目前版面時不顯示該筆跡，保留原操作記錄。

## 儲存、隱私與同步

IndexedDB 資料庫 `chordmaster-personal-notes` 的 `operations` store，以 `[owner, song, id]` 為 key。每次書寫／擦除產生不可變操作，包含新增筆畫與移除的筆畫 ID。合併時，移除記錄持續有效；復原擦除以新筆畫 ID 還原，不重新啟用已移除的 ID。追加記錄避免不同分頁或裝置互相覆蓋整張筆記。

私人雲端使用教會 NAS Supabase `https://supabase.living-water.familyds.com` 的 `public.personal_score_notes`。主鍵為 `(owner_id, song_id, id)`，RLS 的讀取條件與新增檢查均為 `auth.uid() = owner_id`。登入角色只有 SELECT／INSERT 權限，不能 UPDATE／DELETE；匿名者沒有存取權。共享曲庫角色不授予他人的筆記權限。客戶端同步前也確認目前登入者符合 store 的 owner。

啟動先讀本機，再同步。新操作先寫入本機並標記待同步；寫入、重新連線、視窗取得焦點及點擊儲存狀態都會觸發同步。同瀏覽器分頁透過 `BroadcastChannel` 分享操作；跨裝置透過上述事件上傳及拉取，沒有即時訂閱。重複上傳相同操作會忽略衝突，不覆寫雲端操作。離線內容留在本機待下次同步；儲存／同步失敗會顯示可重試狀態，不應視為已完成雲端備份。

禁止將此功能指向歷史 Supabase Cloud 專案 `vfkpgcrfdwjndgqzatao`。不得將 NAS 憑證加入原始碼、前端 fixture 或報告。

## 與既有設計的關係

這是 ChordMaster 綠色工作區的局部延伸。`PersonalNotes.css` 保留白色譜面工具、灰色邊框、綠色選取及清晰的 Lucide 圖示，文字沿用既有設定。工具固定在安全區內，手機縮短間距；不改變 A4 譜面幾何或既有歌曲編輯器。常見圖形沿用熟悉的連續手畫方式，書寫中保持安靜，只在工具列給修形回饋；原生選取防護限定在手寫模式。

曲序中的 `Pc2` 等帶數字段落代碼須完整呈現。`ChartSongMap.tsx` 以 `data-code-length` 標記代碼長度，`src/index.css` 僅調整三、四字元代碼的內文字級，保留既有圓環尺寸與列高。

新增的五色墨水是使用者內容選項；工具內 11–12px 輔助文字、局部粗細與白色面板屬此功能的實作差異，不擴充成全站色票、字級或深色模式規則。已接受的 utility／ink palette detector advisories 留在本次審查範圍；本輪主要 detector 字體發現屬既有程式碼，未改動全域字體，也不將它們納入設計規範。`DESIGN.md` 與 `.impeccable/design.json` 保持不變，既有設計漂移未在此輪修補或定為規範。

## 維護驗證與交付狀態

2026-11-05 已將 `supabase/migrations/20261105034347_personal_score_notes.sql` 套用至 NAS。`supabase/tests/personal_score_notes.sql` 使用交易建立測試帳號，驗證自己的讀寫、跨帳號拒絕、不可變操作與匿名拒絕後 rollback。`tmp/personal-notes-1105/migration-verification.json` 記錄 migration 已套用、RLS 通過、筆記列數為 0；未留下合成筆記列。

先前修正的執行結果記錄於 `tmp/personal-notes-1105/fix-verification.json`：206 個測試檔、2303 個測試通過，lint、型別檢查與 production build 通過，保留既有大型 bundle 警告。檢查涵蓋帳號／歌曲隔離、離線恢復與合併、復原／重做、重新載入、歌單／演出來源 ID、密集取樣與停筆抖動，以及沒有共享歌曲儲存。

本機實際 App fixture 已在 Playwright WebKit 檢視桌面、1024px 平板與手機版面；證據位於 `.impeccable/review/personal-notes-fix-1105/` 的 `desktop.png`、`user-1024.png`、`mobile.png`、`performance-1024.png`。原生全螢幕以 `document.fullscreenElement` 驗證；實際 pointer 輸入命中筆跡 SVG，自由筆跡與修整星形共新增兩筆且沒有翻頁，閒置後退出按鈕仍可操作並成功退出。獨立複審結論為可交付，沒有必要的介面修正。實體 iPad／Apple Pencil 由使用者試用中，尚無硬體延遲、手感或掌觸的測量結論。

2026-11-05 後續停筆修形與段落代碼修正另記於 `tmp/personal-notes-1105/hold-verification.json`：4 個相關測試檔、15 個測試通過，lint、production build 與 LAN build 通過，仍有既有大型 bundle 警告；上述 206 檔／2303 個測試是前一輪的全套紀錄。Playwright WebKit 實際 mouse Pointer Events 驗證抖動直線、螢光筆五角星及全螢幕畫筆圓圈，共 3 筆，重新載入後仍保留 3 筆；亦核對全螢幕工具可見性與點擊命中。桌面、手機、1024px 平板及演出版截圖位於 `.impeccable/review/personal-notes-hold-1105/` 的 `desktop.png`、`mobile.png`、`user-1024.png`、`performance-1024.png`。本輪獨立複審為 `ship`，交付範圍是 LAN 試用；實體 iPad／Apple Pencil 驗證仍待使用者試用，瀏覽器結果不代表硬體手感或掌觸已通過。

2026-11-05 前一輪常見圖形、安靜停筆與選取防護修正記錄於 `tmp/personal-notes-1105/shapes-verification.json`：6 個相關測試檔、40 個測試通過，lint、production build 與 LAN build 通過，保留既有大型 bundle 警告；未重新宣稱前述全套測試為該輪結果。新增圖形類型通過筆跡儲存驗證。Playwright WebKit 實際 mouse Pointer Events 驗證三角形、交叉五角星、外框五角星、菱形、五邊形、六邊形及箭頭共 7 次修形，並驗證緩慢書寫沒有修形提示或譜面進度環、全螢幕三角形、手寫期間選取與選單事件被抑制、結束後選取恢復；共 9 筆筆跡在重新載入後保留。

該輪桌面、手機、1024px 平板與演出版截圖位於 `.impeccable/review/personal-notes-shapes-1105/` 的 `desktop.png`、`mobile.png`、`user-1024.png`、`performance-1024.png`。獨立複審確認四張截圖有效，結論為 `ship`，沒有必要的介面修正，交付範圍是 LAN 試用。

2026-11-05 最新規則圖形與即時筆跡修正以 `tmp/personal-notes-1105/regular-verification.json` 為驗證依據：6 個相關測試檔、47 個測試通過，lint、production build 與 LAN build 通過，保留既有大型 bundle 警告；本輪指定範圍的 detector 沒有發現。前述全套與其他輪次的測試數保留為歷史紀錄。Playwright WebKit 驗證三角形、交叉五角星、外框五角星、菱形、五邊形、六邊形、箭頭與圓圈共 8 個修形案例，另確認全螢幕三角形、慢速書寫的安靜回饋與選取防護。螢光筆的 `multiply`／`0.36` 混色、復原、重做、整筆擦除及還原均通過，最後 11 筆筆跡在重新載入後保留。

桌面 WebKit 的 Pointer Event 到 SVG DOM 變更測量各取 60 次：修改前中位數 5 ms、p95 10 ms，修改後中位數 0 ms、p95 1 ms；更新後 LAN 重測同為中位數 0 ms、p95 1 ms。這只量到事件進入瀏覽器後的 DOM 更新，不含硬體取樣與螢幕顯示延遲，不能推論實體 iPad／Apple Pencil 的延遲或手感。

最新四張截圖位於 `.impeccable/review/personal-notes-regular-1105/` 的 `desktop.png`、`mobile.png`、`user-1024.png`、`performance-1024.png`。本輪獨立複審結論為 `ship`，沒有必要的介面修正，交付範圍仍是 LAN 試用。實體 iPad／Apple Pencil 的手感、掌觸及原生 iOS 選取選單仍待使用者試用；WebKit 的滑鼠與 DOM 事件驗證不代表這些實機行為已通過。

修改時應重點回歸筆跡定位、不同帳號切換、離線後重新載入／同步、演出手勢、即時與儲存筆跡幾何一致、停筆與慢速書寫、規則圖形及刻意拉長比例、交叉星筆順、選取防護恢復及匯出排除。NAS 所有權測試需維持交易 rollback，不能對共享譜面做示範寫入。最新修正沒有讀寫 NAS 或改動資料庫。

此功能納入 [0.12.12 發布](release-0.12.12.md)。該版本整版回歸為 208 個測試檔、2342 個測試通過，型別檢查、正式與 iPad 建置皆通過；實體裝置限制仍如上述。

本機 LAN 試用位址已隨電腦 IP 改為 `http://192.168.0.168:3000/?test=8`，建置位於 `tmp/personal-notes-1105/lan-build`。此試用使用模擬登入與歌曲 repository、停用 NAS，筆記僅存本機，不需要登入，也不寫入正式譜面。試用帳號及歌曲識別碼不變；不同 IP 屬於不同瀏覽器來源，本機試寫資料不會自動跨來源搬移。
