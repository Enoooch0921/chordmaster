import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from './App.tsx';
import AuthCallbackPage from './pages/AuthCallbackPage.tsx';
import SharedChartPage from './pages/SharedChartPage.tsx';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/share/:token" element={<SharedChartPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
