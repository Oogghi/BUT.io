import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import { GroupProvider } from './GroupSession';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <GroupProvider>
        <App />
      </GroupProvider>
    </BrowserRouter>
  </StrictMode>,
);
