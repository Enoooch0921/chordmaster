# ChordMaster

ChordMaster 是一個面向敬拜團與流行音樂編排場景的 Web 編輯器，聚焦在和弦譜、節奏譜與簡譜的整合編輯。專案使用 Vite + React 建構，資料預設儲存在瀏覽器 `localStorage`，適合快速整理主歌、副歌、前奏與過門等常見段落。

目前版本：`0.3.0`

## 特色

- Song Library 側欄：建立、搜尋、複製、刪除歌譜
- 雙欄編輯體驗：左側編輯，右側即時預覽
- 中文預設介面：預設優先顯示中文，英文切換保留
- 簡譜工具列：支援高音 / 中音 / 低音、八分 / 十六分、附點、升降記號與連接線
- 節奏與簡譜共用標籤：可當作節奏標籤、簡譜標籤，也可單獨顯示
- 小節編輯操作：支援複製、貼上、拖曳、拆分段落與小節編號顯示
- 小節數顯示：可選擇不顯示、每行開頭顯示、每小節顯示
- 預覽與 PDF 匯出：輸出前可先確認排版效果

## 最近更新

- 新增簡譜 `複製 / 貼上` 按鈕與快捷鍵
- 簡譜支援 `#` 與 `b` 升降記號輸入
- 改善附點、八分音符切換與簡譜排版邏輯
- 調整簡譜與節奏連接線對齊方式
- 新增從中間小節拆出新段落的功能
- 新增共用 bar label 與預覽中的前置佔位顯示
- 新增預覽與編輯器中的小節數顯示

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
- 為節奏與簡譜輸入共用標籤
- 輸入簡譜、節奏譜與和弦內容
- 使用快捷鍵加快八度、時值與附點編輯
- 從中間任一小節拆出新段落

### 預覽區

- 即時查看和弦、節奏與簡譜排版
- 顯示段落標題、標籤與小節數
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
- 簡譜與節奏連接線仍會依不同版型持續微調

## Roadmap

- Google 帳號登入與雲端同步
- 更完整的簡譜 / 節奏排版邏輯
- 歌譜分享與多人協作
- 更完整的快捷鍵與編輯模式

## License

目前未指定開源授權；若要公開發佈，建議補上合適的 License。
