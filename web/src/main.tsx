import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Provider dùng CHUNG với app native — toàn bộ luật game, state, đồng bộ nằm trong đây.
import { AppProvider } from '@app/AppContext';
import { ThemeProvider } from '@app/theme-context';
import App from '@web/ui/App';
import '@web/styles/global.css';

const el = document.getElementById('root');
if (!el) throw new Error('#root không tồn tại');

createRoot(el).render(
  <StrictMode>
    <ThemeProvider>
      <AppProvider>
        <App />
      </AppProvider>
    </ThemeProvider>
  </StrictMode>
);
