import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { validateSession } from '@/lib/auth';
import App from './App.tsx';
import './index.css';

// Validate session on app startup
validateSession().catch(console.error);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);