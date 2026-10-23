# 0.9.11 發布整合紀錄（2026-10-23）

## 整合範圍

- 整合遠端 `43dad1c9`，保留歌單總覽／右鍵操作、團隊工作區偏好、IndexedDB 復原、短小節與 NAS 分批查詢／網路重試。
- 納入本機待發布的簡譜多聲部、裝飾音群、重音、樂句線、二分音符三連音、指定遍數和弦，以及來源未定調性／拍位與無小節線和弦支援。
- 新增演出模式全螢幕與寬螢幕 A4 雙頁，以及中文在上、英文在下的逐行混合歌詞。
- 原有左右中英對照保留；混合版涵蓋單曲、歌單、閱讀、演出與 PDF 匯出。

## 發布檢查

以 Node.js 22 重新 `npm ci` 後執行：

| 檢查 | 結果 |
| --- | --- |
| `npm run lint` | 通過 |
| `npm run test:run` | 78 個測試檔、833 項測試通過 |
| `npm run build` | 通過 |
| `npm run build:ipad` | 通過 |
| Swift Package 依賴解析 | 通過，Capacitor 8.5.3、ion-ios-filesystem 1.1.4 |
| `npm audit` | 0 個已知漏洞 |

本機瀏覽器已驗證雙頁 1–2 → 3–4 → 5、旋轉後保留所在頁、Esc 退出，以及 64 組中英混合歌詞在桌面／手機／演出模式完整顯示、無橫向溢出。實際操作匯出 PDF 後，已視讀首頁與末頁。iPadOS／iPhone Safari 的系統全螢幕行為仍需實機確認；iPad 建置檢查為 web assets 建置，未打包發行原生 App。

## 依賴與部署

- Vite 6.4.5、Vitest 4.1.12、Capacitor runtime 8.5.3 與間接依賴採相容修補版本。
- Capacitor CLI 固定 8.4.3，避開 8.5.x 引入且尚未修補的 xcode／uuid 開發工具相依；runtime 與 Swift 套件使用 8.5.3。
- GitHub Actions 與本機統一使用 Node.js 22。推送 `main` 後由現有 GitHub Pages workflow 部署，並檢查正式環境指向教會 NAS Supabase。
- `tmp/`、輸出檔與私密環境設定保留在本機，排除於 Git、型別檢查及應用程式測試；歷史轉錄與資料庫備份不隨網站發布。

相關規格：[演出模式](performance-display.md)、[中英混合歌詞](mixed-lyrics.md)、[來源轉錄規則](topchurchworship-transcription-rules.md)。
