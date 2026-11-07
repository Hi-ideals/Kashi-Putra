import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles/app.css';
import './styles/depth.css';
import './styles/classic.css';
import './styles/admin-modern.css';
import './styles/public-modern.css';
import App from './App';
import { SettingsProvider } from './context/SettingsContext';
import { AuthProvider } from './context/AuthContext';
import { ConfirmHost } from './components/common';
import { registerSW } from './services/push';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <SettingsProvider>
        <AuthProvider>
          <App />
          <ConfirmHost />
          <Toaster position="top-center" toastOptions={{ duration: 3500, style: { fontSize: 14 } }} />
        </AuthProvider>
      </SettingsProvider>
    </BrowserRouter>
  </React.StrictMode>
);

if (import.meta.env.PROD) window.addEventListener('load', () => registerSW());
// Development: no offline cache (it would hide errors); remove any old service worker
else navigator.serviceWorker?.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
