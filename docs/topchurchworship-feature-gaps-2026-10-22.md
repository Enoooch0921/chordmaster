# 譜面校對：軟體功能缺口與改善紀錄

發布追蹤：以下五項實作、臨時速度緊湊呈現，以及手機吉他手模式入口已納入 `0.9.12`。本頁「尚未部署」敘述記錄各次本機驗證當時的狀態；實際發布結果以 [GitHub Pages 部署紀錄](https://github.com/Enoooch0921/chordmaster/actions/workflows/deploy.yml) 為準。

依 2026-10-22 使用者要求，校對時持續記錄。2026-10-24 使用者已授權實作 FG-09、FG-10、FG-07、FG-16、FG-02；這五項已完成本機實作與驗證，尚未部署。下表實例保留實作前診斷，最新結果見文末「2026-10-24 實作驗證」。只列已觀察到的限制或有實例的改善提案；原稿不清楚仍需人工確認，不能靠軟體猜填。舊需求歷史見 [原紀錄](topchurchworship-feature-gaps-2026-09-12.md)。

| ID | 狀態／優先序 | 實例與影響 | 建議與驗收方向 |
| --- | --- | --- | --- |
| FG-01 | 已確認限制／高 | 〈展開屬天的翅膀〉Verse 末格 E→A/B 切點不明，但 B 在第4拍明確。`chordTimingUnspecified` 目前使整格 `getChordEvents` 回傳空陣列，連 B 的已知入口也只能寫在註記。〈靠主常喜樂〉末格首 Eb 第1拍也有同類限制。 | 支援同一格內各和弦分別標示已知／未知拍位。已知事件可正常顯示及使用，未知者保留原序，不自動等分。 |
| FG-02 | 已實作，本機驗證通過；待部署 | `ChordSheet.tsx` 的 `formatBarAnnotation` 自動變更空白分詞大小寫。〈大聲敬拜〉原註記「人聲「在」G4」實際渲染成「人聲「在」g4」；原資料未變。舊需求第88批亦有同類紀錄。 | 譜面註記保留輸入大小寫，包含音名、和弦及專有名詞；不要靠新增縮寫白名單逐曲處理。需涵蓋一般、列印與未定拍格的註記路徑。 |
| FG-03 | 資料模型改善提案／中 | 〈大聲敬拜〉To Chorus 指第22格第3拍或第23格入口不明；〈如祢〉與〈Endless Praise〉有多層反覆與 Coda 條件。目前 `Bar` 保存記號／文字／房子，未提供明確目標格、目標拍及執行遍次欄位。 | 人工確認後能指定跳轉目標與遍次，並檢查路線是否完整。來源未確認時保持「未定」，不能自動推路線。此項尚未做完整播放流程測試。 |
| FG-04 | 工作流程改善提案／中 | 本輪校對狀態透過歌名「待校對／待人工」分流；逐首耗時、同一問題涉及多格的引用及重開條件存於外部檢查點、CSV與來源清單。 | 將校對狀態、耗時與人工待辦原生化，支援一個問題引用多格、標示原稿缺件及有新證據才重開。避免把流程資訊塞進歌名與譜面註記；此項尚未做完整 UI 盤點。 |
| FG-05 | 已確認資料模型限制／中 | 〈聖靈的火〉原第38格 Fine 在二分延音後、四分休止處，格內後面還有 Bridge 弱起。現有 `leftMarker`／`rightMarker` 只有格首／格尾定位，精確停止位置需文字補充。 | 導航記號可指定格內拍位，並區分該遍在 Fine 停止或繼續弱起。先保留原文字提示，不移動音符、休止或猜改標記位置。來源見第1897批原稿與計畫。 |
| FG-06 | 已確認資料模型限制／中 | 〈Same God〉末段行間有三組 Voicing「4 3 2 1」，未註節奏、八度或可靠的小節歸屬。`riff`／`riffVoices` 的原生簡譜會解析成拍槽與音值，目前未提供「只知音高順序、時值未定」的聲部資料。不能為顯示音高而猜四個四分音符。 | 支援未定時值／位置的有音高片段，音高、時值及小節歸屬可分別確認；未定者不進入精確節拍事件。現階段以具體待檢查問題保留原音高順序，不改成純節奏。 |
| FG-07 | 已實作，本機驗證通過；待部署 | 〈Same God〉全曲72.5 BPM，Verse 5 原稿另寫65 BPM。目前型別只在 `Song` 提供 `tempo`，`Section`／`Bar` 未提供速度事件；轉錄只能保留「65 BPM（手動切換）」提示。 | 支援指定段落／小節的速度變化及後續恢復速度，需同步顯示與參考節拍流程。此項只確認型別限制，尚未完整測試播放行為，不宣稱所有播放路徑都失效。 |
| FG-08 | 資料模型／工作流程提案／中 | 〈揚聲歡呼讚美（Easter版）〉Verse 明寫 Same as previous bars，數個同前符是重用前面的八格／四格和聲順序。現有 `%` 可畫單格記號，但 `Bar` 未提供「引用哪組前段小節、涵蓋幾格」的結構化來源關係；直接連續填 `%` 容易誤讀成每格都同前一格。 | 提供可選的小節群組引用與展開／收合，保留來源範圍與實際和聲。現在先保留逐格展開的和聲，不猜未明範圍。此項尚未做完整 UI／播放盤點。 |
| FG-09 | 已實作，本機驗證通過；待部署 | 〈黑門甘露〉原稿明寫 Dm 小調，但 `Key` 只含音名，`Song` 無大小調模式欄位；實際譜頭調性顯示 D，需由原Dm調標題保存來源含義。 | 調性選單上方增加「大調／小調」切換；選小調時，下方按鈕與譜頭 D 顯示為 Dm，其他音名同樣加 m，保留目前主音。分開保存主音與模式，原調／演奏調、重開及轉調後標示一致；級數基準另行明確設定，不由和絃猜模式，也不把既有和弦全部改成小和弦。詳見下方操作設計；尚未實作。 |
| FG-10 | 已實作，本機驗證通過；待部署 | 〈引領我〉原詞是韓文，現存於 `LyricsBlock.english`；實際渲染編輯器以「英文歌詞／貼上英文歌詞」標示含韓文的欄位。現有資料只有 chinese／english 與固定顯示選項，未記錄對照語言代碼。 | 讓對照語言可指定韓文等語言，欄位、配對與匯入標籤隨語言顯示；保留既有原文與句對。不宣稱目前不能保存韓文，也未做完整 UI／匯出／播放盤點。 |
| FG-11 | 已確認無小節區塊的提示呈現限制／中 | 〈Raise a Hallelujah〉Bridge Tag原「To Chorus」只在預設收合的「原譜註記」details內；目前元件對整個details設print:hidden，沒有另列可見的演奏提示。 | 將有用演奏指示與選讀來源註記分開呈現，讓前者可直接閱讀與列印。已驗證目前元件程式與原生SSR結構；尚未做正式站瀏覽器列印、PDF或紙本完整驗證，不宣稱所有匯出流程都已測過。 |
| FG-12 | 已確認限制／高 | 〈Joy Of The Lord〉Key change未署目的調，後段Unison／Tag有可讀原級數。現有`chordKeyUnspecified`僅保護和聲；器樂riff沒有對應的原調未定模式，絕對簡譜顯示仍依工作G／D轉換，可能把未確認調高當實音。 | 支援按段／小節保存未知調高的原級數器樂旋律，顯示清楚未定狀態；目的調確認前避免推算實音，音高序列、節奏、八度、聲部及其他已知調性段不受影響。 |
| FG-13 | 已確認子拍編輯限制／高 | 〈Build It Up〉多處是前半拍八分休止、後半拍和絃。主拍 `0_` 會使 `availableSubdivisionPositions` 擋住同拍所有追加位置，`reconcileChordSubdivisions` 也會刪掉同拍後半和絃；一般主拍編輯路徑有呼叫此整理函式。 | 八分休止只占半拍，同拍後半可加入和絃並安全保存；編輯、撤銷、重開及轉調後不得丟資料。已做帶／不帶休止的隔離函式對照與呼叫點核對，未做完整UI流程測試，不宣稱原始JSON不能保存此組合。 |
| FG-14 | 已重現輸入函式問題／高 | 〈How Great Thou Art（手寫 C 調）〉原 Tempo 為72–74。`sanitizeTempoInput` 會將 `72–74`／`72-74` 串成 `727`，再經 `normalizeTempoBpm` 限成400；三個現行編輯器都有此清理→提交呼叫路徑。`Song.tempo` 也只有單一數值欄位。 | 支援原稿速度範圍，或明確拒絕範圍語法且不串接兩端數字；不自選中間值。已做函式隔離與72／72.5／74對照、呼叫點核對，未做完整瀏覽器輸入流程測試。譜面目前只保留Tempo72–74文字，沒有寫入400或實作軟體修改。[證據](../tmp/topchurch-conversion/delivery/review-session-20261022/2077-feature-observations.json) |
| FG-15 | 已確認缺少專用記號／中 | 使用者詢問鈸滾奏（cymbal roll）。目前節奏資料與解析語法支援時值、叉形音頭、附點、三連音、重音及連音，沒有 roll／tremolo 屬性；編輯鍵盤與兩個節奏渲染器也沒有專用滾奏記號。原生 SSR 已確認可用 `Cymbal roll` 文字註記暫存。 | 支援鈸滾奏的正式記號與輸入，保存滾奏涵蓋的時值／起訖拍，並在預覽及列印呈現。現階段只記錄需求，未修改軟體；尚未驗證正式站操作、列印或播放行為。 |
| FG-16 | 已實作，本機驗證通過；待部署 | 〈神真是我力量〉Verse 第2、6格的 E/A 左箭頭資料存在，但追加子拍和弦列的容器裁掉上方箭頭；安裝版 PWA 實際可見0個箭頭。 | 保留追加子拍列上方符號空間，驗收兩箭頭、1& D/A、轉調與級數顯示；需查實際可見性，不能只計算 SVG 數。下方附診斷；尚未修改前端或部署。 |
| FG-17 | 已確認簡譜語法限制／中 | 〈我已被贖回〉Verse末格伴奏填句末音 E4 有明示還原號，前面曾出現 E#4。`JianpuAccidental` 只有空字串／#／b；`♮2_` 的解析從第2個字元開始，未保存還原字形。 | 支援明示還原號的輸入、保存、轉調與顯示，區分正確本位音與「原稿特別標還原」的記譜意圖。此曲已保存正確 E4 與短提示，沒有將音高存成 E#4；僅驗證型別、解析與原生渲染，未做完整編輯器／播放稽核。[證據](../tmp/topchurch-conversion/delivery/review-session-20261022/2573-feature-observations.json) |


### FG-09：調性選單的大調／小調切換（2026-10-24 使用者指定）

- 在目前調性選單的上方、音名按鈕之前，提供「大調／小調」切換，清楚顯示目前選項。
- 切換小調時保留目前主音：D → Dm，畫面下方按鈕同步顯示 Abm、Am、Bbm、Bm、Cm、C#m、Dbm、Dm、Ebm、Em、Fm、F#m、Gbm、Gm、G#m；譜頭顯示 `Key - Dm`。切回大調則 Dm → D，不自動改成關係大調 F。
- 選定後保存主音與模式，關閉／重開選單、重新載入及轉調後仍維持；例如 Dm 移調至 E，顯示 Em。原調與目前演奏調須各自保留模式，「Original」返回已保存的原調與模式。
- 大小調切換是調性設定，不將樂譜現有的 D、G、A 等和弦一律改為 Dm、Gm、Am，也不只因顯示 Dm 而重寫既有音高。級數／簡譜以主音小調或關係大調為基準，仍需明確設定，不能由這個按鈕偷偷切換慣例。
- 既有歌曲未保存模式時，不由歌名或首和弦批次猜填；〈黑門甘露〉等已有原譜證據的歌曲，後續依逐首確認補入。

此段記錄使用者截圖提出的介面與驗收要求，目前未修改 App、NAS 歌曲資料或部署。

### FG-16：追加子拍和弦列裁掉搶拍箭頭（已重現／高）

使用者確認在 TopChurchWorship 團隊曲庫開啟〈神真是我力量〉；實際安裝版 PWA 已重現 Verse 第2、6格 E/A 上方沒有左箭頭，雖然 NAS 仍保存 `E/A<` 及下一個 D/A 的1&事件。追加子拍和弦列的 `AutoShrink` 未開啟 `overflowVisible`，預設 `overflow-hidden` 將和弦上方的絕對定位箭頭裁掉；普通和弦列已開啟此選項。正式站公開程式亦使用相同路徑。先前只計算 SVG 節點數的 SSR 驗證沒有檢查可見性，不能據此宣稱使用者畫面正常。

建議修正追加子拍列的符號溢出空間，驗收此曲兩箭頭、1& D/A、轉調／級數及相鄰註記均可見；另檢查同一路徑的重音與延長記號。已保存四種原生輸出的裁切祖先證據及實際 PWA 觀察；依本輪先記錄功能問題的範圍，尚未修改前端或部署，也未改 NAS 歌曲資料。[診斷證據](../tmp/topchurch-conversion/delivery/review-session-20261022/2271-arrow-clipping-verification.json)。

### FG-06 補充：已知 Bass 與未定唱名分開處理

〈Relentless〉Bridge 2 的八格 Bass 曾僅存節奏，本輪將有來源依據的60個音頭與14處同音連線還原為現有 `riff`；兩格未知尾拍只保留已知前三拍，不補休止，屬資料遺漏修正。〈Reign Above It All〉手寫版的 Riff／Piano／EG／Bass 數字仍缺唱名制及部分八度依據，保留原音序、時值與局部來源，不猜成可播放實音；未定片段表示需求沿用 FG-06。兩曲的鼓、KB與其他獨立節奏保持，未修改前端。[Bass音高／時值／連線驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2420-music-verification.json)、[未定唱名與外部片段](../tmp/topchurch-conversion/delivery/review-session-20261022/2419-plan.json)。

### FG-01 補充實例：同格已知與未定拍位

〈生命河流〉兩段主歌的 F#m7/E 第1拍，以及副歌 D/E 第1拍、A 第3拍有來源依據；後面的 B9/D#／E7 換入時間未定。原生 `getChordEvents` 在三格均回傳空陣列，本輪以 `leftText` 保留已知入口，實際元件已確認顯示。這延續 FG-01 的逐和絃確認需求，不是新增一項重複缺口。[來源、程式雜湊與顯示證據](../tmp/topchurch-conversion/delivery/review-session-20261022/1945-feature-observations.json)。

### FG-06 補充實例：已知節奏、起點未定

〈The Joy〉Section 有兩拍音型 `e.^ s^ er e^`；Refrain 有兩拍音型 `e^ e^ e^ e^`，但來源未指定格內起點或是否重複。現有 `RhythmVoice` 只有 `id`、`label`、`rhythm`，`parseRhythmNotation` 從 `cursor=0` 依序產生事件；隱藏空位可表達已知位置，無法把「起點未知」當成結構化狀態。此例補充 FG-06 的未定位片段需求，不能為放進節奏行而猜首拍或補滿四拍。來源見第1913批計畫；只確認型別與解析行為，未做完整播放流程測試。

### FG-04 補充提案：歌詞異文與替代尾句

〈我的避難所耶穌〉詞譜與歌詞檔有不同中文措辭，譜尾另列「為了祢的榮耀／教會／國度差遣我」三種替代句。目前 `LyricsBlock` 有中英文字、段標及 `needsPairingReview`，可以另建詞塊；型別沒有專門的「同一句替代版本、來源、目前採用哪句」欄位。建議將這些選擇與外部歌詞待辦整合，避免把版本自述塞進段標，或把三種替代句誤當三次演唱。此項是工作流程／資料模型提案，尚未做完整 UI 盤點，不宣稱目前完全無法保存多份歌詞。證據：[第1926批觀察](../tmp/topchurch-conversion/delivery/review-session-20261022/1926-feature-observations.json)。

### FG-08 補充實例：同前範圍未確認

〈Love Let Loose〉Bridge 1 有八格「Same as Previous bars」，但前面相鄰的 Vamp 只有兩格，回指範圍不明。先前借用後面 Bridge 2 的和聲沒有足夠依據，本輪已撤回，保留八個實際小節與一個具體問題。群組引用應容許「範圍／目標未定」，避免為顯示記號而先猜和聲。[補充證據](../tmp/topchurch-conversion/delivery/review-session-20261022/1938-feature-observations.json)。

### FG-06 補充實例：6/8 手寫 Riff 未定時值

〈This Is a Move〉三行手寫音型有明確音高順序及 6→6、5→5 連線，但帶點、單線音群與 6/8 小節的時值／行配位仍需確認。先前漏記的音高已存入具體問題與來源紀錄，沒有猜四分／八分音值。這是原稿未定，並非原生旋律功能失效；可用未定時值聲部保存音高的需求仍屬 FG-06。[來源裁圖、音高順序與型別證據](../tmp/topchurch-conversion/delivery/review-session-20261022/1946-feature-observations.json)。

### FG-02 補充實例：連字號提示大小寫

〈Real Love〉儲存註記為 `Post-Verse。`，目前原生顯示成 `Post-verse。`，四種原生渲染均重現。歌曲資料仍保留原大小寫，這是既有格式化限制的補充證據，不另列新缺口，也未修改前端。[第2092批觀察](../tmp/topchurch-conversion/delivery/review-session-20261022/2092-feature-observations.json)。

## 本輪確認已有支援

- 〈Monument〉已用12個八分拍槽保存12/8四大拍位置1／4／7／10，並保留局部2/4，四種原生顯示通過。舊四槽陣列曾讓C落在第8個八分拍而非原稿第7拍，本輪按來源校正。建議來源轉錄／匯入檢查拍號與拍槽單位一致，屬流程驗證提案；不表示缺少12/8顯示能力。[第2088批觀察](../tmp/topchurch-conversion/delivery/review-session-20261022/2088-feature-observations.json)。

- `originalKeyUnspecified` 已能在譜頭顯示「原調未定」。〈Holy Forever（手寫 Db 調）〉原 Key 欄空白，本輪保留 Db 工作調並啟用此旗標，已做四種原生顯示驗證；這是既有狀態顯示能力，不代表 FG-12 的未知調高器樂音符保護已完成。[第2075批顯示證據](../tmp/topchurch-conversion/delivery/review-session-20261022/2075-source-key-validation.json)。

- 〈Go Tell It On The Mountain〉Verse 1 末格明署 Piano 的完整音高與時值可用既有 `riff` 顯示，已從純節奏還原，保留12個音頭與末1連線。這屬轉錄遺漏，不另列軟體缺口；Verse 2／3 尾段的音高與弧尾仍須原稿確認。[第2066批音符與四種原生顯示驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2066-music-verification.json)。

- 單小節同前符 `%` 已有原生 SVG 與全小節覆蓋。〈Rest On Us〉第1912批恢復八個原稿同前符，不應展開成推測和絃。
- 數拍斜線 `/` 已有專用字形、拍槽與移調保留，不是缺少功能。原譜 `C / / G/B` 應照錄成 `['C','/','/','G/B']`；先前存空字串是轉錄遺漏。G/B 的斜線低音是另一種語意。
- `partialMeasure`、額外器樂聲部 `riffVoices` 及節奏聲部 `rhythmVoices` 已在目前型別中支援，不沿用舊需求將它們誤報為完全不支援。
- 和絃行已有四分休止 `0`、二分休止 `0h` 及跨兩拍的覆蓋顯示。〈Same God〉Verse 1／Verse 3／4 末格原稿「F、四分休止、二分休止」應同列保存；先前拆成另一條節奏行是轉錄錯誤。已修正資料，不需新增軟體功能。
- 〈Every Praise〉Verse 填句、Voicing 與 Bass 只有節奏、音高藏在註記，是轉錄規則誤用，並非軟體缺少旋律或多聲部功能。已依原稿改回 `riff`／`riffVoices`，恢復36個帶音高音符；實際元件在 D／Eb、字母／數字和絃四種組合均驗證通過。其他歌曲先做資料初篩，須逐首對照原稿才能確認同類錯誤，不能按樂器名稱批量轉換。
- 〈勝過這世界〉原格末 4& 的跨格和絃可以移到下一格並使用現有左箭頭；同段第二房可併回原樂段，頁首原曲說明也不應建成空白 Bridge。這三項已修正轉錄資料，並非軟體缺少箭頭或房子功能；32個實際小節及獨立格內3&事件完整保留。

- 〈Alive〉Pre-Chorus 半音下行與 Tag 末拍填句已補回6個帶音高音符；先前只保留註記或節奏列是轉錄範圍誤用。原生 Riff 可保存這些內容，未署樂器的泛稱標籤已移除；兩格 Outro 未定音值保持原字面。[來源與差異](../tmp/topchurch-conversion/delivery/review-session-20261022/1924-plan.json)、[音高／休止／箭頭驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/1924-music-verification.json)。
- 〈奪回〉兩段 Pre-Chorus 各六格 Pn 旋律曾遺漏，已依原稿補回96個八分音符；同列 Unison、HH、Piano 與和聲休止可獨立保留。這是轉錄遺漏，現有軟體已支援，沒有新增功能缺口。可能與舊轉錄範圍過窄有關，但未獨立證明此曲當年的遺漏原因。[原稿與補錄紀錄](../tmp/topchurch-conversion/delivery/review-session-20261022/1923-source-instrumental-correction.json)、[原生顯示及音樂驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/1923-music-verification.json)、[NAS 完整回讀](../tmp/topchurch-conversion/delivery/review-session-20261022/1923-verification.json)。

- 〈Gratitude〉6/8 的同前小節 `%` 可覆蓋六個拍槽，前奏五個續拍 `/` 也能逐槽顯示；本輪恢復56個同前記號及20個原稿數拍斜線。這是轉錄資料修正，沒有新增軟體缺口。Bass 首格原稿六音頭的時值不合6/8，仍需較清晰原稿，不能截去末音來湊拍。[來源與處理](../tmp/topchurch-conversion/delivery/review-session-20261022/1929-plan.json)、[B／C及字母／數字和絃驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/1929-music-verification.json)。

- 〈愛的力量〉可在原生簡譜保留第1、3、4拍已知音符，讓第2拍暫空而不移動後續音符，也不把空拍變成休止；兩個高1的未定時值另列具體問題。此種「已知拍位中留空」已有支援，與 FG-06 的未定位音群不同。[拍位與完整資料驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/1952-music-verification.json)。
- 〈祢是全能神〉Verse、Chorus 的7格填句已恢復46個帶音高音符及4個八分休止，包含跨小節連線、低八度及降音；移除的5條純節奏是同一填句的重複表示，叉音頭獨立聲部保留。這是先前不在演唱段轉錄音高的規則誤用，原生旋律已有支援。另列兩格填句的配位與部分字形仍待確認，不猜成額外小節。[來源裁圖與差異](../tmp/topchurch-conversion/delivery/review-session-20261022/1953-plan.json)、[實際元件驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/1953-music-verification.json)。

- 〈聖靈來風〉下方譜表未標示人聲合音或器樂伴奏，本輪撤下「全部是人聲」的舊判定並列具體問題。原生多聲部功能仍可使用；此例尚未確認為器樂遺漏，不能當成已證實的軟體缺口或轉錄錯誤。[來源位置與待確認分類](../tmp/topchurch-conversion/delivery/review-session-20261022/1968-plan.json)。〈興起歡唱〉的附加和聲譜表也未明署角色，已撤下先前鋼琴的判定並保留問題；其已知和聲、切拍與不完全小節均保留。[分類與拍位核查](../tmp/topchurch-conversion/delivery/review-session-20261022/1975-plan.json)、[原生顯示驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/1975-music-verification.json)。

## 證據

- [本輪程式與實際元件觀察](../tmp/topchurch-conversion/delivery/review-session-20261022/feature-gap-observations.json)：包含原始值、實際輸出、程式雜湊；沒有 NAS 寫入。
- FG-01：`src/types.ts` 的 `Bar`、`src/utils/chordSubdivisions.ts` 的 `getChordEvents`／`availableSubdivisionPositions`；來源與完整前後資料見第1888、1892批計畫。
- FG-02：`src/components/ChordSheet.tsx` 的 `formatBarAnnotation`；第1893批原稿及候選資料。
- FG-03：目前 `Bar`／`Section` 型別與第1887、1893、1895批來源問題。
- FG-04：[逐首耗時](../tmp/topchurch-conversion/delivery/review-session-20261022/song-review-times.csv)、[人工問題清單](../tmp/topchurch-conversion/delivery/review-session-20261022/human-review-items.json)。
- Every Praise 修正：[NAS 完整回讀及其他622首未變](../tmp/topchurch-conversion/delivery/review-session-20261022/every-praise-pitched-voices-verification.json)、[原稿音高／時值及實際元件驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/every-praise-pitched-voices-validation.json)、[其他歌曲初篩，尚非確認錯誤](../tmp/topchurch-conversion/delivery/review-session-20261022/pitched-accompaniment-screening.json)。
- FG-06／FG-07：[Same God 本輪來源、差異與疑點](../tmp/topchurch-conversion/delivery/review-session-20261022/1906-plan.json)、`src/types.ts` 的 `Bar`／`Section`／`Song`、`src/utils/jianpuVoices.ts` 及 `src/components/Jianpu.tsx` 的拍槽／時值配置。只做來源與程式確認，未修改軟體或宣稱完成播放測試。
- Same God 休止行修正：[兩個原稿小節與 NAS 完整回讀](../tmp/topchurch-conversion/delivery/review-session-20261022/same-god-rests-followup-verification.json)、[單行休止、無重複節奏及第1／4拍延續斜線驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/same-god-rests-followup-validation.json)。
- 勝過這世界修正：[完整 NAS 回讀](../tmp/topchurch-conversion/delivery/review-session-20261022/more-than-conqueror-anticipation-verification.json)、[32格順序、原和絃時點及實際箭頭／段標驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/more-than-conqueror-anticipation-validation.json)。

- FG-08：[原稿與目前型別／元件觀察](../tmp/topchurch-conversion/delivery/review-session-20261022/1935-feature-observations.json)。只有群組引用提案，不宣稱單格同前符或一般反覆無法使用。

- FG-09：[原稿 Dm、型別與實際調性欄顯示證據](../tmp/topchurch-conversion/delivery/review-session-20261022/1962-feature-observations.json)。目前保留原Dm調標題與所有字母和絃，沒有把已知小調改成原調未定，也未改軟體。

後續只追加新實例、更新狀態或新增確有證據的項目，不逐批複製整份舊紀錄。

本輪補充實例：〈我全心信靠我主〉的 Segno 在 Verse 第8格第2拍，Fine 在 Chorus 首格第1拍後；〈去去記住去〉第二房 Fine 在第2拍後。原稿位置可讀，仍以簡短演奏文字保存，屬既有 FG-03／FG-05 的位置與條件表達需求，不再列成原稿導航不明，也未新增相同功能項。[第1981批](../tmp/topchurch-conversion/delivery/review-session-20261022/1981-plan.json)、[第1983批](../tmp/topchurch-conversion/delivery/review-session-20261022/1983-plan.json)。〈我全心信靠我主〉另有未署角色的和聲與低音譜表，先列分類待確認；此候選尚未證實為器樂遺漏。

- 〈興起為耶穌（來源1）〉原四部合唱譜的三處第3拍全休，已由 N.C. 更正為原生四分休止；第8格第4拍的 F 同音仍列伴奏和聲問題，沒有把它延長成休止。另補三處已確認第1／4拍換和絃的6個數拍斜線。四種調性／字母級數組合顯示通過，屬資料修正與既有功能，無須新增休止或斜線功能。[來源與差異](../tmp/topchurch-conversion/delivery/review-session-20261022/1987-plan.json)、[原生顯示與音樂保留驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/1987-music-verification.json)。

〈引領我〉的韓文內容及中韓唱句未改動；本項只確認語言欄位與實際編輯器標籤的限制。[第1990批來源與改動](../tmp/topchurch-conversion/delivery/review-session-20261022/1990-plan.json)、[型別及實際元件渲染證據](../tmp/topchurch-conversion/delivery/review-session-20261022/1990-feature-observations.json)。

〈誰能使我們與神的愛隔絕（原Gm）〉補充既有 FG-09／未定音高資料的來源實例：原曲 Gm、正文以關係大調的6作主音，但手寫前奏用1、2、1、7、1、2、1，未註1音基準與八度。已知七格四拍節奏與原數字完整保留，沒有猜成原生音高或新增功能缺口；四處未印和絃的舊Gm填值則撤下並列問題。這是來源與轉錄資料處理，不宣稱原生旋律功能失效。[第1995批來源](../tmp/topchurch-conversion/delivery/review-session-20261022/1995-plan.json)、[音樂保留及撤下驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/1995-music-verification.json)。

〈願天歡喜（手註E調）〉Bridge 的三個二分三連音已有本機 `h3 h3 h3` 解析及原生節奏顯示支援：三次擊奏各占全小節的三分之一，總長四拍。原稿另有音高，但印刷 F 調與手註 E 調之間的套用基準、八度／聲部仍需確認，因此保留原音高讀值與具體問題，不猜成 Riff。這不新增三連音功能缺口，也不把目前本機驗證當成正式站部署驗證。[第1999批來源](../tmp/topchurch-conversion/delivery/review-session-20261022/1999-plan.json)、[解析及元件證據](../tmp/topchurch-conversion/delivery/review-session-20261022/1999-music-verification.json)。

〈我安然居住〉原稿 Chorus 入口與 Instrumental 末端均有 Coda 圈十字；先前存於未使用的 `navigation:segno` 欄並漏存末端記號，是資料編碼錯誤。現有 `leftMarker`／`rightMarker` 可直接呈現 Coda，本輪已修正並驗證兩個原生字形；回奏路線與結束條件仍保留待檢查，不能由兩個符號推定遍數或 D.S.。這是既有功能的資料修正，無新增前端實作。[來源差異與顯示驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2001-music-verification.json)、[獨立受保護寫入與回讀](../tmp/topchurch-conversion/delivery/review-session-20261022/2001-nav-followup-verification.json)。

〈Only Wanna Sing〉補充既有 FG-06 的來源定位需求：EG Intro 已有原生帶音高資料，四格旋律、連線及兩個後半空位均未改成純節奏。另附 Keys Line 前三格音型與時值可讀，但原稿沒有指定套用哪個四格，末格部分時值與5→4演法未明；不能因 Instrumental 為四格，就推定同時演奏。本輪完整保留原音型於具體問題與外部來源紀錄，沒有新增重複功能項，也不宣稱鍵盤旋律目前無法儲存。[來源、音型與重開條件](../tmp/topchurch-conversion/delivery/review-session-20261022/2005-plan.json)、[現有 EG 旋律及其他音樂完整保留證據](../tmp/topchurch-conversion/delivery/review-session-20261022/2005-music-verification.json)。

〈Praise Him〉補回5個原稿 `和絃 / 和絃 /` 格中的10個數拍斜線，非斜線和絃的第1、3拍均不變；目前原生渲染在B、D兩調及字母／級數組合均通過。Bridge 的F#是格內獨立提前，下一格為B，因此保留原箭頭而不搬格。〈In Jesus Name〉四個C是格內延後；原生讀入既有v1資料後均正確顯示右箭頭。這些既有記號已支援；原稿未定的箭頭幅度／基準拍位仍列問題，不能把它誤報成箭頭方向功能失效，也不能由箭頭猜半拍。[Praise Him斜線與落拍](../tmp/topchurch-conversion/delivery/review-session-20261022/2011-beat-slash-validation.json)、[格內左箭頭](../tmp/topchurch-conversion/delivery/review-session-20261022/2011-music-verification.json)、[四個右箭頭及兩空格保留](../tmp/topchurch-conversion/delivery/review-session-20261022/2013-music-verification.json)。

〈信靠耶穌真是甜美（手寫和絃版）〉證實現有 `originalKeyUnspecified` 可保留F工作調、同時顯示「原調未定」。原稿未印Key，先前把F直接當已確認原調的呈現應改為正式未定狀態；這是既有欄位的資料修正，不需新增軟體功能。另依使用者未署拍號採4/4規則，恢復16格單和絃來源入口，九格雙和絃後續切拍仍未定；全部34個原和絃及25格邊界保持。[來源與允許差異](../tmp/topchurch-conversion/delivery/review-session-20261022/2015-plan.json)、[四種原生顯示及拍位驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2015-music-verification.json)。

〈Make It Loud〉Bridge首個原稿(Dm)已從長註記改回原生帶括號和絃，124格和聲入口、歌詞及反覆均保持；括號隨字母／級數及移調正確顯示，屬既有功能的資料修正。[第2016批原生驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2016-music-verification.json)。〈Miracle〉無小節區塊內的四個原稿數拍斜線也可正常顯示，不需為使用斜線而猜整句分節。[第2018批來源斜線驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2018-music-verification.json)。

〈All the Lights〉原頁明寫Bb實音、Capo3及G指型，現有Song.capo與原生譜面已能同時保存這些資訊；先前只在長註記交代、未填正式Capo欄是資料錄入遺漏，不是缺少Capo功能。本輪補入Capo3、保留全部實音資料及Guitar Solo提示，恢復兩段16格中的48個數拍斜線；Bb演奏調顯示原G指型，移到C演奏調則顯示A指型，級數保持。這些是目前本機元件證據，未據此宣稱正式站部署已驗證。[來源與差異](../tmp/topchurch-conversion/delivery/review-session-20261022/2019-plan.json)、[Capo／實音與指型驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2019-music-verification.json)。

〈Mali Mali ti yisusama（原Am）〉補充既有FG-09：原譜明署Am、下方Vocal以關係大調6起句；目前保留原Am標題、原Am字母和聲及既有C關係大調級數基準，未把它誤改成原C大調或猜未知語種。Tag明示2/4、再回4/4及七個原數拍斜線均有原生支援；原語異文另列歌詞待辦，Vocal簡譜不當成器樂聲部。[第2022批來源與混合拍號驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2022-music-verification.json)。〈求祢仰起臉來〉的兩個格內C7 2&入口及第1／2拍換和絃後的延續斜線也已驗證，不能把格內獨立2&一律搬至下一格。[第2023批拍位驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2023-music-verification.json)。

FG-11依據：目前原生ChordSheet將無小節區塊的annotation全放入預設關閉、帶print:hidden的details。〈Raise a Hallelujah〉原稿Tag to chorus的實用入口提示，儲存與文字均存在，但沒有details之外的演奏提示節點；這項只記錄目前元件結構及列印隱藏設定，未修改前端，也未驗證正式站PDF。[原生SSR、來源定位與程式雜湊](../tmp/topchurch-conversion/delivery/review-session-20261022/2017-feature-observations.json)。

〈Praise Like No End〉補充既有 FG-06：Verse 3／4第二房明寫 Bass Notes，低八度降3→2提前→降7延後有音高及八度依據，但無可確認的時值，故保留具體待檢查，不猜成等長音符。其未知子拍和聲列內的原稿斜線、格首持續斜線與格內箭頭已有原生顯示，可恢復27個slash；三處未印出的承接Bb攻擊已撤回，並非新增軟體功能。[來源與音高定位](../tmp/topchurch-conversion/delivery/review-session-20261022/2024-plan.json)、[完整音樂差異及四種顯示](../tmp/topchurch-conversion/delivery/review-session-20261022/2024-music-verification.json)。

〈Build My Life〉是既有FG-06的另一實例：Interlude四格Riff曾被暫排成每音四分、同八度，而原稿沒有這些時值／音區依據。本輪撤下這些推定，完整保留Interlude末格1232與Bridge末格6532等數字序列；有音高但時值未定的片段仍需要不猜拍位的表示方式。原C / / (G)的G明署Bass only，兩處均保留第4拍單低音提示，沒有當作全團G和絃。[來源及撤回理由](../tmp/topchurch-conversion/delivery/review-session-20261022/2027-plan.json)、[原生元件與音樂保留驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2027-music-verification.json)。

〈Across the Universe〉補充既有FG-06：前奏16音及末音低八度／跨格弧線可讀，但沒有明示每音四分或跨格延音終點；本輪撤下舊暫排時值，完整保留音高與已知八度供人工確認，未新增軟體實作。[來源與具體問題](../tmp/topchurch-conversion/delivery/review-session-20261022/2035-plan.json)、[完整音樂保留與四種顯示](../tmp/topchurch-conversion/delivery/review-session-20261022/2035-music-verification.json)。

〈Silent Night＋奪不去〉的三組房子可直接併回Verse，現有小節房號／反覆與轉調均能保存，101個原bar ID及16格Pno／Strings旋律不變，無須新增房子功能。原稿Vamp第2格轉104 BPM仍屬既有FG-07的段中變速需求；原生註記把儲存的「104 BPM」顯示成「104 Bpm」，是FG-02大小寫自動改寫的另一實例，未修改前端。[來源與分組](../tmp/topchurch-conversion/delivery/review-session-20261022/2037-plan.json)、[四種原生顯示與目前程式雜湊](../tmp/topchurch-conversion/delivery/review-session-20261022/2037-feature-observations.json)。

FG-12依據：〈Joy Of The Lord〉Pre-Chorus2的G調Synth已恢復28個音符；後段轉調未署目的調，Unison／Tag原級數與節奏另存來源紀錄並保留調性問題，未猜成G實音。隔離診斷把同一原級數放入riff後，`chordKeyUnspecified`警示仍在，但絕對簡譜依工作G／D產生不同音高；診斷資料未寫入NAS，沒有修改前端。[來源、原級數與修正](../tmp/topchurch-conversion/delivery/review-session-20261022/2039-plan.json)、[型別／元件／轉換函式雜湊及原生診斷](../tmp/topchurch-conversion/delivery/review-session-20261022/2039-feature-observations.json)、[28個Synth音符、16個EG重音及148個slash驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2039-music-verification.json)。

〈You Are Good（New Breed）〉的鼓獨奏段可直接使用現有括號和絃儲存六個定位和聲；原生字母／級數、E／B兩調均正常，無須新增括號功能。Brass前段與低音填句仍缺完整時值或八度，補充既有FG-06的未定片段需求；已存Brass、Sax、Unison旋律與獨立節奏全部保留，不能因段名或未定資料降成純節奏。[來源與未定音列](../tmp/topchurch-conversion/delivery/review-session-20261022/2046-plan.json)、[括號、數拍及音樂保留驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2046-music-verification.json)。〈聖靈的江河〉原四位置格的44個藍色短橫延續已統一為數拍slash；目前字母／級數與轉調顯示均支援，屬資料補正。[來源及四種原生顯示](../tmp/topchurch-conversion/delivery/review-session-20261022/2048-beat-slash-validation.json)。

第二階段〈10,000 Armies〉的82個原稿數拍slash可直接恢復，左向提前與右向延後箭頭、Verse末休止及獨立鼓節奏不變；原生B／D兩調、字母／級數均通過，屬轉錄資料遺漏，沒有新增箭頭或slash功能需求。原稿箭頭未標的提前／延後量與反覆遍數仍需人工確認。[第2049批來源與精簡註記](../tmp/topchurch-conversion/delivery/review-session-20261022/2049-plan.json)、[四種顯示及拍位保留](../tmp/topchurch-conversion/delivery/review-session-20261022/2049-beat-slash-validation.json)。

第二階段〈All Hail King Jesus（手寫版）〉確認 Pre-Chorus 與 Bridge 明署EG的14格、112個數字音符曾被存成純節奏。本輪已改回原生riff，逐音與原節奏的起點/時值相同，四個2/4短格及Tom/Kick獨立聲部保留；Bridge末未知0仍列問題，不猜時值。這是聲部分類及轉錄資料錯誤，現有旋律功能已支援，沒有新增前端需求。兩個歌詞配位問題已移至獨立清單。[來源與改動](../tmp/topchurch-conversion/delivery/review-session-20261022/2052-plan.json)、[112音符與四種顯示驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2052-music-verification.json)。

第二階段〈All That We Are〉三格原稿以 / / C/E /、/ / Dm7 /、/ / C / 表示延續，先前多補的首拍和絃已撤下，第三拍實際換入保持。現有原生畫面可顯示格首slash，屬來源轉錄修正，沒有新增顯示功能需求。[來源、歌詞外置及差異](../tmp/topchurch-conversion/delivery/review-session-20261022/2053-plan.json)、[四種顯示與事件驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2053-music-verification.json)。〈Alive（Gospel Version）〉原稿明寫Riff，因此簡查保留該標籤，沒有用關鍵字盲刪；無需NAS修改。[來源及只讀回讀](../tmp/topchurch-conversion/delivery/review-session-20261022/2051-verification.json)。

第二階段〈Be Thou My Vision〉可在6/8與4/8原生格保存19個數拍slash；〈Beautiful Savior〉的兩附點主拍則需用明確六槽存於第1／4個八分位置，已補60個slash並撤下20個未印新音頭。不能把帶slash的兩token簡寫陣列當成自動分半；本次以實際事件與四種顯示驗證後寫入，屬資料編碼修正，沒有修改前端。[6/8與4/8驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2055-beat-slash-validation.json)、[六槽、60斜線及真實換入保留](../tmp/topchurch-conversion/delivery/review-session-20261022/2056-music-verification.json)。〈Believe For It〉的上下數字聲部未署器樂/人聲角色、固定/首調與八度；保留原節奏雙聲部、完整音序及具體問題，不把原稿不明直接宣稱軟體不支援旋律，也不猜音。這是來源確認需求，沿用既有未定片段紀錄。[來源、音列與問題](../tmp/topchurch-conversion/delivery/review-session-20261022/2057-plan.json)。

FG-13證據：隔離資料以主拍0_及同拍offset0.5和絃測試，忽略該追加事件自身占位後，新增位置仍不可用、整理結果刪除和絃；移除休止的對照則可加入且保留。探針未存入NAS，也未修改前端。〈Build It Up〉本次保留原同拍精確offset，以簡短演奏提示保留前半拍休止意義；可獨立保存的22個跨格前八分休止、兩組確認4&提前及118個數拍slash已寫入。[來源與改動](../tmp/topchurch-conversion/delivery/review-session-20261022/2059-plan.json)、[函式對照及目前程式雜湊](../tmp/topchurch-conversion/delivery/review-session-20261022/2059-feature-observations.json)、[完整音樂白名單及四種原生顯示](../tmp/topchurch-conversion/delivery/review-session-20261022/2059-music-verification.json)。

- FG-15：[鈸滾奏資料、解析、編輯控制與原生文字註記驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/cymbal-roll-feature-observation.json)。只確認目前本機程式的專用記號缺口，沒有實作或部署。

第二階段第2127–2128批補充既有缺口案例：〈住在祢裡面〉兩格的 G/B、Asus4 首拍已知，只有後續 D/A、A 的拍位未定，但整格未知旗標仍使已知入口也不產生事件，延續 FG-01。〈你的愛不離不棄〉以關係大調 A 保存三升調號，既有 F# 小調中心仍需簡短註記；目前 `Key` 只有音名、`Song` 沒有大小調模式，延續 FG-09。這兩項沒有新增缺口編號，也沒有實作前端。核查範圍為目前型別、函式與原生 SSR，未宣稱完成 UI、播放或列印測試。[來源、目前程式雜湊及驗證依據](../tmp/topchurch-conversion/delivery/review-session-20261022/phase2/2127-2128-existing-feature-gap-evidence.json)。

第二階段第2138–2145批新增既有案例：兩份〈十字架／近主十架歌〉組曲的 Fine 需依演奏遍次接間奏或結束，保留一次路線提示，沿用 FG-03；〈呼召我的主〉原署 70–72 速度範圍仍以一次演奏提示保存，沿用 FG-14。〈喜樂泉源〉七個已確認延後半拍與三個跨格提前可用現有左右箭頭表達，已清除同事件的失效 offset，屬轉錄資料修正。〈喜樂如旗正飄揚〉Band 雙譜表的器樂聲部用途仍需來源／人工確認，不能當成軟體缺口。沒有新增功能編號或修改前端。[組曲來源](../tmp/topchurch-conversion/delivery/review-session-20261022/2139-plan.json)、[速度範圍來源](../tmp/topchurch-conversion/delivery/review-session-20261022/2142-plan.json)、[箭頭與完整音樂保留驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2145-music-verification.json)、[Band 聲部用途問題](../tmp/topchurch-conversion/delivery/review-session-20261022/2143-plan.json)。

第2181批〈展翅如鷹〉補充 FG-01：五個未定換和弦切點的小節，其首個和弦入口已可確認，但整格 `chordTimingUnspecified` 仍使全部事件回傳空陣列。逐和弦確認拍位的需求沿用既有編號，不新增重複缺口。第2177批〈宣教的中國〉漏存 G/B、C 則是轉錄資料錯誤，已用現有拍格修正；不列為缺少功能。[五格函式探針與程式雜湊](../tmp/topchurch-conversion/delivery/review-session-20261022/2179-existing-feature-gap-observation.json)、[資料修正依據](../tmp/topchurch-conversion/delivery/review-session-20261022/2177-plan.json)。

第2217批〈我們獻上〉補充既有 FG-03：原譜一般結尾同印 D.C.／Fine，另有續唱哈利路亞的可選第二房及 To Chorus；資料仍無明確跳轉目標、遍次與互斥分支欄位。已把錯放於可選 D 格的 D.C. 移回一般 G 結尾，以 Fine 記號加 D.C. 文字並列，原可選和弦均保留為演奏短註。這是資料定位修正；實際回唱遍次仍待確認，未宣稱播放路線已驗證，也沒有實作前端。[來源與變更](../tmp/topchurch-conversion/delivery/review-session-20261022/2217-plan.json)、[四種原生顯示與音樂保留驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2217-music-verification.json)。第2210批的小音符辨識及第2216批雙譜表伴奏用途分別屬原稿品質／演出範圍待確認，不新增軟體缺口。

第2219、2224批補充既有案例：〈我在這裡〉Fine停止遍次與To Chorus後是否依CD升F仍需條件/目標，沿用FG-03。〈我的避難所耶穌〉37格和弦時間未定仍保留整格未知旗標，沿用FG-01；同曲原資料「Band in」在目前原生SSR顯示為「Band In」，資料未變，重現FG-02。這次沒有新增缺口編號，也未實作前端。鋼琴接奏原被存成純節奏，已用現有riff恢復E4/F#4兩個十六分音符，屬資料修正。[大小寫實際輸出與程式雜湊](../tmp/topchurch-conversion/delivery/review-session-20261022/2224-existing-annotation-case-gap.json)、[鋼琴音高/時值及四種原生顯示驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2224-music-verification.json)、[Fine與升調問題](../tmp/topchurch-conversion/delivery/review-session-20261022/2219-plan.json)。

第2226–2233批：〈我能給你什麼〉及〈我跟隨主〉沿用FG-01的逐和弦已知/未知拍位需求；後者未定音列沿用FG-06，不猜定時值。〈我蒙救贖〉三房D.C./D.S./Coda分支仍以一次演奏指引表達，沿用FG-03。〈我要全心讚美〉四個明確4&跨格提前可用現有下一格左箭頭表達，已移除前格重複事件與失效offset、保留雙聲部電吉他，屬資料修正而非缺少箭頭功能。沒有新增缺口或實作前端。[四箭頭及完整音樂保留驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2230-music-verification.json)、[已接齊第二頁與四格F7疑點](../tmp/topchurch-conversion/delivery/review-session-20261022/2227-plan.json)、[未定音列來源](../tmp/topchurch-conversion/delivery/review-session-20261022/2233-plan.json)。

第2234–2241批補充既有案例：〈更新我心意〉首遍接Bridge、D.C.後走結尾至Fine，以及〈Last Battle〉D.S./Coda的目標與分支仍以一次演奏提示保存，沿用FG-03。〈Last Battle〉原為G小調，目前調性欄位未獨立儲存mode，沿用FG-09，保留小調提示及帶降號的相對音高。該曲Bass前奏第三格末音A2改為原稿C3、Refrain兩房合段，以及〈新的事將要成就〉兩處4&改成次格左箭頭，皆可用既有功能修正資料，不新增缺口。未實作前端，也未宣稱自動跳轉播放已驗證。[Bass音高與兩房完整保留驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2241-music-verification.json)、[雙譜表用途及特殊結尾問題](../tmp/topchurch-conversion/delivery/review-session-20261022/2240-plan.json)、[兩個跨格提前驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2237-music-verification.json)。

第2242–2249批：〈榮耀的呼召〉To Chorus後的遍次及收尾沿用既有來源問題與FG-03，未因本輪清理而猜定路線；三格原誤等分成第1/3拍的和弦，已依附點二分與末八分位置修成第1/4拍，屬資料修正。〈沙漠中的駱駝〉Dm中心、簡譜1=F沿用FG-09，三格手改雙和弦時間未定沿用FG-01；原前奏八度、x記號、圈刪及反覆弱起問題沒有新證據，保留具體問題。兩份〈求主賜我憐憫的心〉原註「簡譜/合聲譜」，下方疊唱屬人聲，不誤列器樂遺漏；確認的疊唱另存聲部歌詞紀錄。本批沒有新增功能缺口或實作前端。[第四拍修正與完整音樂驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2244-music-verification.json)、[原手改譜及待人工問題](../tmp/topchurch-conversion/delivery/review-session-20261022/2249-plan.json)、[獨立聲部歌詞紀錄](../tmp/topchurch-conversion/delivery/review-session-20261022/lyric-voice-notes.json)。

第2250–2257批：〈深不見底的愛〉Intro長音內Dsus4/D切點未知沿用FG-01，兩個D/F#修正至獨立4&經過和弦，沒有誤併為下格Em箭頭。該曲儲存「CD 版副歌升至 A」，原生顯示為「Cd 版副歌升至 A」；〈火火火〉儲存問題中的「Bridge」顯示成「bridge」，重現既有FG-02，不另編新項。〈渴望祢榮耀〉兩來源的空格/器樂手改與D.S.問題仍依各自來源保留，後者沿用FG-03。〈火火火〉及〈為此而活〉Bridge後未註收尾，已撤原假設終止線並保留具體問題；原譜未交代路線本身不算新軟體缺口。〈滿有能力〉側邊情緒已移除，保留手寫版識別；〈無人能與你相比〉下方明署合聲譜為人聲，末格C/G是舊歸納而非原印字母，改列演出和聲確認問題。本批沒有新增功能缺口或實作前端。[4&與CD實際顯示驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2251-music-verification.json)、[舊版左箭頭原生遷移、數拍slash及兩房驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2255-music-verification.json)、[側邊情緒清理驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2254-music-verification.json)、[末格歸納和聲問題](../tmp/topchurch-conversion/delivery/review-session-20261022/2257-plan.json)。

第2258–2265批：〈獻上感恩〉Coda倒數第二格G→C/G在全音長音內的切點未明，已撤原等分拍位，保留原和弦順序及具體問題；整格未知同時隱藏已知G首拍，沿用FG-01。〈盡心盡力來敬拜〉原F小調中心，現以關係Ab作簡譜基準，沿用FG-09；Csus第4拍/C在4&的現有細分事件可正常保留，沒有新增表示能力需求。〈煉淨我，哦主〉四個舊左箭頭經原生遷移保持方向，屬資料版本整理。〈牽引我心〉首拍未署和聲與三拍子〈當轉眼仰望耶穌〉三個空白格屬原稿/演出待確認；後者缺可配對詞版另記歌詞待辦。這些來源問題不新增軟體缺口編號，本批未實作前端。[已知/未知拍位案例與完整音樂保留](../tmp/topchurch-conversion/delivery/review-session-20261022/2261-music-verification.json)、[四箭頭與原數拍slash驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2258-music-verification.json)、[三拍子、空格及歌詞待辦](../tmp/topchurch-conversion/delivery/review-session-20261022/2264-plan.json)、[原4&細分事件保留及slash驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2265-beat-slash-validation.json)。

第2356–2360批：〈Here In Your House〉四格12/8舊四槽使第二和弦落在第8個八分單位，現依原稿四複拍改用12槽第1／4／7／10位置，與〈Monument〉同屬匯入資料單位問題，現有顯示可支援，不新增功能缺口。〈High To The Sky〉第二遍Verse的Bass由純節奏還原六個原級數音符及原休止／低音點；原調未署，已用現有旗標顯示「原調未定」，未定調高器樂的轉調保護需求仍沿用FG-12，沒有宣稱C工作調為確認實音。〈Holy Fire〉手寫版格內第三拍左箭頭與次格同名和弦沒有被誤併為跨格一次攻擊；21箭頭及四個原單格同前符均以現有功能保留。本批只改歌曲資料及外部記錄，未實作前端。[12/8拍槽與顯示驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2356-music-verification.json)、[原級數Bass與原調限制](../tmp/topchurch-conversion/delivery/review-session-20261022/2358-music-verification.json)、[手寫版箭頭及同前符驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2360-music-verification.json)。

第2371–2375批：〈Jehovah〉Verse 4兩格EG Riff的音高、附點／十六分與同音連線可核，已用現有riff還原八個音頭；Bridge 1 Piano低1的一／二低八度點仍不可靠，完整音序與節奏留外部片段紀錄並具體問音區。〈Jesus We Love You〉Verse 1的Piano「4、4、4、1、2、3」前三個4未畫減時線，不能硬猜六八分；同樣沿用FG-06的未定器樂片段表示需求。該曲一格B/D#已按明確六八分槽由第2校正至第4八分單位，是資料修正，不新增顯示能力缺口。〈In Jesus Name (Re-arrange)〉副歌首D的原左箭頭已補，未定提前量未猜半拍。本批未實作前端。[EG完整音符／連線及未知Piano音區](../tmp/topchurch-conversion/delivery/review-session-20261022/2374-music-verification.json)、[六八分入口及Piano片段](../tmp/topchurch-conversion/delivery/review-session-20261022/2375-plan.json)、[原D左箭頭驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2371-music-verification.json)。
第2381–2390批補充既有案例：〈Look Around〉間奏後八格原印「%」，先前填成八格C，但來源仍未確認是同前單格或四格群組；已恢復原符號並保留未定參照及具體問題，沿用FG-08，不把來源疑點當作新功能缺口。〈Love Won’t Let Me Down〉12格Synth及6格Strings可核音高、八度、休止與連線已用現有riff恢復90個音頭，屬轉錄資料錯誤；另一格Strings第3拍首音重描不明，已知完整節奏與音序仍保留，未知音高的局部表示需求沿用FG-06。〈Living Hope〉Tag第4拍休止及〈Mention of Your Name〉原數拍slash均可用現有功能表示。本批只修歌曲與外部記錄，未實作前端。[未知反覆參照及八個符號驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2382-music-verification.json)、[90音的音高／時值／連線及原生顯示驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2386-music-verification.json)、[既有休止表示驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2381-music-verification.json)。

第2391–2395批：〈More Of You〉Pno低7波浪終點、Bridge數字伴奏，以及〈Never Lost〉Bass末高1與〈New Thing Coming〉Bass/EG部分格的未知延持，沿用FG-06；能確認的18個Bass/EG音頭已用現有riff還原，沒有將未知後半格補休止或長音。〈My Story With My Saviour’s Love〉140/70及兩個標回140的位置疑點沿用FG-07，未猜唯一恢復點。〈Never Lost〉原生C轉調本來已存在且驗證正確保留，並非缺少轉調功能；五組〈More Of You〉房子及〈Never Lost〉第二房可用現有ending合回原段，屬資料編排修正。原稿slash與40個格內左箭頭也可用現有功能顯示，沒有新增缺口或前端實作。[五組房子／全部音樂保留](../tmp/topchurch-conversion/delivery/review-session-20261022/2392-music-verification.json)、[六八分Bass與原C轉調](../tmp/topchurch-conversion/delivery/review-session-20261022/2394-music-verification.json)、[Bass／EG已知音高與40箭頭方向保留](../tmp/topchurch-conversion/delivery/review-session-20261022/2395-music-verification.json)、[局部速度疑點與原延續拍](../tmp/topchurch-conversion/delivery/review-session-20261022/2393-plan.json)。

第2396–2400批：〈Oceans（Cello）〉原大提琴譜在Verse首格及Chorus七格也有完整器樂音符，先前因「人聲段不轉器樂」的舊範圍限制而漏存，現依修訂規則還原13個音頭；低音譜表兩升號的A3/B3/A3/C#4/E4、二分/附點二分/四分及原Intro/Interlude全部核對，屬資料遺漏，現有riff可表示，不新增功能缺口。其66–62.5速度適用段落仍待確認，沿用FG-07。〈O Holy Night（Peace Project）〉第二遍略過Vamp，以及〈O Praise the Name〉D.S./Coda條件、〈O Little Town Of Bethlehem〉第一房與兩段Vamp路線沿用FG-03，未因註記精簡猜定。〈Nobody〉獨立末格節奏與兩種末尾箭頭/延長均保持，移除的只是過程自述及未署樂器泛稱。本批未實作前端。[大提琴音高／八度／時值與四種原生顯示](../tmp/topchurch-conversion/delivery/review-session-20261022/2400-music-verification.json)、[具體路線問題與原Cue保留](../tmp/topchurch-conversion/delivery/review-session-20261022/2397-plan.json)、[Nobody全部音樂及72slash保留](../tmp/topchurch-conversion/delivery/review-session-20261022/2396-beat-slash-validation.json)。

第2401–2405批：〈On My Knees Again〉20個裸G#m→F#及〈One Name〉手寫版四個混合箭頭格的切點／錨拍未確認，已撤等分假設而保留原順序；整格未知也隱藏已知首和弦的限制沿用FG-01，不為顯示事件而猜落拍。〈Only Jesus〉頁底Lead-line未指定段落／聲部，以及〈Only Wanna Sing〉EG後半時值、Keys Line未指定套用段落，沿用FG-06，長註仍是原音序唯一載體時不當作自述刪除。〈One Name〉23個原單格同前符、六格Drum Only期間的和聲全休止，以及〈On My Knees Again〉Tag末兩個四分休止都已用現有正式記號保存，屬資料修正；未新增功能或前端實作。[20格未定切點與Pno保留](../tmp/topchurch-conversion/delivery/review-session-20261022/2402-music-verification.json)、[23同前符／六格正式休止與箭頭方向保留](../tmp/topchurch-conversion/delivery/review-session-20261022/2403-music-verification.json)、[Lead-line定位問題](../tmp/topchurch-conversion/delivery/review-session-20261022/2404-plan.json)、[EG及Keys Line保留判斷](../tmp/topchurch-conversion/delivery/review-session-20261022/2405-plan.json)。

第2508–2512批：〈和平君王〉Unison兩個上聲部與兩個下聲部由節奏還原六個已知音頭，次格後兩拍及其他灰底數字的聲部／唱名制仍待確認，沿用FG-06；六個Chorus三和弦未定切點沿用FG-01，Tag／第二房路線沿用FG-03。〈和散那〉補回原大譜表59個低音音頭及三個人聲休止處右手填句共9音，保留半拍弱起與末7/8；前方留白用定位槽，未新增假休止。這些是轉錄資料修正，現有riff與riffVoices可承載；本批未確認新功能缺口、未改前端或部署。[Unison音高及未知尾拍驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2511-music-verification.json)、[低音與右手填句音區／時值驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2512-music-verification.json)。

第2518–2520批：〈在教會中得榮耀〉五處獨立伴奏填句與四個平行聲部已還原40音頭，原一拍弱起及末三拍保持，可由既有riff／riffVoices承載，屬資料遺漏修正。〈在祢沒有難成的事〉Piano數字未署固定／首調，仍保存原數字與時值並提出具體基準問題，未由和聲推定實音，沿用FG-06；十格未定和弦切點沿用FG-01。其末格同列F / G/F四分休止已用和弦拍槽保存，撤除自加擊奏／重複休止行；To Chorus及Bridge回接問題沿用FG-03。〈在祢寶座前〉歌詞版本問題已移出樂譜，第一房起點與尾奏搶拍問題仍保留。本批沒有新增功能缺口或前端實作。[40音與平行聲部驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2518-music-verification.json)、[末格休止與Piano基準未定紀錄](../tmp/topchurch-conversion/delivery/review-session-20261022/2520-music-verification.json)。

第2526–2530批：〈大山你算什麼〉清除兩個泛稱標籤，五個舊版左箭頭與四格獨立節奏完全保持，沒有由箭頭推算後兩處的提前量；缺節奏片段仍沿用FG-06。〈大聲敬拜〉三個Intro房子段合回五格，完整四拍副歌弱起與後續十六格合回同段；全部50格、Synth Lead音符／連線／原ID保持，撤除To Chorus處誤設終止線，目標弱起或主段的問題沿用FG-03。〈大山為我挪開〉原生轉F欄位保留，只去重複文字；〈多雨的響聲〉未定拍位維持未知，沿用FG-01。本批沒有新增功能缺口、前端實作或實際瀏覽器可見性宣稱。[五箭頭與節奏保留](../tmp/topchurch-conversion/delivery/review-session-20261022/2527-music-verification.json)、[房子／副歌合段及Synth完整音樂驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2529-music-verification.json)。


第2531–2535批：〈奪回〉Bell／Pn／Synth 與〈如祢〉EG 數字未明示固定唱名或首調，只新增一次具體問題，原音序／八度／時值保持，沿用FG-06；未宣稱實音與轉調已確認。〈如祢〉四個自加節奏泛稱及三個下聲部泛稱移除，全部獨立節奏、Cym 標示及五個舊箭頭保持；Cym roll 原生符號需求沿用FG-15，未定拍位及Coda路線沿用FG-01／03。〈如何描述祢是多美麗〉與〈如何能描述祢是多美麗〉各依本身原譜確認換和弦拍格，兩個不同版本、原弱起及末不完全小節保持。本批補55個持續拍斜線，沒有新增功能缺口或前端實作。[獨立節奏與唱名基準驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2535-music-verification.json)、[G/A→A第3拍局部覆核](../tmp/topchurch-conversion/delivery/review-session-20261022/2533-post-readback-onset-check.json)。

第2536–2540批：〈如鹿切慕溪水〉原大譜表低音線先前因非器樂段而未錄，現按低音譜號及兩升號還原16格、88個印刷音頭及九條同音連線；既有riff可承載，屬轉錄資料遺漏，不新增功能缺口，首A7第4拍後半保持。〈尊貴全能神〉前奏四行純計拍依單和弦擁擠例外省略，五行真正獨立節奏及兩個新版左箭頭不動；Bass音高、手註音區/時值與EG替代段仍沿用FG-06／03。〈小小的夢想〉清除七個未署名泛稱，原58個器樂音頭及一拍雙聲部弱起保持。本批沒有前端實作或新增功能缺口。[低音音高／時值／連線驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2537-music-verification.json)、[計拍省略及獨立節奏保留](../tmp/topchurch-conversion/delivery/review-session-20261022/2539-music-verification.json)、[雙聲部弱起與標籤整理](../tmp/topchurch-conversion/delivery/review-session-20261022/2540-music-verification.json)。

第2541–2545批：〈小小的夢想〉正式來源1原58個器樂音頭與雙聲部弱起保留，清除七個泛稱；其手寫F#dim與來源2不同，不合併版本。〈居住在我心〉24個新版左箭頭和格內細分保留，兩格整格未知與第一房返回問題沿用FG-01／03。〈平安平安〉手寫版Unis音序的時值、音區與唱名基準未全確認，原節奏保持而問題明列，沿用FG-06；Coda遍次與括號Bb7沿用FG-03。〈引領我〉原6/4及Dsus2a、D第5拍保持，兩個未知切點沿用FG-01，末時值缺口沿用FG-06，韓文存英文欄沿用FG-10。這些既有問題未新建重複缺口，本批只改歌曲及外部紀錄。[雙聲部與版本差異保留](../tmp/topchurch-conversion/delivery/review-session-20261022/2541-music-verification.json)、[三拍格與未知Unis](../tmp/topchurch-conversion/delivery/review-session-20261022/2544-music-verification.json)、[混合拍號與細分保留](../tmp/topchurch-conversion/delivery/review-session-20261022/2545-beat-slash-validation.json)。

第2546–2550批：〈復興從我開始〉Pre-Chorus五個第二和弦原被兩槽等分在第3拍，局部原譜確認在2&連音起點，已用既有offset修正，屬資料錯誤，不新增功能缺口。〈復興〉四個長音格第二和弦切點未能確認，撤等分拍位、保留原序及共通具體問題；原Pre-Chorus第4格問題保持，與〈心靈深處的渴慕〉既有七格未知一同沿用FG-01，沒有為顯示首和弦而猜後續拍位。〈彩虹下的約定〉與〈復興聖潔〉只保留具體人聲弱起／三連音入口，過程解說移出；原Csus4→C的2&與不同和弦品質保持。本批沒有新增功能缺口或前端實作。[五個2&入口修正](../tmp/topchurch-conversion/delivery/review-session-20261022/2547-music-verification.json)、[長音格撤等分假設](../tmp/topchurch-conversion/delivery/review-session-20261022/2549-music-verification.json)、[七格未知及原入口保留](../tmp/topchurch-conversion/delivery/review-session-20261022/2550-beat-slash-validation.json)。

第2551–2552批：〈恩典之流〉原開頭為八分休止加兩個十六分，共一拍，先前僅註記，現補既有原生pickup節奏；Chorus兩房及Ending兩房合回原段，27格、房號與反覆全部保持。第二遍C/E→C7的第1/3拍與第二房F/C的2&原事件不變，主譜39及第二遍2個持續slash分別補回；這些是資料整理，既有功能可表示，不新增缺口。〈快樂拍手〉一拍半弱起與兩拍半末格、3&/4&及末G提前保持，只精簡過程說明。本批沒有新增功能缺口或前端實作。[房子／一拍弱起／第二遍驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2552-music-verification.json)、[複合入口與末partial保留](../tmp/topchurch-conversion/delivery/review-session-20261022/2551-beat-slash-validation.json)。

第2553–2555批：〈愛的真諦〉五處獨立伴奏填句及三個平行聲部已依高低譜號/一降號/加線補回26音頭，F4/G4/A4等上聲部與A3/Bb3/C4等低譜表線分開；短句後接回靜態和弦配置，用定位槽而非假休止。既有完整縮編和弦/省音/細分全部保持，24段縮編過程解說外置，現有riff及riffVoices能承載，屬資料遺漏，不新增功能缺口。〈愛的力量〉保留八格器樂原字串與兩個2/4格，另共問首調/固定唱名基準，時值與間奏演出位置沿用FG-06／03；〈惟一最愛是你〉五個長音格未知沿用FG-01，沒有重猜或清掉實用入口Cue。本批沒有前端實作。[26音與平行聲部驗證](../tmp/topchurch-conversion/delivery/review-session-20261022/2555-music-verification.json)、[混合拍號及器樂字串保留](../tmp/topchurch-conversion/delivery/review-session-20261022/2554-music-verification.json)。

## 2026-10-24 實作驗證

本次依使用者授權完成以下五項；狀態為本機已實作、尚未部署，沒有修改 NAS 歌曲資料。上方原始診斷與先前「未實作」敘述保留作歷史紀錄，以本節為最新狀態。

| ID | 已完成行為 |
| --- | --- |
| FG-09 | 歌曲原調與演奏調可分別保存大／小調。Key 選單新增切換，小調顯示 Dm、Em 等，轉調保留模式，「還原原調」同時還原根音及模式。譜頭、曲庫摘要與參考播放器顯示模式；歌單改根音沿用來源歌曲的模式，模式本身在歌曲編輯。既有歌曲未批次猜測大小調；不改寫和弦或暗中變更級數基準。 |
| FG-10 | `lyricsDoc.translationLanguage` 保存對照語言，未設定者仍按既有英文處理。歌詞頁、整首匯入、句對配對與歌詞本的欄位名稱隨語言顯示，提供韓文、日文、印尼文等選項。沿用 `english` 儲存欄位以維持舊資料相容，切換語言不翻譯、不改寫或重新配對現有文字。 |
| FG-07 | Section／Bar 可指定 BPM、延續前一速度或回到全曲速度；以書寫順序套用，先段落後小節，小節優先。全編輯器與預覽快捷編輯器均可設定，包括細分拍和弦介面。原生譜面顯示速度事件並保留排版空間；參考音源面板可選譜面速度位置，手動套用現有練習播放速率指令。新事件輸入接受單一 20–400 BPM、最多兩位小數，拒絕把速度範圍串成另一數字。 |
| FG-16 | 追加子拍和弦列的 AutoShrink 保留符號溢出空間，左／右箭頭與同一路徑的和弦符號不再被該層裁切。 |
| FG-02 | 譜面註記保留原輸入大小寫，不再自動改成標題式大小寫。一般、拍位未定、調性未定與無小節區塊均有回歸測試。 |

驗證結果：TypeScript 檢查通過；82 個測試檔、864 項測試全部通過；正式 Vite 建置成功（仍有既有的大型 chunk 提示）。新增驗收測試見 [FeatureGaps.test.tsx](../src/components/FeatureGaps.test.tsx)。

在實際本地 App 匯入獨立測試歌曲，確認 Dm → Em → 還原 Dm、對照語言切換及重新載入保存、段落速度 65 BPM、小節速度 68.5 BPM 及回復 72.5 BPM。細分拍小節的速度亦經快捷編輯器實際修改並重新載入回讀確認。桌面 1440px、手機 390px、列印媒體模式中，兩個箭頭經裁切祖先矩形交集計算均完整可見；實際截圖亦已目視核對。證據保存於本機 `output/playwright/fg-*`，該資料夾不納入 Git。

參考音源的測試確認速度選擇與播放器指令，不含實際 YouTube 音訊速度量測；沒有建立影片秒數與小節的自動對照，也不會自動跳到或跟隨某段。列印驗證為瀏覽器媒體模式與原生元件，未宣稱已完成實體列印或正式站 PDF 驗收。FG-14 的既有全曲速度範圍輸入另案仍保留，不因本次新速度事件控制項的驗證而列為完成。

### 2026-10-24 FG-07 緊湊呈現修訂

依使用者回饋，速度事件改成與臨時轉調相同的頂緣小標籤；同格有轉調與變速時合併顯示。移除速度專用的 20px 上方空間與 0.35 排版權重，不因速度事件增加行高或頁數。編輯控制改成與 Key 選單相近的小按鈕，點開浮動選單才顯示選項與 BPM 輸入；沿用原有保存、還原與輸入驗證。已在本地 App 確認按鈕高度約36px、譜面列外距0px、輸入時焦點不被搶走；截圖與操作證據存於 `output/playwright/tempo-compact-*`。仍未部署正式版。
