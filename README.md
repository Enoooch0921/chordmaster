# ChordMaster

ChordMaster 是一個面向敬拜團與流行音樂編排場景的 Web 編輯器，聚焦在和弦譜、節奏譜與簡譜的整合編輯。專案使用 Vite + React 建構；未登入時資料預設儲存在瀏覽器 `localStorage`，登入後可切換到 Supabase 雲端同步。

目前版本：`0.9.6`

## 特色

- Song Library 側欄：建立、搜尋、複製、刪除歌譜
- Service Setlist：以 Song Library 為來源建立服事歌單，並保留每次服事專屬的臨時設定
- 歌曲層級 Reference 參考音源：每首歌可保存樂團版本與歌手版本 YouTube 連結、原調與 BPM
- Reference mini player：看譜、歌單預覽與 Performance Mode 可直接開啟內嵌播放器，支援播放 / 暫停、前後跳秒與練習速度控制
- Reference 練習資訊：顯示 reference 調、目前譜面調、相差半音與練習 BPM，並提供 TAP tempo 手動抓 BPM
- 雙欄編輯體驗：左側編輯，右側即時預覽
- 中文預設介面：預設優先顯示中文，英文切換保留
- 全站統一 Key / Capo 選擇器：Song Library、Service Setlist 與預覽列共用同一套 popup picker
- 簡譜工具列：支援高音 / 中音 / 低音、八分 / 十六分、附點、升降記號、連接線與時值切換
- 節奏與簡譜共用標籤：可當作節奏標籤、簡譜標籤，也可單獨顯示
- 小節編輯操作：支援複製、貼上、拖曳、拆分段落、合併到上一段與小節編號顯示
- 小節數顯示：可選擇不顯示、每行開頭顯示、每小節顯示
- 固定調顯示：可切換 `1=C` 絕對簡譜模式
- 段落轉調：可為某段設定轉調，後續段落會一起跟隨，預覽同步標示 `Key: X`
- 弱起拍：可加入 editor-only `0` 小節，支援簡譜與節奏輸入，並在預覽開頭顯示弱起內容
- 導覽記號：支援 Segno、Coda、D.S.、D.C.、Fine、D.S. al Fine、D.S. al Coda
- 預覽、演出與 PDF 匯出：支援右側預覽縮放、拖曳、Performance Mode、PDF 匯出與列印優化
- 舊資料相容：匯入或載入較早版本歌譜時會先自動整理資料格式
- 帳號系統：支援 Google OAuth 與 Email Magic Link
- 雲端同步：登入後可同步個人歌曲庫與歌單
- 團隊曲庫：支援擁有者、曲庫管理員、歌單編輯者與檢視者四級權限
- 個人歌曲匯入團隊：保留原歌名，以來源 ID 處理覆蓋、同名副本與舊資料連結
- 團隊歌單協作：擁有者或歌單建立者可明確指派可編輯成員
- 公開唯讀分享：可產生歌曲 / 歌單分享連結，並支援受邀者加入 shared setlist

## 最近更新

- 升級到 `0.9.6`，重新校準節奏音符、重音、三連音與連接線的幾何定位，修正反覆房子橫線位置，並新增可切換 2 行／3 行手寫空間的小節高度設定（PDF 也會套用）
- 升級到 `0.9.5`，修正分享歌單／共享專案讀取時沒有優先使用歌單內歌曲副本，導致歌單中新增或刪除段落後別人看不到的問題
- 升級到 `0.9.4`，修正點擊已有節奏內容的灰色節奏 lane 時，節奏鍵盤沒有打開的問題
- 升級到 `0.9.3`，修正完成預覽輸入後重新點回節奏時，節奏鍵盤可能因 lower lane 目標沿用而無法打開的問題
- 升級到 `0.9.2`，強化預覽直接編輯：新增和弦、節奏與簡譜複製貼上，修正簡譜附點／跨拍容量／連接線判斷，並改善段落標題換行、和弦快捷鍵與放大預覽清晰度
- 升級到 `0.9.1`，重整 iPad 優先的歌單導覽，改善預覽縮放與手機編輯空間，並修正段落觸控拖曳、重複小節 ID 與連續升降記號輸入
- 升級到 `0.9.0`，新增預覽直接編輯、段落動作選單、多首歌曲分享連結，並支援登入後將分享歌曲導入個人歌庫
- 升級到 `0.8.4`，修正 Team Invite 錯誤提示、重複個人區與手機三連音顯示問題
- 升級到 `0.8.3`，修正 `Bb` 被顯示成 `A#`，並讓新增段落後先聚焦段落標題
- 升級到 `0.8.2`，修正 TAP tempo 穩定性、版本 / 翻譯欄位輸入與 Segno / Coda 顯示重疊問題
- 升級到 `0.8.1`，改善搜尋正規化，`你 / 祢` 與簡體 / 繁體可互相命中
- 升級到 `0.8.0`，新增歌曲層級 YouTube Reference 練習播放器
- 每首歌可保存兩個 reference：`樂團版本` 與 `歌手版本`，各自包含 YouTube URL、原調與 BPM
- 看譜、歌單預覽與 Performance Mode 都可開啟底部 mini player，不必離開譜面即可播放 reference
- 播放器新增樂團 / 歌手切換、播放 / 暫停、前後跳秒、BPM 式速度調整與原 BPM 回復
- 新增 reference key 對目前譜面 key 的半音差顯示，方便臨時轉調練習
- 新增 TAP tempo 按鈕，可跟著音樂點擊並套用 BPM
- 改善 Reference metadata UI、窄螢幕排版與 YouTube / Transpose 插件提示文案
- 升級到 `0.7.0`，補齊 Supabase 登入 / 同步、分享連結、shared setlist 加入與成員管理的 release note
- 新增 Google OAuth、Email Magic Link、個人歌曲庫與歌單雲端同步基礎
- 新增歌曲 / 歌單公開唯讀分享連結，包含 Edge Functions、SPA fallback、剪貼簿 fallback 與登入後開啟受邀歌單流程
- 新增 shared setlist 管理能力，支援個人 `Key / Capo / display` 覆蓋、離開 shared setlist，以及完整共享歌單歌曲細節
- 新增 Performance Mode 入口與行動版操作，並改善 performance pagination、page clipping、viewport height 與切歌穩定性
- 重整 PDF 匯出流程，加入取消按鈕、single-canvas render、行動裝置 adaptive pixel ratio 與 JPEG 輸出
- 改善行動版 editor、側邊欄、picker overlay、歌詞模式、歌詞分頁密度與譜面小節編號位置
- 新增 Service Setlist 工作流，可在同一首歌的基礎上建立服事歌單專屬的 `Key / Capo / section order / song order` 覆蓋設定
- 新增 setlist 層級的顯示模式與歌詞控制，支援 `級數譜 / 和弦 + 固定調 / 和弦 + 首調`，PDF 匯出會一併套用
- 新增 setlist song instance 編輯流程：右側編輯與預覽會讀取 base song 後再套用 setlist overrides，不會改動 Song Library 原始資料
- 重做一般歌曲與服事歌單的編輯資訊帶，整理成更緊湊的 `Title / Key / Capo / Tempo / Time / Display` 工具列
- 全站統一 KeyPicker 與 CapoPicker，避免不同區塊混用下拉、左右切換或不同 popup 版本
- 新增 setlist 側邊欄的加入歌曲流程，可直接搜尋 Song Library 並將歌曲加入目前歌單
- 新增段落轉調功能，支援後續段落 cascade 升降 key、預覽 key 標示，以及 editor 和弦自動跟隨
- 新增弱起拍 `0` 小節流程，editor 可獨立編輯，預覽會在第一小節前顯示弱起簡譜 / 節奏
- 改善段落拖曳 / 複製後的 key 繼承規則，搬到升調區的段落會自動改寫為目的地 key
- 微調簡譜升降記號在 preview / editor 的距離，提高清楚度與輸入手感
- 新增固定調 `1=C` 顯示模式與頁首標示
- 新增預覽縮放 / 拖曳與更一致的 fit-width / fit-height 行為
- 新增更多導覽記號與文字標示，支援 `D.S.`、`D.C.`、`Fine`、`D.S. al Fine`、`D.S. al Coda`
- 新增和弦 `Fermata` 無限延音記號按鈕
- 重做段落顏色分類，讓 `Turnaround`、`Refrain`、`Breakdown` 等段落分開顯示
- 修正大量簡譜編輯、連接線與舊歌相容性問題
- 改善 PDF 匯出與列印品質

完整變更請看 [CHANGELOG.md](./CHANGELOG.md)。

## 技術棧

- React 19
- TypeScript
- Vite
- Supabase Auth / Postgres / Edge Functions
- Tailwind CSS 4
- Motion
- jsPDF
- html-to-image

## 本機開發

### 需求

- Node.js 18+ 建議
- npm
- Supabase CLI（部署 migration / functions 時需要）

### 安裝

```bash
npm install
```

### 啟動開發環境

```bash
npm run dev
```

預設網址：

- [http://localhost:3000](http://localhost:3000)

### 建置正式版本

```bash
npm run build
```

建置輸出目錄：

- `dist/`

### iPadOS App

專案使用 Capacitor 共用同一套 React/Vite 核心，iPadOS 版本會把 `dist/` 包進 `ios/` Xcode 專案。

```bash
npm run ipad:sync
npm run ipad:open
```

- `npm run build:ipad`：使用 Capacitor 專用路徑建置 web assets
- `npm run ipad:sync`：建置並同步到 `ios/App/App/public`
- `npm run ipad:open`：用 Xcode 開啟 iPadOS 專案

目前 Xcode target 已設定為 iPad device family。若要在模擬器或實機執行，需要本機安裝完整 Xcode，並在 Xcode 中設定 signing team。

## 使用說明

### Song Library

- 建立新歌
- 搜尋歌曲
- 複製現有歌譜
- 管理與刪除歌曲

### Service Setlist

- 建立多個服事歌單，並自訂名稱
- 從 Song Library 搜尋歌曲並加入目前歌單
- 同一首歌可重複加入同一份歌單
- 每個 SetlistSong 可獨立覆蓋 `Key`、`Capo`、`section order`
- 整份 setlist 可統一控制 `顯示設定`、`顯示歌詞`，且不影響 Song Library 原始資料

### Reference 參考音源

- 在歌曲 metadata 的 `參考音源` 區塊設定 `樂團版本` 與 `歌手版本`
- 每個 reference 可填入 YouTube URL、reference 原調與 BPM
- 支援常見 YouTube URL 格式，包括 `watch?v=...`、`youtu.be/...`、`embed/...`、`shorts/...`
- 可用 `TAP` 按鈕跟著音樂點擊，自動估算並套用目前 reference BPM
- 在歌曲模式、歌單預覽與 Performance Mode 可開啟同一首歌的 reference mini player
- mini player 會顯示 reference key、目前譜面 key、相差半音與練習 BPM
- 速度控制以樂手習慣的 BPM 增減呈現，支援 `-10 / -5 / -1 / 原 BPM / +1 / +5 / +10`
- 需要 YouTube 音高升降時，可用 `在 YouTube 開啟` 搭配瀏覽器工具列中的 Transpose 插件；ChordMaster v0.8.0 不直接改變 YouTube 音訊音高

### 編輯區

- 編輯和弦、段落與小節
- 使用段落建議快速套用 `Verse`、`Pre-Chorus`、`Chorus`、`Turnaround`、`Breakdown` 等名稱
- 可在段落上設定 section key change，並讓後續段落一起承接新的 key
- 為節奏與簡譜輸入共用標籤
- 輸入簡譜、節奏譜與和弦內容
- 使用快捷鍵加快八度、時值、附點與升降記號編輯
- 從中間任一小節拆出新段落，或把整段併到上一段
- 於和弦與小節上加入導覽記號、Fermata、反覆記號、房子記號與 annotation

### 預覽區

- 即時查看和弦、節奏與簡譜排版
- 顯示段落標題、標籤、備註、導覽記號、小節數與轉調 `Key: X` 標示
- 支援右側預覽獨立縮放、拖曳與點擊小節回跳左側編輯器
- 可切換相對簡譜與固定調 `1=C` 絕對簡譜顯示
- 在 Service Setlist 模式下，預覽會套用當前 `SetlistSong` 覆蓋值與整份歌單的顯示設定
- 匯出 PDF 前先確認版面

## 專案結構

```text
src/
  components/
    CapoPicker.tsx
    ChordSheet.tsx
    Jianpu.tsx
    KeyPicker.tsx
    LyricsEditor.tsx
    ReferencePlayer.tsx
    SetlistEditor.tsx
    SongMetadataPanel.tsx
    RhythmNotation.tsx
    SongEditor.tsx
  constants/
    appMeta.ts
    chordFonts.ts
    i18n.ts
  utils/
    jianpuUtils.ts
    lyricsUtils.ts
    musicUtils.ts
    referenceUtils.ts
    rhythmUtils.ts
    setlistUtils.ts
  App.tsx
  main.tsx
public/
  fonts/
  logo.svg
```

## 部署

### GitHub

這個專案可直接推到 GitHub 作為原始碼倉庫。

### Cloudflare Pages

建議設定：

- Build command: `npm run build`
- Output directory: `dist`

## 環境變數

目前專案前端需要：

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_PUBLIC_APP_URL=https://your-domain.example/chordmaster/
```

`VITE_PUBLIC_APP_URL` 是公開 app 網址，用來產生可分享的 `/share/:token` 連結。若沒有設定，本機開發會產生 `localhost` 分享網址，只能在同一台電腦上開啟。

可參考：

- [.env.example](./.env.example)
- [docs/supabase-setup.md](./docs/supabase-setup.md)

如果尚未設定 Supabase，app 仍可使用本地模式。

## Supabase 設定

第一次接通雲端功能時，請依序完成：

1. 建立 Supabase project
2. 設定 Google OAuth 與 Email Magic Link
3. 設定 `.env`
4. 執行 migration
5. 部署 Edge Functions

完整步驟請看：

- [docs/supabase-setup.md](./docs/supabase-setup.md)

## 目前限制

- 未登入模式下，歌曲資料仍只保存在本機瀏覽器
- Apple Sign-In 尚未實作
- 團隊即時協作會自動載入已儲存的歌曲變更；不合併多人同時編輯的未儲存內容
- PDF 目前仍是圖片式輸出，不是向量文字 PDF
- Reference v1 只支援 YouTube，不支援 Spotify、Apple Music、mp3 上傳或自動音訊分析
- 內嵌 YouTube 播放器可調整播放速度，但不直接升降音高；若要改變 YouTube 音訊 key，需在 YouTube 頁面搭配瀏覽器插件
- 簡譜與節奏連接線仍會依不同版型持續微調

## Roadmap

- Apple Sign-In
- 團隊歌單的更細粒度權限與審核記錄
- ChordMaster companion 瀏覽器插件，用於更深度整合 YouTube 轉調、循環與練習控制
- 更完整的簡譜 / 節奏排版邏輯
- 更完整的分享控制與協作
- 更完整的快捷鍵與編輯模式

## License

目前未指定開源授權；若要公開發佈，建議補上合適的 License。
