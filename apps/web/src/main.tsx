import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import { GroupProvider } from './GroupSession';
import { MotionPreferences } from './MotionPreferences';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <MotionPreferences>
        <GroupProvider>
          <App />
        </GroupProvider>
      </MotionPreferences>
    </BrowserRouter>
  </StrictMode>,
);
