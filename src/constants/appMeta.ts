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

export const ABOUT_SECTIONS: InfoSection[] = [
  {
    title: '產品定位',
    description: '把和弦譜、級數譜、簡譜與段落編排放在同一個工作流裡。',
    bullets: [
      '適合敬拜團、流行歌曲排練、教學講義與臨時轉調整理。',
      '編輯器和譜面預覽同步，方便一邊輸入一邊檢查版面。',
      '支援一般和弦與 Nashville 級數譜顯示。'
    ]
  },
  {
    title: '資料與備份',
    description: '歌庫預設保存在目前瀏覽器裡，適合快速使用，但仍建議定期備份。',
    bullets: [
      '可匯出 Song Library JSON 作為備份或跨裝置移轉。',
      '可直接匯出 PDF 給團隊排練或現場使用。',
      '版本號會跟著功能更新，方便你辨識目前使用的版本。'
    ]
  }
];

export const HELP_SECTIONS: InfoSection[] = [
  {
    title: '快速開始',
    description: '先建立歌曲，再用左側歌庫管理與右側譜面預覽確認結果。',
    bullets: [
      '點 `New Song` 建立新歌，`Open Editor` 打開編輯器。',
      '在 top bar 可切換 Key、Capo、123 級數譜與 PDF 匯出。',
      '左側 Song Library 可搜尋、複製、刪除、匯入與匯出整個歌庫。'
    ]
  },
  {
    title: '快速輸入',
    description: '常用的輸入流程已經針對排練用法做過加速。',
    bullets: [
      '新增小節時預設為空白，焦點會自動跳到新的 chord 欄位。',
      '在 chord input 內按 `Enter` 可以直接在後方插入新小節。',
      '段落預設已補齊常見的 Count-In、Verse、Chorus、Bridge、Interlude 等名稱。'
    ]
  },
  {
    title: '備份與輸出',
    description: '目前仍是本機瀏覽器型工作流，建議保留外部備份。',
    bullets: [
      '`Save Changes` 會把目前歌庫存進這台裝置的瀏覽器。',
      '`Export JSON` 建議作為定期備份。',
      '`Export PDF` 會直接把目前預覽輸出成 PDF。'
    ]
  }
];

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: APP_VERSION,
    date: '2026-04-01',
    title: 'Capo、Key 與編輯器流程更新',
    bullets: [
      '加入階梯式 Key 選單、Original Key 面板與 Original 標示色，並補上 C#、F#、G# key。',
      'Capo 面板與譜面顯示改成更精簡的吉他導向樣式，並依常用 key 做視覺區分。',
      '新增節奏複製貼上、左側歌庫縮放與卡片操作優化，並整理多項和弦與級數譜排版細節。'
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
];
