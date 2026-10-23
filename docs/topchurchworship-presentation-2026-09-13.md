# TopChurchWorship 版本署名與段名整理

已逐首更新既有團隊歌曲；這次是署名與版面資料整理，不是新的樂譜轉錄完成批次。

- 已回讀確認 163 首；補入 88 筆版本、32 筆有來源的翻譯署名。沒有來源的翻譯欄保持空白。
- 精簡 526 個段名，移除 54 個重複聲部標籤。EG 等標籤僅於同段起點或聲部切換時保留；新段落可再標。
- 原段名中的調性、配位待校、房子及演奏提示移到首小節註記，或既有聲部欄；數字共用段如 Verse 1／2 保留，不把它截成 Verse 1。
- 完整舊 JSON 備份及精確條件保護；所有和絃、拍位、旋律、連線、反覆、調性及歌詞正文均未改動。其他 463 筆團隊資料與另外 11 個歌曲庫校驗不變。
- 以 PDF 技能視讀 95 筆已配對原詞頁首署名；只使用明確出處／翻譯欄，不把中文譯文推定為某團隊翻譯。專輯完整署名留在來源紀錄，版本簡化為例如讚美之泉。Supabase 限流時先回讀確認尚未寫入，再降低速率接續；沒有盲目重試寫入。
- 已將段名與聲部規則納入後續轉錄工具。未修改 App、提交或部署；先前雙語逐句排版程式仍是本機修改，與本次已生效的雲端資料更新不同。
- 驗證：5項整理規則測試、603項應用程式測試、4項真實歌曲DOM顯示測試及625份來源格式檢查通過。顯示檢查涵蓋Gratitude版本與翻譯、一生火熱八格前奏僅一個EG、無譯者欄保持空白、This Is Living精簡段名仍保留原配位註記。

## 署名待確認

| 歌曲 | 原稿署名 | 暫不填版本的原因 |
|---|---|---|
| [主我獻上生命給祢（I Offer My Life／飛鷹詩歌集）（待校對）](https://drive.google.com/file/d/1uWYIHDlh78g6_WvI4UytAQfWY1QHVw1v/view) | 約書亞樂團─祂的國度祂的榮耀 | 詞版約書亞與飛鷹樂譜版本待核 |
| [10,000 Armies（待校對）](https://drive.google.com/file/d/1me9B-BA_WR4SThtEN85Dbv7Cz3KSspEZ/view) | Influnce Music | 原拼字Influnce疑似錯字 |
| [恩典之流（約書亞樂團）（待校對）](https://drive.google.com/file/d/1WrDzezik5GTfMttQTGrJdXqASBZODhQO/view) | 大衛帳幕的榮耀─為著你的榮耀 | 詞版大衛帳幕與樂譜約書亞標示待核 |
| [Go（手寫版・部分轉錄）（待校對）](https://drive.google.com/file/d/1UqDj9E7Oxa050fm3rEyukm7fAymj7ntz/view) | Hillson | 原拼字Hillson疑似錯字 |
| [Every Giant Will Fall（Rend Collective・部分轉錄）（待校對）](https://drive.google.com/file/d/1ehqIa2vic9oLNKH-ee1bZSN2p-4pe1By/view) | 約書亞樂團 | 詞版約書亞與樂譜Rend Collective不同 |
| [我要歌頌祢聖名（Terry MacAlmon・部分轉錄）（待校對）](https://drive.google.com/file/d/1vKVs5brlRP69H5iFF4vxpckkRNpg7rtF/view) | 和撒拿新歌 | 和撒拿新歌是歌本出處，不能當Terry MacAlmon編曲版本 |
| [你是榮耀的君王（待校對）](https://drive.google.com/file/d/1MrnHXBdLblfhttwVDY8-Riq1sG-UlzBu/view) | 新靈糧126 | 新靈糧126是歌本編號，版本待核 |

## 本次變更清單

| 歌曲 | 版本 | 翻譯 | 精簡段名 | 重複標籤 |
|---|---|---|---:|---:|
| Build It Up（待校對） | — | — | 4 | 0 |
| 祢盼望掌權（Your Hope Reigns）（待校對） | 約書亞樂團 | — | 0 | 0 |
| Happy Day（Tim Hughes）（待校對） | Tim Hughes | — | 0 | 0 |
| 越久越甘甜（It Gets Sweeter）（待校對） | — | — | 1 | 0 |
| 我願是無名的傳道者（待校對） | 新店行道會團隊 | — | 0 | 0 |
| That's The Power（Hillsong Worship）（待校對） | — | — | 2 | 0 |
| 我有喜樂（手寫編曲）（待校對） | 讚美之泉 | — | 1 | 0 |
| 成為祢的器皿（The Hope Music／部分轉錄）（待校對） | — | — | 6 | 0 |
| Joy Of The Lord（Planetshakers）（待校對） | — | — | 4 | 0 |
| Joy Of The World（原檔名／歌名待確認）（待校對） | — | — | 4 | 0 |
| The First Noel（Damascus Worship）（待校對） | — | — | 5 | 0 |
| Silent Night＋奪不去（Maverick＋KVA）（待校對） | — | — | 7 | 0 |
| 平安平安（Top Church Music 手寫版）（待校對） | 新店行道會 | — | 0 | 0 |
| O Come All Ye Faithful（Passion）（待校對） | — | — | 2 | 0 |
| 平安平安（Official Lead Sheet）（待校對） | 新店行道會 | — | 0 | 0 |
| 歡欣歡欣（Official Lead Sheet）（待校對） | 新店行道會 | — | 1 | 0 |
| I Know That I Know（The Belonging Co.）（待校對） | — | — | 0 | 3 |
| Till The Walls Come Down（待校對） | — | — | 6 | 0 |
| 祢是我力量（旌旗）（待校對） | — | — | 2 | 0 |
| 最後戰鬥－無名的傳道者 IV（Last Battle）（待校對） | 新店行道會 | — | 4 | 0 |
| Take The Name Of Jesus（待校對） | — | — | 5 | 0 |
| 我相信（E → F#）（待校對） | 生命河靈糧堂 | — | 1 | 0 |
| New Thing Coming（Elevation Worship）（待校對） | Elevation Worship | 新店行道會 | 1 | 1 |
| 我很醜可是我很溫柔（C → Db）（待校對） | — | — | 2 | 0 |
| 敬拜主＋Great Things（合併編曲）（待校對） | — | — | 3 | 0 |
| 耶穌祢醫治（讚美之泉）（待校對） | 讚美之泉 | — | 0 | 0 |
| 大聲敬拜（讚美之泉）（待校對） | — | — | 2 | 0 |
| 讓我（新店行道會）（待校對） | 新店行道會 | — | 0 | 0 |
| 不停湧出來（Feast Family）（待校對） | — | — | 5 | 0 |
| You Have Made Me Glad（待校對） | Charity Gayle | 新店行道會 | 2 | 0 |
| 10,000 Armies（待校對） | — | 新店行道會 | 0 | 0 |
| 呼召我的主（待校對） | — | — | 2 | 0 |
| 勝過這世界（More Than Conqueror／約書亞）・部分轉錄（待校對） | — | — | 2 | 0 |
| 我在這裡（待校對） | 讚美之泉 | — | 0 | 0 |
| Break Every Chain | — | — | 1 | 0 |
| Keep It Burning（部分轉錄）（待校對） | — | — | 1 | 0 |
| 所有全奉獻（I Surrender All）（待校對） | — | — | 2 | 0 |
| 我心所求（My Heart Longs For／約書亞）（待校對） | 約書亞樂團 | — | 3 | 0 |
| 我能給你什麼（讚美之泉／雙頁原譜・部分轉錄）（待校對） | — | — | 1 | 0 |
| I Have Decided To Follow Jesus（Brandon Lake＋Bethel Music）（待校對） | — | — | 4 | 0 |
| 我寧願有耶穌＋十字架（待校對） | — | — | 3 | 0 |
| Goodbye Yesterday（部分轉錄）（待校對） | — | — | 9 | 0 |
| Monument（部分轉錄）（待校對） | — | — | 2 | 0 |
| Take You At Your Word・部分轉錄（待校對） | — | — | 7 | 0 |
| 真神之愛 The Love Of God・部分轉錄（待校對） | — | — | 1 | 0 |
| Go Tell It On The Mountain（Calvary Orlando）・部分轉錄（待校對） | — | — | 3 | 0 |
| Angels We Have Heard On High（Saddleback）・部分轉錄（待校對） | — | — | 3 | 0 |
| Hark The Herald Angels Sing（Lincoln Brewster）・部分轉錄（待校對） | — | — | 6 | 0 |
| High King Of Heaven・部分轉錄（待校對） | — | — | 5 | 0 |
| Been So Good／Goodness of God（EG＋Vocal version）・部分轉錄（待校對） | — | — | 4 | 0 |
| Relentless・部分轉錄（待校對） | — | — | 2 | 0 |
| World Outside Your Window・部分轉錄（待校對） | — | — | 3 | 0 |
| Joy（What The World Calls Foolish）・部分轉錄（待校對） | Martin Smith | 新店行道會 | 5 | 0 |
| Great Are You Lord | All Sons and Daughters | 新店行道會 | 0 | 0 |
| Free!（Am／簡譜 1=C）・部分轉錄（待校對） | SEU Worship | 新店行道會 | 3 | 0 |
| 這是天父世界（待校對） | — | — | 1 | 0 |
| Alive（Chien ver／部分轉錄）（待校對） | — | — | 5 | 0 |
| 我們獻上（待校對） | 約書亞樂團 | — | 3 | 0 |
| Same God（待校對） | Elevation Worship | 新店行道會 | 1 | 0 |
| 不動搖的信心（讚美之泉）（待校對） | 讚美之泉 | — | 1 | 0 |
| 我的救贖者活著（待校對） | 讚美之泉 | — | 1 | 0 |
| Praise Like No End（部分轉錄）（待校對） | 新店行道會 | — | 8 | 0 |
| Praises（ELEVATION RHYTHM／部分轉錄）（待校對） | ELEVATION RHYTHM | 新店行道會 | 3 | 0 |
| Rest On Us（待校對） | UPPERROOM | 新店行道會 | 1 | 0 |
| 我唯一渴望（My Only Hope）（待校對） | — | — | 1 | 0 |
| 主123（部分轉錄）（待校對） | — | — | 2 | 0 |
| 大山你算什麼（Official Lead Sheet／部分轉錄）（待校對） | 新店行道會 | — | 0 | 0 |
| I've Witnessed It（部分轉錄）（待校對） | — | — | 12 | 0 |
| 祢的愛（讚美之泉／C 調 Band）（部分轉錄）（待校對） | 讚美之泉 | — | 3 | 0 |
| This Is the Day（Lakewood Music）（部分轉錄）（待校對） | Lakewood Music | 新店行道會 | 4 | 0 |
| The Joy（The Belonging Co）（部分轉錄）（待校對） | The Belonging Co | 新店行道會 | 8 | 0 |
| 十字架（讚美之泉／近主十架歌組曲／來源1）（待校對） | — | — | 4 | 0 |
| 十字架（讚美之泉／近主十架歌組曲／來源2）（待校對） | — | — | 4 | 0 |
| Nothing Is Impossible（Manila／部分轉錄）（待校對） | — | — | 1 | 0 |
| 大山你算什麼（手寫／75 BPM）（部分轉錄）（待校對） | 新店行道會 | — | 2 | 0 |
| King Of Kings（D／68 BPM）（待校對） | Hillsong | — | 5 | 0 |
| 萬福恩源（Gateway）（部分轉錄）（待校對） | — | — | 6 | 0 |
| 與天歡慶（部分轉錄）（待校對） | 新店行道會 | — | 3 | 0 |
| Go Tell It（部分轉錄）（待校對） | — | — | 6 | 0 |
| 和平君王（Prince of Peace）（部分轉錄）（待校對） | 新店行道會 | — | 2 | 0 |
| Look Around（部分轉錄）（待校對） | Housefires | 新店行道會 | 1 | 0 |
| Tell the Story（Psalm 8）（部分轉錄）（待校對） | — | — | 4 | 0 |
| Pour My Love on You（部分轉錄）（待校對） | Upperroom | — | 2 | 0 |
| 詩篇 30（Psalm 30）（待校對） | — | — | 1 | 0 |
| O Holy Night（Peace Project）（部分轉錄）（待校對） | — | — | 6 | 0 |
| Jehovah（部分轉錄）（待校對） | Elevation Worship | 新店行道會 | 3 | 6 |
| 在祢沒有難成的事（部分轉錄）（待校對） | Franky Kuncoro | — | 1 | 3 |
| S.O.S（官方版）（待校對） | 新店行道會 | — | 2 | 0 |
| Holy Fire（官方版・部分轉錄）（待校對） | 新店行道會 | — | 2 | 0 |
| 奪回（Recapture・官方版・部分轉錄）（待校對） | 新店行道會 | — | 1 | 0 |
| S.O.S（官方版・來源2）（待校對） | — | — | 2 | 0 |
| 奪回（Recapture・官方版・來源2・部分轉錄）（待校對） | — | — | 1 | 0 |
| Praise Him, Praise Him（Tommy Walker・部分轉錄）（待校對） | Tommy Walker | 新店行道會 | 11 | 0 |
| Echoes (Till We See the Other Side)（部分轉錄）（待校對） | Hillsong | 新店行道會 | 1 | 0 |
| 我的生命獻給祢（讚美之泉）（部分轉錄）（待校對） | 讚美之泉 | — | 0 | 0 |
| Praise（Elevation Worship）（部分轉錄）（待校對） | — | — | 1 | 0 |
| Holy Forever（手寫 Db 調）（部分轉錄）（待校對） | Bethel Music | — | 0 | 0 |
| God Of My Forever（手寫D調）（部分轉錄）（待校對） | 城市豐收教會 | — | 0 | 0 |
| 奪回（手寫G調・部分轉錄）（待校對） | 新店行道會 | — | 0 | 14 |
| S.O.S（手寫A調・部分轉錄）（待校對） | 新店行道會 | — | 6 | 0 |
| 榮耀的呼召（待校對） | 讚美之泉 | — | 0 | 0 |
| 點燃（手寫F調・部分轉錄）（待校對） | 新店行道會 | — | 0 | 0 |
| What A Beautiful Name（手寫D調・部分轉錄）（待校對） | Hillsong | — | 0 | 0 |
| A Thousand Hallelujahs（手寫版・部分轉錄）（待校對） | Brooke Ligertwood | 新店行道會 | 3 | 0 |
| Mali Mali ti yisusama（原Am・部分轉錄）（待校對） | — | — | 2 | 0 |
| 懇求聖靈降臨（以斯拉正式譜）（待校對） | 以斯拉 | — | 4 | 0 |
| One Name（HOGC手寫版・部分轉錄）（待校對） | HOGC | 新店行道會 | 2 | 0 |
| 禱告的百姓（正式譜・部分轉錄）（待校對） | 新店行道會 | — | 0 | 0 |
| A Burning Heart（正式12/8版・部分轉錄）（待校對） | 新店行道會 | — | 1 | 0 |
| 點燃（官方版・部分轉錄）（待校對） | 新店行道會 | — | 1 | 0 |
| 全能上帝是我的主我的神（以斯拉・手註版・部分轉錄）（待校對） | 以斯拉 | — | 2 | 0 |
| Alive（Gospel Version・部分轉錄）（待校對） | — | — | 3 | 0 |
| 坐在寶座上聖潔羔羊（Timothy Ko・手註版・部分轉錄）（待校對） | — | — | 3 | 0 |
| 聖靈我們真歡迎祢（Chris A. Bowater・詩歌版）（待校對） | — | — | 3 | 0 |
| 紅海前（火把音樂・Re-arrange・部分轉錄）（待校對） | — | — | 4 | 0 |
| A Burning Heart（手寫Triplet版・部分轉錄）（待校對） | 新店行道會 | — | 4 | 0 |
| 風和愛（天韻）（待校對） | 天韻 | — | 3 | 0 |
| Joy（Planetshakers・手寫版・部分轉錄）（待校對） | Planetshakers | 新店行道會 | 7 | 0 |
| 我的避難所耶穌（敬拜讚美・部分轉錄）（待校對） | — | — | 2 | 0 |
| I Speak Jesus（Charity Gayle・手寫版・部分轉錄）（待校對） | Charity Gayle | 新店行道會 | 3 | 0 |
| Go（手寫版・部分轉錄）（待校對） | — | 新店行道會 | 7 | 0 |
| 你眼目必看顧這地（待校對） | — | — | 4 | 0 |
| 跟隨祢心意（The Hope・手寫版・部分轉錄）（待校對） | The Hope 樂團 | — | 4 | 0 |
| 耶穌的寶血（韓國詩歌・手註和聲版）（待校對） | — | — | 2 | 0 |
| My story with my saviour's love（G–F–G手寫版・部分轉錄）（待校對） | — | — | 6 | 0 |
| Reign Above It All（手寫版・部分轉錄）（待校對） | Bethel Music | 新店行道會 | 12 | 0 |
| Our God（Easter Version）（待校對） | — | — | 5 | 0 |
| All Hail King Jesus（手寫版・部分轉錄）（待校對） | Bethel Music | 新店行道會 | 10 | 6 |
| I Give You My Hallelujah（手寫版・部分轉錄）（待校對） | — | — | 7 | 1 |
| Hosanna (Praise Is Rising)（手寫版・部分轉錄）（待校對） | Paul Baloche | 新店行道會 | 7 | 0 |
| 聖靈我們真歡迎你（烈火版・部分轉錄）（待校對） | — | — | 6 | 0 |
| Every Giant Will Fall（Rend Collective・部分轉錄）（待校對） | — | — | 16 | 0 |
| Walk On Water（ELEVATION RHYTHM・部分轉錄）（待校對） | ELEVATION RHYTHM | 新店行道會 | 23 | 0 |
| 來到主前（Coming before The Lord・部分轉錄）（待校對） | — | — | 4 | 0 |
| 祂是你的幫助（約書亞・部分轉錄）（待校對） | 約書亞樂團 | — | 3 | 0 |
| 在你沒有難成的事（讚美之泉・部分轉錄）（待校對） | — | — | 4 | 3 |
| Angels We Have Heard On High（手寫G調版）（待校對） | — | — | 8 | 7 |
| 我要歌頌祢聖名（Terry MacAlmon・部分轉錄）（待校對） | — | — | 4 | 0 |
| 我要一心稱謝祢（讚美之泉・部分轉錄）（待校對） | 讚美之泉 | — | 4 | 0 |
| Great Is Thy Faithfulness（Worship Circle・C調版）（待校對） | — | — | 1 | 0 |
| Freedom All Around（手寫C調版）（待校對） | SEU Worship | 新店行道會 | 2 | 0 |
| 不動搖的信心（讚美之泉・簡譜來源2・部分轉錄）（待校對） | 讚美之泉 | — | 8 | 0 |
| Great Things（手寫B調版・部分轉錄）（待校對） | Phil Wickham | 新店行道會 | 3 | 0 |
| Gratitude（Live version・手寫B調版）・部分轉錄（待校對） | Bethel Music | 新店行道會 | 14 | 0 |
| Believe For It（手寫G調版）・部分轉錄（待校對） | CeCe Winans | 新店行道會 | 9 | 0 |
| Send Me（手寫Ab調版）・部分轉錄（待校對） | Bethel Music | 新店行道會 | 5 | 0 |
| Here In Your House（手寫C調版）・部分轉錄（待校對） | Gateway Music | — | 3 | 0 |
| 在你沒有難成的事（讚美之泉・來源3・部分轉錄）（待校對） | — | — | 4 | 3 |
| A Heart After You（一生跟隨祢・手寫E／F兩版）・部分轉錄（待校對） | — | — | 6 | 0 |
| 一生火熱（手寫A調版）・部分轉錄（待校對） | 台北復興堂 | — | 1 | 7 |
| 改變我 | 台北復興堂 | — | 0 | 0 |
| Surrounded・部分轉錄（待校對） | Michael W. Smith | 新店行道會 | 0 | 0 |
| Mention of Your Name（Bethel Ver.）（待校對） | Bethel Music | 約書亞樂團 | 0 | 0 |
| 主祢是我唯一所愛・部分轉錄（待校對） | 復興堂 | — | 0 | 0 |
| 主掌權 The Lord Reigns・部分轉錄（待校對） | 約書亞樂團 | — | 7 | 0 |
| Pure As Gold・部分轉錄（待校對） | CHC | — | 0 | 0 |
| This Is Living・部分轉錄（待校對） | Hillsong | — | 4 | 0 |
| God I Look To You | Bethel Music | 新店行道會 | 0 | 0 |
| 因祂活著（手寫 G 調和絃）（待校對） | — | — | 1 | 0 |
| 喜樂泉源（讚美之泉）（待校對） | 讚美之泉 | — | 0 | 0 |
| 不停湧出來（待校對） | 以斯拉 | — | 1 | 0 |
| Only Jesus | Bethel Music | — | 0 | 0 |
| Fearless Fire（待校對） | 新店行道會 | — | 0 | 0 |

破折號代表本次未變更該欄，不表示此歌曲一定沒有署名。其他來源的署名仍隨轉錄逐首核對，不宣稱所有原稿欄位均已核完。
