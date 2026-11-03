import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StudyApp } from './StudyApp';
import '../../src/styles/index.css';
import './study.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StudyApp />
  </StrictMode>,
);
