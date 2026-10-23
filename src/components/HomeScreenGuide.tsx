import { useState } from 'react';
import { ArrowUp, Check, ChevronLeft, Ellipsis, PlusSquare, Share, X } from 'lucide-react';
import type { AppLanguage } from '../types';
import ResponsiveDialog from './ResponsiveDialog';

export type HomeScreenDevice = 'iphone' | 'ipad';
interface Props {
  language: AppLanguage;
  initialDevice: HomeScreenDevice;
  onClose: () => void;
  onAdded: () => void;
}

// Schematic browser chrome: keep icons and labels as accessible HTML, so the
// guide scales with the device and language without downloading screenshots.
function InstallIllustration({ device, step, zh }: { device: HomeScreenDevice; step: number; zh: boolean }) {
  const ipad = device === 'ipad';
  const highlight = 'rounded-lg bg-indigo-600 p-2 text-white ring-4 ring-indigo-100';
  return <div aria-hidden="true" className="mx-auto w-full max-w-[320px] rounded-2xl border-2 border-slate-300 bg-slate-50 p-2 shadow-sm">
    <div className="flex h-[148px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-[11px] text-slate-600">
      {step === 1 ? <>
        {ipad && <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2">
          <div className="min-w-0 flex-1 truncate rounded-md bg-white px-2 py-1">chordmaster</div>
          <Share size={32} className={highlight} />
        </div>}
        <div className="flex flex-1 items-center justify-center gap-2 font-bold text-slate-800">
          <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} width="32" height="32" alt="" className="rounded-lg" />
          ChordMaster
        </div>
        {!ipad && <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-100 px-3 py-2">
          <ChevronLeft size={16} />
          <span className="flex min-w-0 flex-1 items-center justify-between rounded-lg bg-white px-2 py-1">
            chordmaster <Ellipsis size={16} />
          </span>
          <Share size={32} className={highlight} />
        </div>}
      </> : step === 2 ? <div className="flex h-full flex-col justify-center gap-3 px-4">
        <div className="flex items-center gap-2 rounded-lg border-2 border-indigo-500 bg-indigo-50 px-3 py-2 font-bold text-indigo-800">
          <PlusSquare size={18} className="shrink-0" />{zh ? '加入主畫面' : 'Add to Home Screen'}
        </div>
        <div className="flex items-center justify-between gap-2 px-1">
          <span>{zh ? '打開為網頁 App' : 'Open as Web App'}</span>
          <span className="flex h-5 w-9 shrink-0 justify-end rounded-full bg-emerald-500 p-0.5"><span className="size-4 rounded-full bg-white" /></span>
        </div>
        <span className="self-end rounded-md bg-indigo-600 px-3 py-1 font-bold text-white">{zh ? '加入' : 'Add'}</span>
      </div> : <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-indigo-50 to-sky-100">
        <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} width="52" height="52" alt="" className="rounded-xl shadow-md ring-4 ring-white" />
        <span className="font-bold text-slate-800">ChordMaster</span>
        <ArrowUp size={22} className="text-indigo-600" />
      </div>}
    </div>
    <div className={`mx-auto mt-2 h-1 rounded-full bg-slate-400 ${ipad ? 'w-16' : 'w-10'}`} />
  </div>;
}

export default function HomeScreenGuide({ language, initialDevice, onClose, onAdded }: Props) {
  const [device, setDevice] = useState(initialDevice);
  const zh = language === 'zh';
  const ipad = device === 'ipad';
  const steps = zh ? [
    { title: '開啟 Safari 分享選單', text: ipad
      ? '在 iPad 的 Safari 開啟 ChordMaster，點上方的分享圖示。'
      : '在 iPhone 的 Safari 開啟 ChordMaster，點網址列旁的選單，再選「分享」；若已看到分享圖示，可直接點它。' },
    { title: '加入主畫面', text: '在分享選單往下找「加入主畫面」（可能需要先點「檢視更多內容」）。若有「打開為網頁 App」，保持開啟，再點「加入」。' },
    { title: '從主畫面圖示開啟', text: `回到 ${ipad ? 'iPad' : 'iPhone'} 主畫面，點 ChordMaster 圖示開啟，再進入演出模式，便不會顯示 Safari 網址列。` },
  ] : [
    { title: 'Open the Safari share menu', text: ipad
      ? 'Open ChordMaster in Safari on iPad, then tap the Share icon in the top toolbar.'
      : 'Open ChordMaster in Safari on iPhone. Open the menu beside the address bar and choose Share, or tap Share directly if the icon is visible.' },
    { title: 'Add to Home Screen', text: 'Scroll through the share menu to Add to Home Screen (you may need to tap More first). Leave Open as Web App enabled if shown, then tap Add.' },
    { title: 'Open the Home Screen icon', text: `Go to your ${ipad ? 'iPad' : 'iPhone'} Home Screen and open the ChordMaster icon. Enter Performance Mode to use it without Safari’s address bar.` },
  ];

  return <ResponsiveDialog title={zh ? '加入主畫面' : 'Add to Home Screen'}
    subtitle={zh ? '像 App 一樣開啟 ChordMaster' : 'Open ChordMaster like an app'}
    closeLabel={zh ? '關閉加入主畫面引導' : 'Close Home Screen guide'} onClose={onClose}>
    <div data-home-screen-guide className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 pb-[max(20px,env(safe-area-inset-bottom))] text-sm leading-6">
      <div role="group" aria-label={zh ? '選擇裝置' : 'Choose device'} className="mb-4 flex gap-2 rounded-xl bg-slate-100 p-1">
        {(['iphone', 'ipad'] as const).map(value => <button key={value} type="button" aria-pressed={device === value}
          onClick={() => setDevice(value)} className={`min-h-11 flex-1 rounded-lg px-4 font-bold ${device === value ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'}`}>
          {value === 'iphone' ? 'iPhone' : 'iPad'}
        </button>)}
      </div>
      <p className="text-gray-600">{zh ? '請在裝置的 Safari 中操作。以下為示意圖；工具列位置可能隨系統版本與設定不同。' : 'Follow these steps in Safari on your device. These diagrams are illustrative; toolbar positions vary by system version and settings.'}</p>
      <ol className="mt-5 space-y-6">
        {steps.map((step, index) => <li key={index} className="space-y-3">
          <h3 className="flex items-center gap-2 font-bold text-slate-900"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-700">{index + 1}</span>{step.title}</h3>
          <p className="text-gray-600">{step.text}</p>
          <InstallIllustration device={device} step={index + 1} zh={zh} />
        </li>)}
      </ol>
      <p className="mt-5 text-xs text-gray-500">{zh ? '時間、電量與底部手勢區域仍由系統管理。' : 'The system still controls the clock, battery indicators, and home gesture area.'}</p>
      <a href={`https://support.apple.com/${zh ? 'zh-tw' : 'en-us'}/guide/${ipad ? 'ipad/ipad8f1f7a29/ipados' : 'iphone/iphea86e5236/ios'}`} target="_blank" rel="noreferrer" className="mt-3 inline-block min-h-11 py-2 font-semibold text-indigo-700 underline underline-offset-4">{zh ? 'Apple 官方操作說明' : 'Apple’s official instructions'}</a>
      <div className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4">
        <button type="button" onClick={onAdded} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white"><Check size={18} />{zh ? '我已加入，不再顯示' : 'Already added — don’t show again'}</button>
        <button type="button" onClick={onClose} className="flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 font-semibold text-slate-600"><X size={16} />{zh ? '稍後再說' : 'Maybe later'}</button>
      </div>
    </div>
  </ResponsiveDialog>;
}
