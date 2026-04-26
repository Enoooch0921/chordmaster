# ChordMaster

ChordMaster 是一個面向敬拜團與流行音樂編排場景的 Web 編輯器，聚焦在和弦譜、節奏譜與簡譜的整合編輯。專案使用 Vite + React 建構；未登入時資料預設儲存在瀏覽器 `localStorage`，登入後可切換到 Supabase 雲端同步。

目前版本：`0.7.0`

## 特色

- Song Library 側欄：建立、搜尋、複製、刪除歌譜
- Service Setlist：以 Song Library 為來源建立服事歌單，並保留每次服事專屬的臨時設定
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
- 公開唯讀分享：可產生歌曲 / 歌單分享連結，並支援受邀者加入 shared setlist

## 最近更新

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
- 團隊共享庫與多人協作尚未實作
- PDF 目前仍是圖片式輸出，不是向量文字 PDF
- 簡譜與節奏連接線仍會依不同版型持續微調

## Roadmap

- Apple Sign-In
- 團隊共享庫與協作權限
- 更完整的簡譜 / 節奏排版邏輯
- 更完整的分享控制與協作
- 更完整的快捷鍵與編輯模式

## License

目前未指定開源授權；若要公開發佈，建議補上合適的 License。
