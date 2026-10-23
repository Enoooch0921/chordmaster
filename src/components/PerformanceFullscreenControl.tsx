import { useState } from 'react';
import type { AppLanguage } from '../types';
import ResponsiveDialog from './ResponsiveDialog';

interface Props {
  language: AppLanguage;
  isFullscreen: boolean;
  isStandalone: boolean;
  canRequestFullscreen: boolean;
  isAppleMobile: boolean;
  visible: boolean;
  onRequestFullscreen: () => void;
}

export default function PerformanceFullscreenControl({ language, isFullscreen, isStandalone, canRequestFullscreen, isAppleMobile, visible, onRequestFullscreen }: Props) {
  const [guideOpen, setGuideOpen] = useState(false);
  const zh = language === 'zh';
  if (isFullscreen || isStandalone) return null;

  return <>
    <button
      type="button"
      onClick={() => {
        if (canRequestFullscreen) onRequestFullscreen();
        else setGuideOpen(true);
      }}
      className={`pointer-events-auto rounded-full bg-stone-900/70 px-4 py-2 text-sm font-bold text-stone-50 ring-1 ring-white/10 backdrop-blur-sm ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
    >
      {canRequestFullscreen
        ? (zh ? '全螢幕' : 'Full screen')
        : (zh ? '無網址列使用方式' : 'Use without browser bars')}
    </button>
    {guideOpen && <ResponsiveDialog
      title={zh ? '不顯示瀏覽器網址列' : 'Use ChordMaster without browser bars'}
      closeLabel={zh ? '關閉使用說明' : 'Close instructions'}
      onClose={() => setGuideOpen(false)}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 pb-[max(20px,env(safe-area-inset-bottom))] text-sm leading-7">
        <p>{isAppleMobile
          ? (zh ? 'Safari 分頁的網址列由瀏覽器控制，演出模式無法直接將它移除。請將 ChordMaster 加入主畫面，再從主畫面圖示開啟。' : 'Safari controls the address bar in browser tabs. Performance Mode cannot remove it directly. Add ChordMaster to your Home Screen, then open it from that icon.')
          : (zh ? '目前瀏覽器無法直接進入全螢幕。請將 ChordMaster 安裝為應用程式，再從應用程式圖示開啟；或使用支援全螢幕的瀏覽器。' : 'This browser cannot enter fullscreen directly. Install ChordMaster as an app and open it from its icon, or use a browser that supports fullscreen.')}</p>
        <ol className="mt-5 list-decimal space-y-3 pl-5">
          {(isAppleMobile
            ? (zh ? [
              '在 Safari 開啟 ChordMaster，點網址列旁的選單，再點「分享」。',
              '選擇「加入主畫面」；若出現「以 Web App 開啟」，請保持開啟，再點「加入」。',
              '回到 iPhone／iPad 主畫面，點 ChordMaster 圖示開啟，再進入演出模式。',
            ] : [
              'Open ChordMaster in Safari. Open the menu beside the address bar, then tap Share.',
              'Choose Add to Home Screen. Leave Open as Web App enabled if shown, then tap Add.',
              'Go to your iPhone or iPad Home Screen. Open the ChordMaster icon, then enter Performance Mode.',
            ])
            : (zh ? [
              '開啟瀏覽器選單，選擇「安裝應用程式」或「加入主畫面」。',
              '完成安裝後，從 ChordMaster 圖示開啟，再進入演出模式。',
            ] : [
              'Open the browser menu and choose Install app or Add to Home Screen.',
              'After installing, open the ChordMaster icon and enter Performance Mode.',
            ]))
            .map(step => <li key={step}>{step}</li>)}
        </ol>
        <p className="mt-5 text-gray-500">{zh ? '時間、電量與底部手勢區域仍由系統管理。' : 'The system still controls the clock, battery indicators, and home gesture area.'}</p>
      </div>
    </ResponsiveDialog>}
  </>;
}
