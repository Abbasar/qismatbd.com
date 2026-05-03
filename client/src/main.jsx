import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from 'sonner';
import App from './App';
import { StorefrontProvider } from './context/StorefrontContext';
import './index.css';
import { applyThemeToDocument, DEFAULT_THEME, loadThemeFromLocalStorage } from './utils/theme';
import { hydrateSession } from './utils/auth';

const cached = loadThemeFromLocalStorage();
applyThemeToDocument({
  primary: cached?.primary || DEFAULT_THEME.primary,
  sidebar: cached?.sidebar || DEFAULT_THEME.sidebar,
});
hydrateSession();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <StorefrontProvider>
          <App />
        </StorefrontProvider>
        <Toaster richColors position="top-center" closeButton duration={3200} />
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
);
