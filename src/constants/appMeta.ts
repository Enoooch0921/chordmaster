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
          'Supports regular chord display, Nashville number display, fixed-do 1=C jianpu, and section-based key changes.'
        ]
      },
      {
        title: 'Storage & Backup',
        description: 'Your Song Library is stored in the current browser by default, which is fast, but backup is still recommended.',
        bullets: [
          'Export Song Library JSON for backup or device-to-device transfer.',
          'Export PDF directly for rehearsal or live use, with preview zoom, section key markers, and print-oriented layout refinements.',
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
          'Common section names such as Count-In, Verse, Chorus, Turnaround, Breakdown, Bridge, and Interlude are ready to use.',
          'Sections can define their own key changes, and later sections can inherit those changes automatically.'
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
        date: '2026-04-09',
        title: 'Service Setlist, unified key/capo controls, and compact editor update',
        bullets: [
          'Added Service Setlist with per-entry song overrides, setlist-level display settings, and full-set PDF/export flow.',
          'Unified Key and Capo selection across the app with shared popup pickers and a tighter metadata toolbar in both song and setlist modes.',
          'Improved setlist preview synchronization, sidebar add-song flow, and several layout/measurement bugs in the editor and sheet preview.'
        ]
      },
      {
        version: '0.5.0',
        date: '2026-04-04',
        title: 'Section key change, pickup workflow, and editor/preview sync update',
        bullets: [
          'Added section-level key changes that cascade to later sections, plus preview-side Key markers and automatic chord rewriting in the editor.',
          'Added an editor-only pickup bar workflow with preview pickup rendering before the first bar.',
          'Improved accidental spacing, section drag/drop key inheritance, and several editor/preview synchronization details.'
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
          '支援一般和弦、Nashville 級數譜、固定調 `1=C` 簡譜，以及段落轉調。'
        ]
      },
      {
        title: '資料與備份',
        description: '歌庫預設保存在目前瀏覽器裡，適合快速使用，但仍建議定期備份。',
        bullets: [
          '可匯出 Song Library JSON 作為備份或跨裝置移轉。',
          '可直接匯出 PDF 給團隊排練或現場使用，並搭配右側預覽縮放與段落 Key 標示檢查版面。',
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
          '段落預設已補齊常見的 Count-In、Verse、Chorus、Turnaround、Breakdown、Bridge、Interlude 等名稱。',
          '段落可設定自己的轉調，後面段落也會自動承接新的 key。'
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
        date: '2026-04-09',
        title: '服事歌單、共用 Key / Capo 控制器與緊湊編輯列更新',
        bullets: [
          '新增 Service Setlist，可為每個 SetlistSong 保留獨立覆蓋設定，並支援整份歌單的顯示模式與歌詞控制。',
          '全站統一 KeyPicker / CapoPicker，並把一般歌曲與服事歌單模式的上方資訊列整理成更緊湊的工具列。',
          '改善 setlist 預覽聯動、側邊欄加入歌曲流程，以及多處 editor / preview 的量測與版面問題。'
        ]
      },
      {
        version: '0.5.0',
        date: '2026-04-04',
        title: '段落轉調、弱起拍與 editor / preview 聯動更新',
        bullets: [
          '新增段落轉調，可讓後續段落一起承接新的 key，預覽也會顯示對應的 `Key: X` 標示。',
          '新增 editor-only 弱起拍 0 小節流程，並可在預覽第一小節前呈現弱起內容。',
          '改善升降記號距離、段落拖曳後的 key 繼承、以及 editor / preview 的轉調同步。'
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
