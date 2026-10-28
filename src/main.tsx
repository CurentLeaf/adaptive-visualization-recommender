import React from 'react';
import ReactDOM from 'react-dom/client';
import StudyApp from './study/StudyApp';
import './styles/index.css';
const ResearcherApp = React.lazy(() => import('./app/App'));
const researcher =
  new URLSearchParams(window.location.search).get('mode') === 'researcher' &&
  window.parent === window;
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <React.Suspense fallback={<p style={{ padding: 32 }}>Loading workspace…</p>}>
      {researcher ? <ResearcherApp /> : <StudyApp />}
    </React.Suspense>
  </React.StrictMode>,
);
