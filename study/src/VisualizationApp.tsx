import { useEffect, useMemo, useRef, useState } from 'react';
import { FictionalGridPlot, ObservationTimeline, ReportComparisonTable } from '../../src/components/charts/SituationEvidenceViews';
import { VegaChart } from '../../src/components/charts/VegaChart';
import { EvidencePanel } from '../../src/components/details/EvidencePanel';
import { SCENARIOS } from '../../src/domain/constants';
import { containsTextMark, getScenarioView } from './studyModel';
import { createVisualizationHandshake, type VisualizationParams } from './visualizationContract';

export function VisualizationApp() {
  const [params, setParams] = useState<VisualizationParams | null>(null);
  const [error, setError] = useState('');
  const [generation, setGeneration] = useState(0);
  const [chartReadyGeneration, setChartReadyGeneration] = useState<number | null>(null);
  const bridgeRef = useRef<ReturnType<typeof createVisualizationHandshake> | null>(null);
  const paramsRef = useRef<VisualizationParams | null>(null);
  const generationRef = useRef(0);
  useEffect(() => {
    const origins = (import.meta.env.VITE_REVISIT_PARENT_ORIGINS ?? '').split(',').map((item: string) => item.trim()).filter(Boolean);
    const bridge = createVisualizationHandshake(window.location, window, document.referrer, origins,
      import.meta.env.DEV && import.meta.env.VITE_REVISIT_ALLOW_HTTP_LOOPBACK === 'true');
    bridgeRef.current = bridge;
    if (!bridge.enabled) setError('This visualization requires a trusted reVISit host and valid iframe parameters.');
    else bridge.start((received) => {
      if (!received) {
        paramsRef.current = null;
        generationRef.current += 1;
        setGeneration(generationRef.current);
        setChartReadyGeneration(null);
        setParams(null);
        setError('The trusted study host sent invalid or mismatched visualization parameters.');
      } else {
        setError('');
        if (paramsRef.current?.trialId !== received.trialId
        || paramsRef.current?.scenarioFamily !== received.scenarioFamily
        || paramsRef.current?.taskVariant !== received.taskVariant
        || paramsRef.current?.condition !== received.condition
        || paramsRef.current?.stimulusSeed !== received.stimulusSeed) {
          paramsRef.current = received;
          generationRef.current += 1;
          setGeneration(generationRef.current);
          setChartReadyGeneration(null);
          setSelectedReportId('');
          setSelectedRecommendationId('');
          setParams(received);
        }
      }
    });
    return () => bridge.dispose();
  }, []);
  const view = useMemo(() => params ? getScenarioView(params.scenarioFamily) : null, [params]);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [selectedRecommendationId, setSelectedRecommendationId] = useState('');
  const recommendation = view?.recommendations.find((item) => item.id === selectedRecommendationId) ?? view?.recommendations[0];
  const hasAsyncChart = Boolean(params?.condition === 'recommended' && recommendation && !containsTextMark(recommendation.vegaLiteSpec));
  useEffect(() => {
    if (params && view && (!hasAsyncChart || chartReadyGeneration === generation)) bridgeRef.current?.viewReady();
  }, [params, view, hasAsyncChart, chartReadyGeneration, generation]);
  if (error) return <main className="study-shell"><section role="alert"><h1>Visualization unavailable</h1><p>{error}</p></section></main>;
  if (!params || !view) return <main className="study-shell"><p role="status">Waiting for trusted study data…</p></main>;
  const selectedReport = view.reports.find((report) => report.report_id === selectedReportId);
  const relatedReports = selectedReport ? view.reports.filter((report) => report.event_id === selectedReport.event_id && report.report_id !== selectedReport.report_id) : [];
  return <main className="study-shell study-trial">
    <header className="study-header">
      <p className="study-kicker">Fictional synthetic evidence · {params.trialId}</p>
      <h1>{SCENARIOS[params.scenarioFamily].label}</h1>
      <p className="condition-label">{params.condition === 'baseline' ? 'Evidence-only view' : 'Task-aware recommended view'}</p>
      <section className="study-card"><h2>Scenario context</h2><p>{SCENARIOS[params.scenarioFamily].description}</p></section>
    </header>
    <p className="study-notice">Use only the reports shown. Missing values are not zero; repeated or derived reports are not independent evidence. These scripted reports do not reveal underlying event ground truth.</p>
    {params.condition === 'recommended' && <section className="study-card" aria-label="Task-aware recommendation">
      <h2>Recommendation for this task</h2>
      {recommendation && <>
        <p className="selected-chart-label"><strong>Selected chart:</strong> {recommendation.title} · {recommendation.technique}</p>
        <p>{recommendation.rationale.join(' ')}</p><p className="study-caution">{recommendation.doesNotEstablish}</p>
        <label className="study-field"><span>Select visualization</span><select value={selectedRecommendationId || recommendation.id} onChange={(event) => {
          bridgeRef.current?.viewNotReady();
          generationRef.current += 1;
          setGeneration(generationRef.current);
          setChartReadyGeneration(null);
          setSelectedRecommendationId(event.target.value);
        }}>{view.recommendations.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        {containsTextMark(recommendation.vegaLiteSpec)
          ? <ReportComparisonTable reports={view.reports} sources={view.data.sources} selectedId={selectedReportId} showInternalIds={false} onSelect={setSelectedReportId} />
          : <VegaChart key={`${params.trialId}:${generation}:${recommendation.id}`} spec={recommendation.vegaLiteSpec} onSelect={setSelectedReportId} onReady={() => {
            if (generationRef.current === generation) setChartReadyGeneration(generation);
          }} onError={() => {
            if (generationRef.current !== generation) return;
            bridgeRef.current?.viewNotReady();
            setChartReadyGeneration(null);
            setError('The recommended chart could not be rendered; the host was notified that the view is not ready.');
          }} ariaLabel={`Task-aware recommended ${recommendation.title}`} />}
      </>}
    </section>}
    <section className="study-card"><h2>Available evidence</h2>
      <ReportComparisonTable reports={view.reports} sources={view.data.sources} selectedId={selectedReportId} showInternalIds={false} onSelect={setSelectedReportId} />
      <ObservationTimeline reports={view.reports} sources={view.data.sources} selectedId={selectedReportId} onSelect={setSelectedReportId} />
      <FictionalGridPlot reports={view.reports} locations={view.data.locations} onSelect={setSelectedReportId} />
    </section>
    <EvidencePanel report={selectedReport} source={selectedReport ? view.data.sources.find((item) => item.source_id === selectedReport.source_id) : undefined}
      sources={view.data.sources} relatedReports={relatedReports}
      location={selectedReport ? view.data.locations.find((item) => item.location_id === selectedReport.location_id) : undefined}
      provenance={selectedReport ? view.data.provenance.find((item) => item.report_id === selectedReport.report_id) : undefined}
      output={selectedReport ? view.data.model_outputs.find((item) => item.report_id === selectedReport.report_id) : undefined}
      analysis={selectedReport ? view.analysis.get(selectedReport.report_id) : undefined}
      salience={selectedReport ? view.salience.get(selectedReport.report_id) : undefined}
      recommendation={params.condition === 'recommended' ? recommendation : undefined} modeling={view.modeling} audience="Analyst" collapseTechnicalDetails showTechnicalIdentifiers={false} />
  </main>;
}
