import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/tokens.css';
import './styles/foundation.css';
import './index.css';
import './styles/app-theme.css';
import './shared/ui/ui.css';
import './shared/ui/feedback.css';
import './shared/ui/filter-panel.css';
import './shared/ui/media.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
