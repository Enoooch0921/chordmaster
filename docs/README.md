# ChordMaster 文件

[回到專案首頁](../README.md) · [開啟 ChordMaster](https://enoooch0921.github.io/chordmaster/) · [完整更新紀錄](../CHANGELOG.md)

## 操作指南

| 主題 | 說明 |
| --- | --- |
| [搜尋歌曲](song-search.md) | 歌名、歌詞及拼音搜尋。 |
| [歌曲庫與篩選](library-ux-improvements-2026-11-06.md) | 命中摘要、收藏、最近使用與跨搜尋選取。 |
| [團隊與權限](team-permissions.md) | 團隊角色、歌單協作與修改範圍。 |
| [歌單來源版本](setlist-source-versions.md) | 比對歌單與曲庫，處理更新及衝突。 |
| [曲序編排](song-map-editor.md) | 段落標籤、重複演唱與拖曳排序。 |
| [鼓手模式](drummer-mode.md) | TAP、節拍器、切歌與演出操作。 |
| [鼓手控制器](drummer-controller-guide.md) | MIDI 與外接控制器。 |
| [演出顯示](performance-display.md) | 全螢幕、譜面與翻頁。 |
| [中英混合歌詞](mixed-lyrics.md) | 語言與逐行對照的資料規則。 |
| [弱起拍](pickup-measures.md) | 第 0 小節與不完整拍數。 |
| [復原與重做](global-workspace-history.md) | 操作歷史及資料恢復。 |
| [本機工作區救援](workspace-recovery.md) | 檢查備份與處理工作區異常。 |
| [App 更新](app-updates.md) | 新版提示與安全重新載入。 |

## 開發與維護

- [本機啟動與常用指令](../README.md#本機開發)
- [正式資料與操作約定](../AGENTS.md)
- [Supabase 設定](supabase-setup.md)
- [本機工作區啟動](offline-workspace-startup.md)
- [歌曲庫即時同步](song-library-live-sync.md)
- [設計原則](../DESIGN.md)
- [原始 PDF 轉譜規則](topchurchworship-transcription-rules.md)

## 本次發佈與驗證記錄

- [0.12.17 發佈說明](release-0.12.17.md)：本次整合的功能、檢查及限制。
- [動畫合理性修正](animation-reasonableness-fixes-2026-11-07.md)：TAP、左滑、曲序拖曳及鼓手設定。
- [跨裝置互動修正](ui-motion-fixes-2026-11-07.md)：畫面、觸控與鍵盤回歸。
- [歌單卡片點按範圍](setlist-song-hit-area-2026-11-06.md)、[手機頁籤](mobile-workspace-tabs-2026-11-06.md)、[固定畫面的翻頁回饋](stationary-page-turn-feedback-2026-11-06.md)。
- [原唱語言檢查](topchurchworship-sung-language-audit-2026-11-06.md)：PDF 來源核對範圍與保留問題。
- [0.12.16 發佈說明](release-0.12.16.md)：上次的搜尋、同步與 NAS 更新。

歷史稽核中的「未發佈」描述代表記錄當下的狀態，實際發佈請以 [GitHub Releases](https://github.com/Enoooch0921/chordmaster/releases) 與 [部署紀錄](https://github.com/Enoooch0921/chordmaster/actions/workflows/deploy.yml) 為準。`tmp/`、`output/` 的本機測試證據不隨儲存庫發佈。
