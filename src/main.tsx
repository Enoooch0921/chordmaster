import { StrictMode } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from './App.tsx';
import AuthCallbackPage from './pages/AuthCallbackPage.tsx';
import SharedChartPage from './pages/SharedChartPage.tsx';
import TeamInvitePage from './pages/TeamInvitePage.tsx';
import { ToastProvider } from './components/Toast.tsx';
import './index.css';

const restoreGitHubPagesSpaRedirect = () => {
  const redirectSearch = window.location.search;
  if (!redirectSearch.startsWith('?/')) {
    return;
  }

  const redirectPathWithQuery = redirectSearch
    .slice(2)
    .replace(/~and~/g, '&');
  const queryStartIndex = redirectPathWithQuery.indexOf('&');
  const redirectPath = queryStartIndex >= 0
    ? redirectPathWithQuery.slice(0, queryStartIndex)
    : redirectPathWithQuery;
  const redirectQuery = queryStartIndex >= 0
    ? `?${redirectPathWithQuery.slice(queryStartIndex + 1)}`
    : '';
  const normalizedPath = redirectPath.startsWith('/')
    ? redirectPath
    : `/${redirectPath}`;

  window.history.replaceState(
    null,
    '',
    `${import.meta.env.BASE_URL.replace(/\/$/, '')}${normalizedPath}${redirectQuery}${window.location.hash}`
  );
};

restoreGitHubPagesSpaRedirect();

const resolveNativeAppPath = (nativeUrl: string) => {
  const url = new URL(nativeUrl);
  if (url.protocol !== 'chordmaster:') {
    return null;
  }

  const pathParts = [
    url.hostname,
    url.pathname.replace(/^\/+/, '')
  ].filter(Boolean);
  const path = `/${pathParts.join('/')}`.replace(/\/{2,}/g, '/');
  return `${path}${url.search}${url.hash}`;
};

if (Capacitor.isNativePlatform()) {
  void CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
    const appPath = resolveNativeAppPath(url);
    if (!appPath) {
      return;
    }

    await Browser.close().catch(() => undefined);
    const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
    window.history.replaceState(null, '', `${basePath}${appPath}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  // Suppress double-tap-to-zoom on iPad. The touch-action CSS occasionally lets
  // it slip through, so also block the synthesized zoom for a quick second tap
  // landing in roughly the same spot. Single taps and fast taps on different
  // targets are unaffected.
  let lastTouchEnd = 0;
  let lastTouchX = 0;
  let lastTouchY = 0;
  document.addEventListener(
    'touchend',
    (event) => {
      const now = Date.now();
      const touch = event.changedTouches[0];
      const x = touch?.clientX ?? 0;
      const y = touch?.clientY ?? 0;
      if (
        now - lastTouchEnd <= 300 &&
        Math.abs(x - lastTouchX) < 32 &&
        Math.abs(y - lastTouchY) < 32
      ) {
        event.preventDefault();
      }
      lastTouchEnd = now;
      lastTouchX = x;
      lastTouchY = y;
    },
    { passive: false }
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/share/:token" element={<SharedChartPage />} />
          <Route path="/team-invite/:token" element={<TeamInvitePage />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
