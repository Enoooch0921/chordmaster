# ChordMaster

ChordMaster 是一個面向敬拜團與流行音樂編排場景的 Web 編輯器，專注在：

- 和弦譜編輯
- 節奏譜輸入
- 簡譜（Jianpu）輸入與預覽
- 即時預覽與 PDF 匯出

目前專案以前端為主，使用 Vite + React 建構，資料預設儲存在瀏覽器 `localStorage`。

## 特色

- Song Library 側欄：建立、搜尋、複製、刪除歌譜
- 雙欄編輯體驗：左側編輯，右側所見即所得預覽
- 簡譜輸入工具列：支援高低音、八分/十六分、附點、連接線
- 節奏與簡譜預覽：可直接檢視排版效果
- PDF 匯出：將預覽畫面輸出成可列印檔案
- 本地儲存：歌曲資料可直接保存在目前瀏覽器

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

預設會啟動在：

- [http://localhost:3000](http://localhost:3000)

### 建置正式版本

```bash
npm run build
```

建置結果會輸出到：

- `dist/`

## 專案結構

```text
src/
  components/
    ChordSheet.tsx
    Jianpu.tsx
    RhythmNotation.tsx
    SongEditor.tsx
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

這個專案可以直接推到 GitHub 作為原始碼倉庫。

### Cloudflare Pages

這個專案適合部署到 Cloudflare Pages：

- Build command: `npm run build`
- Output directory: `dist`

## 環境變數

目前專案預留了 Google Sign-In 的 client id 設定：

```bash
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

可參考：

- [.env.example](./.env.example)

如果尚未使用 Google 登入，可以先不設定。

## 使用說明

### Song Library

- 建立新歌
- 搜尋歌曲
- 複製現有歌譜
- 管理與刪除歌曲

### 編輯區

- 編輯和弦
- 編輯 section / bar
- 輸入節奏譜與簡譜
- 使用快捷鍵提升輸入速度

### 預覽區

- 即時查看編輯結果
- 依歌曲結構顯示 section 與 bar
- 匯出 PDF 前可先確認版面

## 目前限制

- 歌曲資料預設只保存在本機瀏覽器
- Google 登入目前僅為前端整合，尚未串接雲端同步
- 簡譜跨小節連接線仍持續微調中

## Roadmap

- Google 帳號登入與雲端同步
- 更完整的簡譜連接線與排版邏輯
- 歌譜分享與多人協作
- 更完整的快捷鍵與編輯模式

## License

目前未指定開源授權；若要公開發佈，建議補上合適的 License。
