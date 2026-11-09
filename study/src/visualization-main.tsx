import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { VisualizationApp } from './VisualizationApp';
import '../../src/styles/index.css';
import './study.css';

createRoot(document.getElementById('root')!).render(<StrictMode><VisualizationApp /></StrictMode>);
