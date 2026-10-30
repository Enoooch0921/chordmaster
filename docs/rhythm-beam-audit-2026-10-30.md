# 節奏連桿與叉頭共用繪製檢查

本文件保留發佈前的分階段檢查紀錄。成果已整合至 [0.11.18](release-0.11.18.md)；各段的「尚未發佈」描述當時的檢查狀態。


基準版本：0.11.17（4775b061）。本次為本機候選版與測試頁，未發布、未修改曲庫或歌單資料。

## 範圍與發現

0.11.16 的連桿定位修正已套用所有歌曲共用的 CompactRhythmRenderer，沒有依歌名特判。本次再檢查圖形接縫、附點、三連音、休止、叉頭、延音與字型延遲載入。

常用的譜面預覽與精簡編輯中，主連桿原本已對齊符桿頂端，但橫桿只畫到符桿中心，兩端留下半個符桿寬的小階差。附點仍使用估算的符頭位置，與 Bach 實際符頭中心相差約 2.3 個譜面像素；未連桿音符的延音線與三連音括線也仍受字型行框影響。

原先只要同小節出現叉頭，就連普通音符也改畫成 SVG 橢圓與較粗的符桿。這會改變整個小節的普通符頭外觀，並非換了時值。本次普通音符始終使用 Bach 字型；叉頭依相同字型的外框與符桿粗細繪製，採平切端點，右緣與符桿貼齊。一般叉頭與普通符頭共用中心線，upper 叉頭仍保留原來較高的位置。

另外確認 `beamGroups=false` 原先沒有傳入實際幾何繪製，關閉後仍會相連。本次補齊設定傳遞，並在未共用連桿時保留三連音括線。

## 測試頁

本機 Vite 服務：`http://127.0.0.1:3166/tmp/rhythm-beam-audit/`。

- `basic.html`：八分、十六分、3/4、6/8。
- `dotted.html`：附點、混合時值與短連桿。
- `triplets.html`：三連音、休止、隱藏拍與關閉連桿。
- `mixed.html`：叉頭、延音與重音。
- `editor.html`：大型編輯顯示的次要參考。
- `reference.html`：Bravura 官方字型與符桿錨點參考，另列官方來源。

左欄保留基準版本，右欄使用候選元件；可調整小節寬度、畫面縮放與符號大小。另可加看 0.11.15，以重現先前已修正的字型行框偏移。

## 驗證

第一輪 Chrome：常用模式 304 組候選顯示組合；iPad Pro 11 M5／iPadOS 27.2 模擬器 Safari：248 組。涵蓋 128／220px 小節、100%／209% 畫面縮放、100%／134%／180% 符號大小。檢查主連桿頂端與兩側接縫、第二連桿接點與範圍、附點中心、三連音數字與括線的空間，以及延音線是否位於符頭下方。

另有回歸測試保護混入叉頭時普通 Bach 符號的字型、字級與位置不變，以及叉頭外框、upper 高度、字型載入後重測與卸載後監聽清理。

大型編輯仍使用另一條舊繪製路徑，量測有約 3.6–4.1px 的連桿垂直偏移。依使用者目前較少使用該模式的優先序，先記錄為次要問題，不列為本次常用模式通過的項目。

完整量測、截圖、測試紀錄與本機測試頁來源保留於主專案的 `output/rhythm-beam-audit-20261030/`。

## 叉頭位置的官方參考

[SMuFL 錨點規格](https://smufl.formats.music/latest/specification/glyphswithanchors.html) 將上行符桿的 `stemUpSE` 定義為符桿矩形右下角的位置，不是所有符頭共用同一個接點。[Bravura 官方字型資料](https://raw.githubusercontent.com/steinbergmedia/bravura/master/redist/Bravura.json) 中，`noteheadXBlack` 的接點為 `[1.16, 0.444]`，普通 `noteheadBlack` 為 `[1.18, 0.168]`（Y 正方向向上）。因此 X 位於上行符桿左下側、以右上端接桿的方向符合此正式字型的做法；不能把 X 直接置中在符桿線上。

叉頭高低另依譜面語意判斷。[LilyPond 節奏譜](https://lilypond.org/doc/v2.24/Documentation/notation/displaying-rhythms#showing-melody-rhythms) 可將音高壓在同一線；[打擊樂記譜](https://lilypond.org/doc/v2.24/Documentation/notation/common-notation-for-percussion) 則用不同位置區分樂器。對本產品的推論是：一般節奏叉頭可與普通符頭中心同高，明示 `upper` 的來源仍保留高位，不因 X 形狀自行升高或替它指定鼓件。Bravura 的數值只用來核對正式參考字型，不直接套到不同形狀的 Bach 候選叉頭。

參考頁只用官方字型與官方接點另外製圖，非候選元件截圖；字型與 OFL 授權放在本機測試目錄，沒有加入正式前端資產。

完整測試第一次有一個歌單導覽案例失敗（1818 通過、1 失敗）；該檔單獨重跑 23 項通過。待瀏覽器與模擬器量測結束後，完整重跑 168 檔、1819 項全部通過。型別檢查與正式建置亦通過。初次失敗與後續重跑紀錄均保留。

## 重音與連接線追加驗證

新增 `accents.html` 與 `connections.html`，涵蓋全音符重音、混合叉頭、三連音重音、同小節及跨小節連音線。重音改為寬扁的填色楔形，調整與連桿、三連音數字的距離；連音線以兩條曲線圍成漸細的填色形狀，兩端依實際符頭外框定位，跨小節切點保持水平切線。

追加後，Chrome 與 iPad Safari 各通過 **584 組**常用模式顯示組合，紀錄在 `articulation-chrome-*` 與 `articulation-native-*`。形狀參考 [SMuFL articulation](https://smufl.formats.music/latest/tables/articulation.html) 及 [LilyPond Tie](https://lilypond.org/doc/v2.24/Documentation/internals/tie)。

本批最終合併鍵盤修正後，完整測試 **169 檔、1856 項通過**，型別檢查、測試頁型別檢查及建置通過。鍵盤驗證另見 `docs/keyboard-audit-2026-10-30.md`。本批仍未發佈，沒有修改正式歌譜資料。

## 三連音排版精修

使用者確認採較接近傳統譜面的排法後，括線改為細線及中央缺口，數字 3 改用較輕的襯線斜體，並以相同字型的隱藏量測文字修正置中及缺口寬度。括線與數字依實際符號、重音高度避讓；短鉤下端亦保留留白。三連音的首末為音符時，括線對齊符桿，帶符尾的字型以符桿錨點定位，避免把伸出的符尾邊緣誤當成符桿。完整連桿上的數字改為對齊連桿中心，修正原先對齊中間符頭造成的水平偏移。

另外修正三連音與其他音符共用更長連桿時漏掉括線的情況：只有連桿與三連音範圍完全相同時才省略括線。此依循 [LilyPond 的三連音括線規則](https://lilypond.org/doc/v2.24/Documentation/notation/writing-rhythms#tuplets)；括線範圍亦參照 [Dorico 說明](https://www.steinberg.help/r/dorico-pro/6.2/en/dorico/topics/notation_reference/notation_reference_tuplets/notation_reference_tuplets_tuplet_brackets_c.html)。數字的字型、細線與中央缺口是本產品採用的排版樣式。

Chrome 與 iPad Pro 11 M5／iPadOS 27.2 RC 模擬器 Safari 各驗證 **288 組**：12 種組合、兩種小節寬度、100%／209% 縮放、100%／134%／180% 符號大小，以及常用預覽／常用編輯兩種模式。涵蓋二分、四分、八分、十六分三連音，首／中／末休止、停用連桿、共用長連桿與重音。檢查數字置中、中央缺口左右留白、短鉤與音符的距離、連桿數字避讓，沒有碰撞。全部節奏相關測試 **7 檔、95 項通過**，型別檢查、正式建置與差異空白檢查通過。此輪未重跑整套 App 測試；前述 1856 項屬精修前的完整回歸紀錄。

最新量測與截圖在主專案 `output/playwright/tuplets-*`；測試頁仍為 `http://127.0.0.1:3166/tmp/rhythm-beam-audit/triplets.html`。尚未發佈。

## 數字墨跡與短括線追加修正

使用者提供短三連音與不連桿比較圖後，確認前輪的 SVG getBBox 量到字型行框，斜體 3 的可見墨跡仍會偏離括線中心。已改用 Canvas TextMetrics 的 actualBoundingBox 量測，採 alphabetic baseline，依可見外框修正水平與垂直位置；無 Canvas 時保留 SVG 量測作 fallback。

短括線的數字、缺口、短鉤與線寬採同一比例，保留足夠長的水平臂，避免只剩兩個角。音符間距、時值及拍位不變。兩張不連桿截圖確實對應測試頁 beams=false 的案例；正常八分及十六分三連音皆保有連桿。測試頁新增「顯示不連桿案例」，預設關閉，展開時明示左側 0.11.17 未遵守關閉設定。

再次驗證 Chrome 與 iPad Simulator Safari 各 288 組，檢查可見墨跡置中、缺口左右留白及水平臂／短鉤比例，均通過。另以截圖黑色像素獨立驗證兩個原回報案例，數字中心與括線的誤差分別約 0.32／0.21 CSS px。節奏回歸 **7 檔、97 項通過**，型別檢查、建置與差異空白檢查通過。此輪沒有重跑完整 App 套件；沒有發佈及正式資料寫入。

證據為主專案 `output/playwright/tuplets-ink-*`、`tuplets-connected-final.png`；前一輪只量字型框的結果保留作歷史紀錄。
