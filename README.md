# ChordMaster

ChordMaster 是一個面向敬拜團與流行音樂編排場景的 Web 編輯器，聚焦在和弦譜、節奏譜與簡譜的整合編輯。專案使用 Vite + React 建構，資料預設儲存在瀏覽器 `localStorage`，適合快速整理主歌、副歌、前奏與過門等常見段落。

目前版本：`0.5.0`

## 特色

- Song Library 側欄：建立、搜尋、複製、刪除歌譜
- 雙欄編輯體驗：左側編輯，右側即時預覽
- 中文預設介面：預設優先顯示中文，英文切換保留
- 簡譜工具列：支援高音 / 中音 / 低音、八分 / 十六分、附點、升降記號、連接線與時值切換
- 節奏與簡譜共用標籤：可當作節奏標籤、簡譜標籤，也可單獨顯示
- 小節編輯操作：支援複製、貼上、拖曳、拆分段落、合併到上一段與小節編號顯示
- 小節數顯示：可選擇不顯示、每行開頭顯示、每小節顯示
- 固定調顯示：可切換 `1=C` 絕對簡譜模式
- 段落轉調：可為某段設定轉調，後續段落會一起跟隨，預覽同步標示 `Key: X`
- 弱起拍：可加入 editor-only `0` 小節，支援簡譜與節奏輸入，並在預覽開頭顯示弱起內容
- 導覽記號：支援 Segno、Coda、D.S.、D.C.、Fine、D.S. al Fine、D.S. al Coda
- 預覽與 PDF 匯出：支援右側預覽縮放、拖曳、PDF 匯出與列印優化
- 舊資料相容：匯入或載入較早版本歌譜時會先自動整理資料格式

## 最近更新

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
- Tailwind CSS 4
- Motion
- jsPDF
- html-to-image

## 本機開發

### 需求

- Node.js 18+ 建議
- npm

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
- 匯出 PDF 前先確認版面

## 專案結構

```text
src/
  components/
    ChordSheet.tsx
    Jianpu.tsx
    RhythmNotation.tsx
    SongEditor.tsx
  constants/
    appMeta.ts
    i18n.ts
  utils/
    jianpuUtils.ts
    musicUtils.ts
    rhythmUtils.ts
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

目前專案預留 Google Sign-In 的 client id 設定：

```bash
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

可參考：

- [.env.example](./.env.example)

如果尚未使用 Google 登入，可以先不設定。

## 目前限制

- 歌曲資料預設只保存在本機瀏覽器
- Google 登入目前僅為前端整合，尚未串接雲端同步
- PDF 目前仍是圖片式輸出，不是向量文字 PDF
- 簡譜與節奏連接線仍會依不同版型持續微調

## Roadmap

- Google 帳號登入與雲端同步
- 更完整的簡譜 / 節奏排版邏輯
- 歌譜分享與多人協作
- 更完整的快捷鍵與編輯模式

## License

目前未指定開源授權；若要公開發佈，建議補上合適的 License。
