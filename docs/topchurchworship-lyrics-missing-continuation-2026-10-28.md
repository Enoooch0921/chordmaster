# TopChurchWorship 缺詞續補｜2026-10-28

本輪補齊7首原本沒有獨立歌詞的歌曲，合併1首既有歌曲被拆成兩半的副歌，另依使用者確認將2首〈Beautiful Savior／我美好救主〉的「榮美就主」更正為「榮美救主」。共9首不同歌曲完成NAS條件更新及完整JSON回讀。原有和弦、音高、編曲、調性、完成狀態與其他歌曲欄位均保留。

洛杉磯烈火優先處理的最後一首缺詞〈Nothing Is Impossible〉已補入來源曲庫及1份歌單歌曲副本。最後核對6份歌單、39項、29首不同歌曲：來源歌曲與每個有效歌單項目皆有獨立歌詞。這項完成度指基本詞稿齊備，不代表每次演出即興及逐小節配位已核完。

| 新增基本歌詞 | 詞版依據與段落 |
| --- | --- |
| Nothing Is Impossible | 現有Planetshakers雙語詞稿與原Manila譜的版本資料交叉比對；Verse、Chorus、Bridge。兩頁相同詞句不重複追加；Bridge原稿中英兩欄均作英文I Believe，照唱詞保留。現有人工樂譜完整保留。 |
| 為此而活（手寫 G 調版） | 原譜與已有完整詞版均為G／70，Verse17格基本和聲逐格吻合，副歌／橋段結構一致；保留手寫版不同voicing。Verse 1、Verse 2、Chorus、Bridge。 |
| 開啟我的雙眼（手寫 Ab 調版） | 與含正文原譜同Ab／136，主歌、Pre-Chorus及副歌的基本和聲核對相符；依既有中文詞頁保留三節主歌、完整副歌及兩句Bridge，不生成英文翻譯。 |
| 不停湧出來（Feast Family 新版） | 使用者確認「原詞相同，只改編曲，可補基本歌詞」；以斯拉原詞Verse 1、Verse 2、Pre-Chorus、Chorus。 |
| In Jesus Name（Re-arrange） | 使用者確認Darlene Zschech／Israel Houghton詞版；雙語Verse 1、Verse 2、Chorus、Bridge，逐句配對。 |
| 我美好救主（CHC） | 使用者確認Beautiful Savior詞版；雙語Verse、Pre-Chorus、Chorus、Bridge，保留原句分行。疑似錯字另經使用者確認，統一為救主。 |
| 信靠耶穌真是甜美（手寫和絃版） | 使用者確認沿用所示傳統歌詞；四節不同主歌及一段副歌完整保留，未添加英文翻譯。 |

既有〈Open My Eyes（開啟我的雙眼）〉原先Chorus 1／2是同一完整副歌的上下半部，依新配對中文詞稿合併成Chorus；所有原有中英文逐字保存，不把原有「你」改成另一詞頁的「祢」。另一首〈Beautiful Savior〉也已依使用者確認修正「就主」錯字；其原有分段、對句與顯示偏好保留。

全庫631列、627首使用中歌曲，缺獨立歌詞由91首降為84首。新查得的FCYA〈Goodbye Yesterday〉PDF仍只有和弦，沒有詞頁；未據此猜填。〈Alive〉等未能確定詞版的舊候選沒有因同名自動套入。完整當前缺詞佇列為 `tmp/topchurch-conversion/delivery/lyrics-missing-20261028/pending-items-after.json`，後續有新詞稿、同版證據或使用者確認再開啟。

本輪已解除7首的基本詞版缺漏待辦。〈Nothing Is Impossible〉Manila與〈不停湧出來〉Feast Family的即興／Talk、回唱及具體配位，仍保留為獨立歌詞問題；CHC版各次配位尚未逐句核對。不將這些疑點放進樂譜註記。

每筆寫入均先備份NAS完整列、比較完整舊JSON，並以歌曲ID、TopChurchWorship library ID、使用中狀態及未變動updated_at保護；寫後完整回讀。歌單副本另以xmin防止覆蓋併發修改。批後全庫比對，9首以外歌曲列不變，歌單其他override與編排不變。最後觀察到〈滿有能力〉一項source_baseline及其父歌單時間戳刷新，已驗證新基準完全等於目前來源內容與revision，保留現況；未回寫舊基準或時間戳。

驗證通過：允許欄位差異、音樂與其他欄位不變、來源字詞／順序、雙語對句、基本段落、結構化與序列化一致、App正規化及實際LyricsSheet伺服器渲染。未宣稱已完成瀏覽器A4分頁驗證或全庫逐字人工核准。各批保留實際寫入／回讀秒數；共用查來源、等待使用者與準備時間未攤成逐首假精確耗時。

主要證據在 `tmp/topchurch-conversion/delivery/lyrics-missing-20261028/`：

- `summary.json`、`library-before.json`、`library-final.json`、`priority-final-verification.json`。
- 根目錄：Nothing Is Impossible來源、計畫、歌單副本更新與完整驗證。
- `source-pair-followup/`：為此而活、開啟我的雙眼、不停湧出來及Open My Eyes副歌合併。
- `user-confirmed-followup/`：3首使用者確認詞版與完整驗證。
- `spelling-confirmed/`：2首「救主」修字的使用者確認、計畫與完整驗證。
- `drive-source-search.json`：擴展來源搜尋與未能新增歌詞的具體結果。
- `parent-timestamp-changes.json`、`baseline-refreshes-observed.json`：最後觀察到的基準／時間戳變化，未覆蓋。

來源清單只附加最新獨立歌詞審核證據，沒有用舊快照覆寫NAS。舊批次進度數字保留為歷史；目前缺詞與烈火優先進度以本報告及summary為準。
