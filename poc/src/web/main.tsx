import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ProvedorDoEditor } from './estado';
import './estilo.css';

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <ProvedorDoEditor>
      <App />
    </ProvedorDoEditor>
  </StrictMode>,
);
