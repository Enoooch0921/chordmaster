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
        title: 'Reference Practice',
        description: 'Each song can keep band and vocal YouTube references for rehearsal.',
        bullets: [
          'Store a YouTube URL, reference key, and BPM for both the band version and vocal version.',
          'Open the mini player from song view, setlist preview, or Performance Mode without leaving the chart.',
          'Use play/pause, seek buttons, BPM-based speed controls, key-difference display, and TAP tempo for practice.'
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
        date: '2026-05-26',
        title: 'Compound-meter jianpu fix, multi-measure rest, and chord layout polish',
        bullets: [
          'Fixed 6/8 and other compound-meter jianpu where notes beyond the first pulse overflowed past the bar line.',
          'Added a multi-measure rest symbol — type `|N|` (e.g. `|4|`) in a chord cell to render an N-bar rest.',
          'Single-chord bars and bars with chords on beats 1 and 3 are no longer auto-compressed; the chord renders at natural size anchored to its beat.',
          'Bar toolbar 1234 / ♬ icons are now text labels `簡譜` / `節奏`, reordered so they sit next to each other.'
        ]
      },
      {
        version: '0.8.6',
        date: '2026-05-25',
        title: 'Desktop setlist workflow and performance paging',
        bullets: [
          'Desktop setlist mode now uses List, Detail, and Add Songs panels so larger setlist libraries are easier to manage.',
          'Clicking a song inside a setlist now scrolls the right-side preview directly to that song.',
          'Performance Mode now turns pages by tapping the left or right half of the screen.'
        ]
      },
      {
        version: '0.8.4',
        date: '2026-05-07',
        title: 'Team invite and mobile rhythm fixes',
        bullets: [
          'Team Invite failures now show the underlying Supabase reason instead of a generic message.',
          'Duplicate personal libraries are deduped in the workspace switcher, with a migration to merge existing duplicates and prevent new ones.',
          'Fixed compact triplet markers being clipped in narrow mobile rhythm lanes.'
        ]
      },
      {
        version: '0.8.3',
        date: '2026-05-06',
        title: 'Key spelling and section focus fixes',
        bullets: [
          'Fixed `Bb` being displayed as `A#` in the chart preview and key-sync flows.',
          'Constrained transposed song keys to the official KeyPicker spelling set.',
          'New sections now focus the section title field first instead of jumping directly to the first chord input.'
        ]
      },
      {
        version: '0.8.2',
        date: '2026-05-06',
        title: 'Rehearsal input bug fixes',
        bullets: [
          'Improved TAP tempo so BPM feedback appears inside the TAP button without forcing full metadata re-renders while tapping.',
          'Added reusable suggestions for Version and Translator from existing songs, and fixed spacebar entry in those fields.',
          'Fixed Segno and Coda markers overlapping bar numbers by letting navigation markers take priority.'
        ]
      },
      {
        version: '0.8.1',
        date: '2026-05-05',
        title: 'Search normalization update',
        bullets: [
          'Improved Song Library, Setlist, and add-song search normalization.',
          'Search now treats `你` and `祢` as equivalent for worship-song wording differences.',
          'Search now normalizes Simplified and Traditional Chinese with OpenCC so either script can match the other.'
        ]
      },
      {
        version: '0.8.0',
        date: '2026-05-05',
        title: 'Song-level YouTube reference player',
        bullets: [
          'Added song-level band and vocal references with YouTube URL, reference key, BPM, normalization, import/export, sync, and share-payload support.',
          'Added a bottom mini player for song view, setlist preview, and Performance Mode with band/vocal switching, play/pause, seek controls, and YouTube fallback links.',
          'Added BPM-based practice speed controls, TAP tempo, effective BPM display, reference key vs chart key comparison, and clearer Transpose extension guidance.',
          'Improved reference metadata layout and responsive behavior so URL, key, BPM, and TAP controls remain usable on narrower screens.'
        ]
      },
      {
        version: '0.7.0',
        date: '2026-04-23',
        title: 'Cloud sync, shared setlists, performance mode, and PDF export update',
        bullets: [
          'Added Supabase sign-in and sync foundations, public read-only song/setlist sharing, share-link functions, and joined shared setlist loading.',
          'Added shared setlist membership management, personal Key/Capo/display overrides, fuller shared setlist song details, and improved share/import auth flows.',
          'Added Performance Mode entry points, mobile performance controls, PDF export cancellation, and a faster single-canvas PDF export path for large or mobile setlists.',
          'Improved responsive editor/sidebar layouts, picker overlays, lyrics pagination, sheet bar-number placement, and several performance-mode stability issues.'
        ]
      },
      {
        version: '0.6.0',
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
        title: 'Reference 練習',
        description: '每首歌可保存樂團版本與歌手版本 YouTube 參考音源。',
        bullets: [
          '樂團版本與歌手版本可各自保存 YouTube URL、reference 原調與 BPM。',
          '歌曲模式、歌單預覽與 Performance Mode 都可開啟 mini player，不必離開譜面。',
          '可使用播放 / 暫停、前後跳秒、BPM 式速度控制、半音差顯示與 TAP tempo 輔助練習。'
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
        date: '2026-05-26',
        title: '複合拍子簡譜修正、多小節休止符、和弦排版優化',
        bullets: [
          '修正 6/8 等複合拍子簡譜在第一拍以後的音會溢出小節線的問題。',
          '新增多小節休止符記號 ── 在和弦欄位輸入 `|N|` (例如 `|4|`) 即可顯示 N 個小節休止。',
          '單和弦小節，以及第 1+3 拍兩個和弦的小節，不再自動壓縮，和弦會以原始大小從拍點開始顯示。',
          '小節工具列的 1234 / ♬ 圖示改成「簡譜」/「節奏」文字，並把兩者調整為相鄰排列。'
        ]
      },
      {
        version: '0.8.6',
        date: '2026-05-25',
        title: '桌面歌單流程與演出模式翻頁',
        bullets: [
          '桌面歌單模式改為 List、Detail、Add Songs 分層面板，歌單變多時更容易管理。',
          '點擊歌單內歌曲時，右側預覽會直接定位到該歌曲。',
          '演出模式現在可點螢幕左半邊或右半邊快速翻頁。'
        ]
      },
      {
        version: '0.8.4',
        date: '2026-05-07',
        title: '團隊邀請與手機節奏修復',
        bullets: [
          'Team Invite 接受失敗時會顯示 Supabase 回傳的實際原因，不再只顯示泛用錯誤。',
          'workspace 切換列會去除重複 personal library，並新增 migration 合併既有重複個人區、避免之後再重複建立。',
          '修正手機窄版節奏列中，compact 三連音數字被裁切或顯示不完整的問題。'
        ]
      },
      {
        version: '0.8.3',
        date: '2026-05-06',
        title: 'Key 命名與段落焦點修復',
        bullets: [
          '修正 `Bb` 在右側預覽或 key 同步流程中顯示成 `A#` 的問題。',
          'key 轉調結果現在會限制在 KeyPicker 的正式命名清單內。',
          '新增段落後會先聚焦段落標題欄位，不再直接跳到第一個和弦輸入框。'
        ]
      },
      {
        version: '0.8.2',
        date: '2026-05-06',
        title: '排練輸入修復',
        bullets: [
          '改善 TAP tempo，TAP 按鈕會即時顯示偵測 BPM，但拍擊時不再觸發整個 metadata 區塊重 render。',
          '版本與翻譯欄位新增歌曲庫既有值建議，並修正這些欄位無法輸入空白鍵的問題。',
          '修正 Segno / Coda 導覽記號與小節數重疊時，由導覽記號優先顯示。'
        ]
      },
      {
        version: '0.8.1',
        date: '2026-05-05',
        title: '搜尋正規化更新',
        bullets: [
          '改善 Song Library、Setlist 與加入歌曲搜尋的文字正規化。',
          '搜尋時 `你` 和 `祢` 會視為同一個字，符合敬拜歌曲常見用字差異。',
          '搜尋時會透過 OpenCC 統一簡繁文字，讓簡體與繁體可互相命中。'
        ]
      },
      {
        version: '0.8.0',
        date: '2026-05-05',
        title: '歌曲層級 YouTube Reference 播放器',
        bullets: [
          '新增歌曲層級樂團版本與歌手版本 reference，可保存 YouTube URL、reference 原調與 BPM，並支援整理、匯入、同步與分享資料保留。',
          '新增底部 mini player，歌曲模式、歌單預覽與 Performance Mode 都可開啟，並支援樂團 / 歌手切換、播放 / 暫停、前後跳秒與 YouTube fallback。',
          '新增 BPM 式練習速度控制、TAP tempo、體感 BPM、reference key 對目前譜面 key 的半音差，以及更清楚的 Transpose 插件提示。',
          '改善 Reference metadata UI 與窄螢幕排版，避免 URL、Key、BPM、TAP 控制重疊或被吃掉。'
        ]
      },
      {
        version: '0.7.0',
        date: '2026-04-23',
        title: '雲端同步、共同歌單、演出模式與 PDF 匯出更新',
        bullets: [
          '新增 Supabase 登入與同步基礎、歌曲 / 歌單公開唯讀分享、分享連結 Edge Functions，以及已加入 shared setlist 載入流程。',
          '新增 shared setlist 成員管理、個人 Key / Capo / 顯示覆蓋、完整共享歌單歌曲細節，並改善分享匯入與登入導向流程。',
          '新增 Performance Mode 入口、行動版演出控制、PDF 匯出取消按鈕，以及更適合大型或行動裝置歌單的 single-canvas PDF 匯出流程。',
          '改善 responsive editor / sidebar、picker overlays、歌詞分頁密度、譜面小節編號位置，以及多個 performance mode 穩定性問題。'
        ]
      },
      {
        version: '0.6.0',
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
