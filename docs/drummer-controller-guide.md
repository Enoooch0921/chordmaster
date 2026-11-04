# 鼓手控制器與鍵盤

查核日期：2026-10-31。依「主要接 iPad、有相對值無限旋鈕、TAP 和換歌好按」排序；按鍵手感排序是使用情境判斷，尚未實機試用。

| 機型 | 適合這個用途的理由 | 要留意 |
| --- | --- | --- |
| **Arturia BeatStep** | 16 個打擊墊、16 個可配置 encoder；對鼓手來說，分配四個較大的 pad 給 TAP、播放、上下首最直覺。官方列明 iPad 與免驅動 USB 支援。 | 先在電腦 MIDI Control Center 設為 Control 模式，旋鈕使用 Relative，儲存硬體 preset。使用一般 BeatStep 即可，無須為本功能購買 Pro 的多軌 sequencer。 |
| **Novation Launch Control 3** | 16 個無限 encoder、8 個自訂按鍵、USB-C；適合偏好旋鈕、螢幕與緊湊面積的人。 | 先用電腦 Components 更新韌體，設 Custom Mode 的 7-bit CC Relative；按鍵使用 Note 或 CC Momentary。按鍵較偏控制面板用途，TAP 的觸感仍建議現場試按。 |
| **Faderfox EC4** | 16 個可按壓無限 encoder，旋轉與按壓可分配不同指令；官方列明 iPad、Relative CC、免驅動 USB，並可直接在機器設定。 | TAP 可用旋鈕按壓，但若最在意連續敲 TAP，仍優先考慮打擊墊型。適合看重體積及可程式化設定的人。 |

硬體依據：[Arturia 官方規格](https://www.arturia.com/products/hybrid-synths/beatstep/overview)、[BeatStep 手冊](https://dl.arturia.net/products/beatstep/manual/BeatStep_Manual_1_0_1_EN.pdf)、[darktable 開發團隊的 BeatStep 實作／Relative 設定紀錄](https://docs.darktable.org/usermanual/4.0/en/special-topics/midi-device-support/#arturia-beatstep)、[Novation 官方規格](https://userguides.novationmusic.com/hc/en-gb/articles/30683940823442-Introduction-to-the-Launch-Control-3)、[Components 官方設定](https://support.novationmusic.com/hc/en-gb/articles/33076613541266-Launch-Control-3-Components-Guide)、[Faderfox EC4 官方規格](https://www.faderfox.de/ec4.html)。

## 建議設定

1. 硬體旋鈕選 **7-bit CC Relative**，不要選絕對值、14-bit 或 NRPN。初期每格 1 BPM，關閉或降低旋鈕加速；確認後再試 0.1 BPM。
2. 六顆按鍵分別給加速、減速、TAP、播放／停止、上一首、下一首；旋鈕另外保留調速。採 **Note 或 CC Momentary**，按下送非零，放開送零／Note Off，避免 Toggle 要按兩次才觸發一次。
3. 開鼓手模式左側 MIDI → 連接控制器 → 選擇裝置。
4. 點「設定速度旋鈕」，先向右慢轉數格，再向左慢轉數格；接著逐一學習按鍵。
5. 命名並儲存配置。設定面板開啟時，只學習，不會換歌或播放；關閉後才開始控制演奏。

此版支援四種常見相對 CC 編碼，依左右方向學習；不是每一種 MIDI 訊息都支援。還沒有 MIDI Clock 同步、Program Change 換歌、燈號或螢幕回傳。

## iPad 接法

USB-C iPad 可用支援資料的 USB 線／轉接 hub；演出時若同時接音效卡與充電，採可供電 hub 較方便。Lightning iPad 使用 Apple USB 相機轉接器，供電不足時需接外部電源。[Ableton 官方 iOS MIDI 接線說明](https://help.ableton.com/hc/en-us/articles/8093729641884-Note-MIDI-Input)

硬體支援 iPad 與網頁能讀到 MIDI 是兩件事：Safari iPad 沒有 Web MIDI；0.12.0 本次僅發布網頁版，不發布包含 CoreMIDI 橋接的 iPad App。網頁是否可用取決於瀏覽器是否支援 Web MIDI，尚未接實體控制器驗證。[Web MIDI 瀏覽器相容性](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/requestMIDIAccess#browser_compatibility)

## 先用電腦鍵盤

同一面板切換「電腦鍵盤」，不用購買 MIDI 裝置。可先學習：↑ 加速、↓ 減速、T TAP、Space 播放／停止、← 上一首、→ 下一首，再儲存自己的配置。長按速度鍵可連續調整；TAP、播放、上下首只觸發一次。輸入文字、組字及 Command/Ctrl/Alt 快捷鍵不會觸發這些操作。

## 實機驗證 TAP

- 先用鍵盤／觸控確認 70 → 120 BPM：第二下先取得新速度，再點四至八下觀察穩定度；不要用操作工具的回呼間隔代替實際點按間隔。
- 實機以 70、120、180 BPM 各點至少 20 組；加入持續播放、兩頁譜捲動與換歌場景，記錄顯示 BPM 和異常次數。
- 用同一錄音設備記錄實體敲擊聲與有線 click 輸出，量測穩定後的點按間隔、click 間隔及兩者時間差。先避開藍牙耳機，區分控制輸入、估速和音訊輸出的延遲。
- 拔除重接、切背景再回來、快速連按／按住播放及換歌鍵也要試。確認設定畫面不執行演奏動作，回來後不因殘留按鍵再多切一首。

自動測試已涵蓋事件時間、估速收斂、異常點按及模擬 MIDI 回呼延遲；這不能證明實際 iPad／USB／音效卡的端到端延遲。
