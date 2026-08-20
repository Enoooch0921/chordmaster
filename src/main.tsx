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
import { registerAppFontFaces, waitForAppFontsReady } from './lib/fontFaceAssets.ts';
import './index.css';

const appBaseUrl = import.meta.env.BASE_URL;
const routerBasename = appBaseUrl === './' ? '/' : appBaseUrl;
const historyBasePath = appBaseUrl === './' ? '' : appBaseUrl.replace(/\/$/, '');

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
    `${historyBasePath}${normalizedPath}${redirectQuery}${window.location.hash}`
  );
};

restoreGitHubPagesSpaRedirect();
registerAppFontFaces();

const registerServiceWorker = () => {
  if (
    !import.meta.env.PROD ||
    Capacitor.isNativePlatform() ||
    !('serviceWorker' in navigator)
  ) {
    return;
  }

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch((error) => {
        console.warn('ChordMaster service worker registration failed', error);
      });
  });
};

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
    window.history.replaceState(null, '', `${historyBasePath}${appPath}`);
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

registerServiceWorker();

const renderApp = () => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter basename={routerBasename}>
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
};

void Promise.race([
  waitForAppFontsReady(),
  new Promise((resolve) => window.setTimeout(resolve, 1200)),
]).finally(renderApp);
