import type { AppLanguage } from '../types';

export interface KeyboardShortcutEntry {
  keys: string[];
  action: Record<AppLanguage, string>;
  context?: Record<AppLanguage, string>;
}

export interface KeyboardShortcutSection {
  id: string;
  title: Record<AppLanguage, string>;
  description?: Record<AppLanguage, string>;
  shortcuts: KeyboardShortcutEntry[];
}

export const KEYBOARD_SHORTCUT_SECTIONS: KeyboardShortcutSection[] = [
  {
    id: 'global',
    title: { en: 'Global', zh: '全站' },
    description: {
      en: 'Available from most screens unless you are typing in a text field.',
      zh: '大多數畫面都可使用；正在文字欄位輸入時會避免攔截普通字元。'
    },
    shortcuts: [
      {
        keys: ['?', 'Shift + /', 'Ctrl/Cmd + /'],
        action: { en: 'Open keyboard shortcuts', zh: '開啟快捷鍵清單' }
      },
      {
        keys: ['Ctrl/Cmd + S'],
        action: { en: 'Save the library', zh: '儲存歌庫' }
      },
      {
        keys: ['Ctrl/Cmd + Z'],
        action: { en: 'Undo', zh: '復原' },
        context: { en: 'Editor and preview quick editor', zh: '編輯器與預覽快捷編輯' }
      },
      {
        keys: ['Ctrl/Cmd + Shift + Z', 'Ctrl/Cmd + Y'],
        action: { en: 'Redo', zh: '重做' },
        context: { en: 'Editor and preview quick editor', zh: '編輯器與預覽快捷編輯' }
      },
      {
        keys: ['Esc'],
        action: { en: 'Close panels or finish the active quick editor', zh: '關閉面板，或完成目前的快捷編輯' }
      }
    ]
  },
  {
    id: 'performance',
    title: { en: 'Performance Mode', zh: '演出模式' },
    shortcuts: [
      {
        keys: ['Space', 'Enter', 'ArrowRight', 'ArrowDown', 'PageDown'],
        action: { en: 'Next page', zh: '下一頁' }
      },
      {
        keys: ['Shift + Space', 'ArrowLeft', 'ArrowUp', 'PageUp'],
        action: { en: 'Previous page', zh: '上一頁' }
      },
      {
        keys: ['Esc'],
        action: { en: 'Exit performance mode', zh: '離開演出模式' }
      }
    ]
  },
  {
    id: 'preview',
    title: { en: 'Preview Quick Edit', zh: '預覽快捷編輯' },
    description: {
      en: 'These apply after clicking a bar in the preview sheet.',
      zh: '點選預覽譜面的小節進入快捷編輯後可使用。'
    },
    shortcuts: [
      {
        keys: ['Space'],
        action: { en: 'Move to the next beat or notation position', zh: '移到下一拍或下一個記譜位置' }
      },
      {
        keys: ['Enter'],
        action: { en: 'Move to the next bar', zh: '移到下一小節' }
      },
      {
        keys: ['Shift + Space'],
        action: { en: 'Insert a beat before the current beat', zh: '在目前拍前插入一拍' },
        context: { en: 'Chord mode', zh: '和弦模式' }
      },
      {
        keys: ['Shift + Enter'],
        action: { en: 'Insert a bar before the current bar', zh: '在目前小節前插入小節' },
        context: { en: 'Chord mode', zh: '和弦模式' }
      },
      {
        keys: ['Shift + ArrowLeft', 'Shift + ArrowRight'],
        action: { en: 'Move to the previous or next bar', zh: '移到前一小節或下一小節' },
        context: { en: 'Chord mode', zh: '和弦模式' }
      },
      {
        keys: ['[', ']', '\\'],
        action: { en: 'Toggle repeat start, repeat end, or final barline', zh: '切換反覆開始、反覆結束或終止線' }
      },
      {
        keys: ['Option/Alt + 1-9'],
        action: { en: 'Toggle a repeat ending number on the current bar', zh: '切換目前小節的房子記號數字' },
        context: { en: 'Chord mode in preview quick edit and full editor; 1 then 2 becomes 1,2, pressing 2 again removes it', zh: '預覽快捷編輯與完整編輯器的和弦模式；先 1 再 2 會變成 1,2，再按 2 會取消 2' }
      },
      {
        keys: ['%'],
        action: { en: 'Write repeat-previous-bar symbol', zh: '輸入重複前一小節符號' },
        context: { en: 'Chord mode', zh: '和弦模式' }
      },
      {
        keys: ['Backspace', 'Delete'],
        action: { en: 'Delete content at the cursor, or remove an empty bar', zh: '刪除游標位置內容，或移除空白小節' }
      }
    ]
  },
  {
    id: 'rhythm',
    title: { en: 'Rhythm', zh: '節奏' },
    shortcuts: [
      {
        keys: ['W', 'H', 'Q', 'E', 'S'],
        action: { en: 'Insert whole, half, quarter, eighth, or sixteenth note', zh: '輸入全音符、二分、四分、八分或十六分音符' }
      },
      {
        keys: ['R'],
        action: { en: 'Insert a quarter rest', zh: '輸入四分休止符' }
      },
      {
        keys: ['.', 'D'],
        action: { en: 'Toggle dot', zh: '切換附點' }
      },
      {
        keys: ['^'],
        action: { en: 'Toggle accent', zh: '切換重音' },
        context: { en: 'Preview quick editor', zh: '預覽快捷編輯' }
      },
      {
        keys: ['T', '~'],
        action: { en: 'Toggle tie', zh: '切換連結線' }
      },
      {
        keys: ['3'],
        action: { en: 'Insert triplet rhythm', zh: '輸入三連音節奏' },
        context: { en: 'Preview quick editor', zh: '預覽快捷編輯' }
      },
      {
        keys: ['Home', 'End'],
        action: { en: 'Move to the beginning or end of the rhythm bar', zh: '移到節奏小節開頭或結尾' },
        context: { en: 'Preview quick editor', zh: '預覽快捷編輯' }
      },
      {
        keys: ['Ctrl/Cmd + C', 'Ctrl/Cmd + V'],
        action: { en: 'Copy or paste rhythm', zh: '複製或貼上節奏' },
        context: { en: 'Rhythm field', zh: '節奏欄位' }
      }
    ]
  },
  {
    id: 'jianpu',
    title: { en: 'Jianpu', zh: '簡譜' },
    shortcuts: [
      {
        keys: ['1-7', '0', '-'],
        action: { en: 'Insert notes, rest, or hold', zh: '輸入音符、休止或延音' }
      },
      {
        keys: ['Q', 'E', 'S'],
        action: { en: 'Set quarter, eighth, or sixteenth duration', zh: '設定四分、八分或十六分時值' }
      },
      {
        keys: ['ArrowUp', 'H', 'ArrowDown', 'L'],
        action: { en: 'Toggle high or low octave', zh: '切換高八度或低八度' }
      },
      {
        keys: ['#', 'B'],
        action: { en: 'Toggle sharp or flat', zh: '切換升記號或降記號' }
      },
      {
        keys: ['.'],
        action: { en: 'Toggle dot', zh: '切換附點' }
      },
      {
        keys: ['T', 'Shift + T'],
        action: { en: 'Toggle slur or triplet', zh: '切換圓滑線或三連音' }
      },
      {
        keys: ['ArrowLeft', 'ArrowRight'],
        action: { en: 'Move between jianpu notes or positions', zh: '在簡譜音符或位置間移動' }
      },
      {
        keys: ['Ctrl/Cmd + C', 'Ctrl/Cmd + V'],
        action: { en: 'Copy or paste jianpu', zh: '複製或貼上簡譜' },
        context: { en: 'Jianpu field', zh: '簡譜欄位' }
      }
    ]
  },
  {
    id: 'fields',
    title: { en: 'Fields And Menus', zh: '欄位與選單' },
    shortcuts: [
      {
        keys: ['Enter'],
        action: { en: 'Commit the active title, metadata, tempo, time signature, or whole-bar input', zh: '套用正在編輯的標題、資訊、速度、拍號或整小節輸入' }
      },
      {
        keys: ['ArrowUp', 'ArrowDown'],
        action: { en: 'Step tempo, time signature, capo, key options, or suggestions', zh: '調整速度、拍號、Capo、調號選項或建議項目' }
      },
      {
        keys: ['Shift + ArrowUp', 'Shift + ArrowDown'],
        action: { en: 'Use the larger tempo step or denominator step', zh: '使用較大的速度步進，或調整拍號分母' }
      },
      {
        keys: ['Tab', 'Shift + Tab'],
        action: { en: 'Move to the next or previous notation field', zh: '移到下一個或前一個記譜欄位' },
        context: { en: 'Full editor', zh: '完整編輯器' }
      },
      {
        keys: ['Enter', 'Space'],
        action: { en: 'Choose a key or capo option', zh: '選擇調號或 Capo 選項' },
        context: { en: 'Picker menus', zh: '選單' }
      },
      {
        keys: ['Esc'],
        action: { en: 'Close picker menus and edit panels', zh: '關閉選單與編輯面板' }
      }
    ]
  }
];
