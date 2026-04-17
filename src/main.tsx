import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from './App.tsx';
import AuthCallbackPage from './pages/AuthCallbackPage.tsx';
import SharedChartPage from './pages/SharedChartPage.tsx';
import './index.css';

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
