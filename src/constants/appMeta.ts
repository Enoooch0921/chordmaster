import { AppLanguage } from '../types';

export interface InfoSection {
  title: string;
  description: string;
  bullets: string[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  bullets: string[];
}

export const APP_NAME = 'ChordMaster';
export const APP_VERSION = __APP_VERSION__;
export const APP_GITHUB_URL = 'https://github.com/Enoooch0921/chordmaster';

const localizedMeta: Record<AppLanguage, {
  aboutSections: InfoSection[];
  helpSections: InfoSection[];
  changelogEntries: ChangelogEntry[];
}> = {
  en: {
    aboutSections: [
      {
        title: 'What It Is',
        description: 'Keep chord charts, Nashville numbers, relative jianpu, absolute jianpu, and song structure in one workflow.',
        bullets: [
          'Built for worship teams, pop rehearsal charts, teaching handouts, and quick transposition work.',
          'The editor and sheet preview stay in sync so layout issues, navigation markers, and section colors are visible while you type.',
          'Supports regular chord display, Nashville number display, and a fixed-do 1=C jianpu mode.'
        ]
      },
      {
        title: 'Storage & Backup',
        description: 'Your Song Library is stored in the current browser by default, which is fast, but backup is still recommended.',
        bullets: [
          'Export Song Library JSON for backup or device-to-device transfer.',
          'Export PDF directly for rehearsal or live use, with preview zoom and print-oriented layout refinements.',
          'Older songs are sanitized on load/import so legacy data has a better chance of opening correctly in newer builds.'
        ]
      }
    ],
    helpSections: [
      {
        title: 'Quick Start',
        description: 'Create a song first, then use the Song Library on the left and the preview on the right to confirm the result.',
        bullets: [
          'Click `New Song` to create a song, then `Open Editor` to edit it.',
          'Use the top bar to change Key, Capo, 123 Nashville numbers, fixed-do jianpu, and PDF export.',
          'Use the Song Library to search, duplicate, delete, import, or export the full library.'
        ]
      },
      {
        title: 'Fast Entry',
        description: 'Common rehearsal entry flows have been streamlined for speed.',
        bullets: [
          'New bars start empty and focus jumps to the new chord field automatically.',
          'Press `Enter` inside a chord field to insert a new bar after the current one.',
          'Common section names such as Count-In, Verse, Chorus, Turnaround, Breakdown, Bridge, and Interlude are ready to use.'
        ]
      },
      {
        title: 'Preview & Export',
        description: 'The right-side preview is designed for layout verification before printing or PDF export.',
        bullets: [
          'Use zoom, pan, and bar-click navigation to inspect the sheet without disturbing the left editor.',
          '`Export JSON` is recommended for regular backup.',
          '`Export PDF` exports the current preview directly to PDF.'
        ]
      }
    ],
    changelogEntries: [
      {
        version: APP_VERSION,
        date: '2026-04-03',
        title: 'Fixed-do mode, navigation markers, preview zoom, and editor reliability update',
        bullets: [
          'Added fixed-do 1=C display, preview zoom/pan controls, more navigation markers, and chord fermata support.',
          'Expanded section handling with richer color categories, multiline titles, better suggestions, and merge/split workflows.',
          'Fixed a large set of jianpu editing, slur/tie cleanup, PDF export, and legacy-song compatibility issues.'
        ]
      },
      {
        version: '0.3.0',
        date: '2026-04-03',
        title: 'Jianpu workflow, labels, and bar-number update',
        bullets: [
          'Added jianpu copy/paste, accidentals, shared bar labels, section split-from-middle, and bar-number display modes.',
          'Improved jianpu spacing, duration switching, chord/rhythm alignment, and shortcut behavior.',
          'Updated README and workflow notes so the documentation matched the editor flow at that stage.'
        ]
      },
      {
        version: '0.1.0',
        date: '2026-04-01',
        title: 'Version badge, About page, and Help page',
        bullets: [
          'Added a visible version badge and wired the frontend directly to the project version.',
          'Added About and Help pages to centralize product framing, usage notes, and backup reminders.',
          'Future feature work only needs a matching version bump to stay reflected in the UI.'
        ]
      }
    ]
  },
  zh: {
    aboutSections: [
      {
        title: '產品定位',
        description: '把和弦譜、級數譜、相對簡譜、固定調簡譜與段落編排放在同一個工作流裡。',
        bullets: [
          '適合敬拜團、流行歌曲排練、教學講義與臨時轉調整理。',
          '編輯器和譜面預覽同步，方便一邊輸入一邊檢查版面、導覽記號與段落色彩。',
          '支援一般和弦、Nashville 級數譜與固定調 `1=C` 簡譜顯示。'
        ]
      },
      {
        title: '資料與備份',
        description: '歌庫預設保存在目前瀏覽器裡，適合快速使用，但仍建議定期備份。',
        bullets: [
          '可匯出 Song Library JSON 作為備份或跨裝置移轉。',
          '可直接匯出 PDF 給團隊排練或現場使用，並搭配右側預覽縮放檢查版面。',
          '較早版本的歌譜在載入或匯入時會先做整理，降低舊資料打不開的機率。'
        ]
      }
    ],
    helpSections: [
      {
        title: '快速開始',
        description: '先建立歌曲，再用左側歌庫管理與右側譜面預覽確認結果。',
        bullets: [
          '點 `New Song` 建立新歌，`Open Editor` 打開編輯器。',
          '在 top bar 可切換 Key、Capo、123 級數譜、固定調簡譜與 PDF 匯出。',
          '左側 Song Library 可搜尋、複製、刪除、匯入與匯出整個歌庫。'
        ]
      },
      {
        title: '快速輸入',
        description: '常用的輸入流程已經針對排練用法做過加速。',
        bullets: [
          '新增小節時預設為空白，焦點會自動跳到新的 chord 欄位。',
          '在 chord input 內按 `Enter` 可以直接在後方插入新小節。',
          '段落預設已補齊常見的 Count-In、Verse、Chorus、Turnaround、Breakdown、Bridge、Interlude 等名稱。'
        ]
      },
      {
        title: '預覽與輸出',
        description: '右側預覽可在匯出或列印前先確認排版，不會影響左側編輯。',
        bullets: [
          '可用縮放、拖曳與點擊小節回跳來檢查譜面細節。',
          '`Export JSON` 建議作為定期備份。',
          '`Export PDF` 會直接把目前預覽輸出成 PDF。'
        ]
      }
    ],
    changelogEntries: [
      {
        version: APP_VERSION,
        date: '2026-04-03',
        title: '固定調、導覽記號、預覽縮放與編輯穩定性更新',
        bullets: [
          '新增固定調 `1=C` 顯示、右側預覽縮放 / 拖曳、更多導覽記號與和弦 Fermata 功能。',
          '擴充段落系統，加入更多獨立顏色分類、多行段落名稱、較準確的段落建議與段落合併 / 拆分流程。',
          '修正大量簡譜編輯、連接線清理、PDF 匯出與舊歌資料相容性問題。'
        ]
      },
      {
        version: '0.3.0',
        date: '2026-04-03',
        title: '簡譜流程、標籤與小節數更新',
        bullets: [
          '新增簡譜複製 / 貼上、升降記號、共用 bar label、從中間小節拆段落與小節數顯示模式。',
          '改善簡譜間距、時值切換、和弦 / 節奏對齊與快捷鍵行為。',
          '同步更新 README 與操作說明，讓文件和當時的編輯流程一致。'
        ]
      },
      {
        version: '0.1.0',
        date: '2026-04-01',
        title: '版本號、關於頁與說明頁',
        bullets: [
          '新增可見版本號，前端現在直接讀取專案版本設定。',
          '加入 About 頁與說明頁，集中放產品定位、使用方式與備份提醒。',
          '之後每次新增功能時，只要同步 bump 專案版本即可。'
        ]
      }
    ]
  }
};

export const getLocalizedAppMeta = (language: AppLanguage) => localizedMeta[language];
