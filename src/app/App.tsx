import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  RotateCcw,
  SlidersHorizontal,
  Database,
  ChartNoAxesCombined,
  Info,
} from 'lucide-react';
import { VegaChart } from '../components/charts/VegaChart';
import {
  FictionalGridPlot,
  ObservationTimeline,
  ReportComparisonTable,
} from '../components/charts/SituationEvidenceViews';
import {
  createDefaultParallelRanges,
  filterByDimensionRanges,
  ParallelCoordinates,
  type DimensionRanges,
} from '../components/charts/ParallelCoordinates';
import { ProfilePanel } from '../components/dashboard/ProfilePanel';
import { EvidencePanel } from '../components/details/EvidencePanel';
import { dataset } from '../data/seedData';
import { DATA_LABEL, DEFAULT_WEIGHTS, SCENARIOS, TASKS } from '../domain/constants';
import {
  DEFAULT_MISSION_CONTEXT,
  ECHELONS,
  MDMP_PHASES,
  MDMP_TASK_PRESETS,
  TIME_HORIZONS,
  VARIABLE_CLASSES,
  loadMissionContext,
  presetForAnalyticTask,
} from '../domain/mdmp';
import type {
  AnalyticTask,
  AudienceMode,
  Echelon,
  EvaluationRecord,
  Filters,
  InteractionEvent,
  MdmpPhase,
  MdmpTaskPresetId,
  MissionContext,
  RecommendationFeedback,
  SalienceWeights,
  ScenarioId,
  TimeHorizon,
  VariableClass,
  VisualizationRecommendation,
} from '../domain/types';
import {
  answerOptions,
  clearEvaluations,
  evaluationSummary,
  expectedAnswer,
  exportEvaluations,
  loadEvaluations,
  saveEvaluation,
} from '../lib/evaluation';
import { analyzeReports } from '../lib/analysis';
import { recommendModels } from '../lib/modelSelection';
import { profileReports } from '../lib/profiler';
import { scoreSalience } from '../lib/salience';
import { createBaselineSpec, createVegaSpec } from '../lib/vegaSpecFactory';
import { recommend } from '../lib/recommendationEngine';
import {
  loadRecommendationFeedback,
  recentUsefulRecommendations,
  saveRecommendationFeedback,
} from '../lib/recommendationFeedback';
import { buildSituationSummary } from '../lib/situationNarrative';
import { RecommendationCard } from '../components/dashboard/RecommendationCard';

const emptyFilters: Filters = {
  start: '',
  end: '',
  region: '',
  category: '',
  sourceType: '',
  minConfidence: 0,
  minValidation: 0,
  minConflict: 0,
  translation: '',
  verified: '',
};
const sessionId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
function downloadJson(name: string, object: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(object, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadSvgSnapshot(svg: SVGSVGElement, title: string, description: string) {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('role', 'img');
  const titleNode = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  titleNode.textContent = title;
  const descriptionNode = document.createElementNS('http://www.w3.org/2000/svg', 'desc');
  descriptionNode.textContent = description;
  copy.prepend(descriptionNode);
  copy.prepend(titleNode);
  const blob = new Blob([new XMLSerializer().serializeToString(copy)], {
    type: 'image/svg+xml;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-brief.svg`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const sourceMap = new Map(dataset.sources.map((s) => [s.source_id, s]));
const modelMap = new Map(dataset.model_outputs.map((m) => [m.report_id, m]));
const provenanceMap = new Map(dataset.provenance.map((p) => [p.report_id, p]));
const locationsMap = new Map(dataset.locations.map((location) => [location.location_id, location]));
const scenarioIds = Object.keys(SCENARIOS) as ScenarioId[];
const taskIds = Object.keys(TASKS) as AnalyticTask[];
const presetMap = new Map(MDMP_TASK_PRESETS.map((preset) => [preset.id, preset]));
const initialPreset = presetForAnalyticTask(SCENARIOS.corroboration.task);
const mdmpPhaseIds = Object.keys(MDMP_PHASES) as MdmpPhase[];
const echelonIds = Object.keys(ECHELONS) as Echelon[];
const timeHorizonIds = Object.keys(TIME_HORIZONS) as TimeHorizon[];
const variableClassIds = Object.keys(VARIABLE_CLASSES) as VariableClass[];
function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
const allOption = (values: string[]) => [
  { value: '', label: 'All' },
  ...values.map((v) => ({ value: v, label: v })),
];

export default function App() {
  const [audience, setAudience] = useState<AudienceMode>(() =>
    localStorage.getItem('avr-audience-v1') === 'Analyst' ? 'Analyst' : 'Commander',
  );
  const [scenario, setScenario] = useState<ScenarioId>('corroboration');
  const [task, setTask] = useState<AnalyticTask>(SCENARIOS.corroboration.task);
  const [taskPreset, setTaskPreset] = useState<MdmpTaskPresetId>(initialPreset);
  const [missionContext, setMissionContext] = useState<MissionContext>(loadMissionContext);
  const [weights, setWeights] = useState<SalienceWeights>(DEFAULT_WEIGHTS);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [selectedId, setSelectedId] = useState('');
  const [chartId, setChartId] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [showMethod, setShowMethod] = useState(false);
  const [showDetailed, setShowDetailed] = useState(false);
  const [parallelRanges, setParallelRanges] = useState<DimensionRanges>(
    createDefaultParallelRanges,
  );
  const [answer, setAnswer] = useState('');
  const [researchNote, setResearchNote] = useState('');
  const [userConfidence, setUserConfidence] = useState(3);
  const [feedback, setFeedback] = useState('');
  const [logs, setLogs] = useState<EvaluationRecord[]>(() => loadEvaluations());
  const [recommendationFeedback, setRecommendationFeedback] = useState<RecommendationFeedback[]>(
    () => loadRecommendationFeedback(),
  );
  const [feedbackReason, setFeedbackReason] = useState('Fits the task');
  const [feedbackStatus, setFeedbackStatus] = useState('');
  const [interactions, setInteractions] = useState<InteractionEvent[]>([]);
  const startTime = useRef(Date.now());
  useEffect(() => {
    localStorage.setItem('avr-audience-v1', audience);
  }, [audience]);
  useEffect(() => {
    localStorage.setItem('avr-mission-context-v1', JSON.stringify(missionContext));
  }, [missionContext]);
  const track = useCallback(
    (type: string, value: string) =>
      setInteractions((old) => [...old, { type, value, timestamp: new Date().toISOString() }]),
    [],
  );
  const updateFilter = (key: keyof Filters, value: string | number) => {
    setFilters((old) => ({ ...old, [key]: value }));
    track('filter', `${key}:${value}`);
  };
  const applyQuickSlice = (label: string, nextFilters: Filters) => {
    setFilters(nextFilters);
    setParallelRanges(createDefaultParallelRanges());
    track('filter_slice', label);
  };
  const profile = useMemo(
    () => profileReports(dataset.reports.filter((r) => r.scenario_id === scenario)),
    [scenario],
  );
  const analysis = useMemo(
    () => analyzeReports(dataset.reports.filter((r) => r.scenario_id === scenario)),
    [scenario],
  );
  const rows = useMemo(
    () =>
      filterByDimensionRanges(
        dataset.reports.filter((report) => {
          const source = sourceMap.get(report.source_id);
          const day = report.report_time.slice(0, 10);
          return (
            report.scenario_id === scenario &&
            (!filters.start || day >= filters.start) &&
            (!filters.end || day <= filters.end) &&
            (!filters.region || report.region === filters.region) &&
            (!filters.category || report.event_category === filters.category) &&
            (!filters.sourceType || source?.source_type === filters.sourceType) &&
            report.source_confidence >= filters.minConfidence &&
            report.validation_score >= filters.minValidation &&
            report.conflict_score >= filters.minConflict &&
            (!filters.translation || report.translation_status === filters.translation) &&
            (!filters.verified || String(report.human_verified) === filters.verified)
          );
        }),
        parallelRanges,
      ),
    [scenario, filters, parallelRanges],
  );
  const chartData = useMemo(
    () =>
      rows.map((report) => {
        const output = modelMap.get(report.report_id)!;
        const derived = analysis.get(report.report_id)!;
        return {
          ...report,
          day: report.observed_at.slice(0, 10),
          source_type: sourceMap.get(report.source_id)?.source_type ?? 'unknown',
          source_display_name:
            sourceMap.get(report.source_id)?.display_name ?? 'Source name not recorded',
          uncertainty_lower: output.uncertainty_lower,
          uncertainty_upper: output.uncertainty_upper,
          z_score: derived.zScore,
          rolling_mean: derived.rollingMean,
          event_conflict: derived.eventConflict,
          distinct_source_count: derived.distinctSourceCount,
          salience: scoreSalience(report, weights).score,
          is_selected: report.report_id === selectedId,
        };
      }),
    [rows, weights, analysis, selectedId],
  );
  const models = useMemo(() => recommendModels(profile, task), [profile, task]);
  const recommendationResult = useMemo(
    () =>
      recommend({
        profile,
        task,
        modeling: models[0],
        weights,
        data: chartData,
        audience,
        context: missionContext,
      }),
    [profile, task, models, weights, chartData, audience, missionContext],
  );
  const recommendations = recommendationResult.ranked;
  const excludedRecommendations = recommendationResult.excluded;
  const selectedChart = recommendations.find((r) => r.id === chartId) ?? recommendations[0];
  useEffect(() => {
    if (!chartId && recommendations[0]) setChartId(recommendations[0].id);
  }, [chartId, recommendations]);
  const selectedReport = dataset.reports.find(
    (r) => r.report_id === selectedId && r.scenario_id === scenario,
  );
  const selectedSalience = selectedReport ? scoreSalience(selectedReport, weights) : undefined;
  const summary = evaluationSummary(logs);
  const situationSummary = useMemo(
    () => buildSituationSummary(rows, dataset.sources, audience === 'Commander'),
    [rows, audience],
  );
  const chooseScenario = (value: string) => {
    const id = value as ScenarioId;
    setScenario(id);
    setTask(SCENARIOS[id].task);
    setTaskPreset(presetForAnalyticTask(SCENARIOS[id].task));
    setFilters(emptyFilters);
    setParallelRanges(createDefaultParallelRanges());
    setSelectedId('');
    setChartId('');
    setShowComparison(false);
    setAnswer('');
    setResearchNote('');
    setFeedback('');
    startTime.current = Date.now();
    track('scenario', id);
  };
  const reset = () => {
    setScenario('corroboration');
    setTask('compare_categories');
    setTaskPreset(initialPreset);
    setMissionContext(DEFAULT_MISSION_CONTEXT);
    setWeights(DEFAULT_WEIGHTS);
    setFilters(emptyFilters);
    setParallelRanges(createDefaultParallelRanges());
    setSelectedId('');
    setChartId('');
    setShowComparison(false);
    setAnswer('');
    setResearchNote('');
    setFeedback('');
    setInteractions([]);
    startTime.current = Date.now();
  };
  const selectReport = useCallback(
    (id: string) => {
      setSelectedId(id);
      track('select_report', id);
    },
    [track],
  );
  const selectChartDatum = useCallback(
    (datum: Record<string, unknown>) => {
      if (typeof datum.report_id === 'string') {
        selectReport(datum.report_id);
        return;
      }
      const rawDay = datum.day;
      const day =
        rawDay instanceof Date
          ? rawDay.toISOString().slice(0, 10)
          : typeof rawDay === 'number'
            ? new Date(rawDay).toISOString().slice(0, 10)
            : typeof rawDay === 'string'
              ? rawDay.slice(0, 10)
              : undefined;
      const matching = rows.filter(
        (report) =>
          (typeof datum.event_category !== 'string' ||
            report.event_category === datum.event_category) &&
          (typeof datum.source_id !== 'string' || report.source_id === datum.source_id) &&
          (!day || report.report_time.slice(0, 10) === day),
      );
      const report = matching.find((item) => item.report_id === selectedId) ?? matching[0];
      if (report) selectReport(report.report_id);
    },
    [rows, selectedId, selectReport],
  );
  const inspectEvidence = () => {
    if (!selectedId && rows[0]) selectReport(rows[0].report_id);
    setShowEvidence(true);
  };
  const selectTaskPreset = (value: string) => {
    const preset = presetMap.get(value as MdmpTaskPresetId);
    if (!preset?.analyticTask) return;
    setTaskPreset(preset.id);
    setTask(preset.analyticTask);
    setMissionContext((old) => ({ ...old, mdmpPhase: preset.phase }));
    setChartId('');
    track('mdmp_task_preset', preset.id);
  };
  const openRecommendation = (recommendation: VisualizationRecommendation) => {
    setChartId(recommendation.id);
    setShowDetailed(true);
    track('open_recommendation', recommendation.id);
    const analysisView = document.getElementById('analysis-view');
    if (analysisView && typeof analysisView.scrollIntoView === 'function') {
      analysisView.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  const snapshotRecommendation = (recommendation: VisualizationRecommendation) => {
    const svg = document.querySelector('#analysis-view .chart svg, #analysis-view .parallel-svg');
    if (!(svg instanceof SVGSVGElement)) {
      setFeedbackStatus('The selected chart is not ready to export yet.');
      return;
    }
    downloadSvgSnapshot(
      svg,
      recommendation.title,
      `${recommendation.rationale.join(' ')} ${recommendation.doesNotEstablish} ${DATA_LABEL}`,
    );
    track('snapshot_for_brief', recommendation.id);
    setFeedbackStatus(
      'Chart snapshot downloaded as an accessible SVG with rationale and cautions.',
    );
  };
  const duplicateRecommendation = (recommendation: VisualizationRecommendation) => {
    downloadJson(
      `${recommendation.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-working-copy.json`,
      {
        title: `${recommendation.title} — working copy`,
        recommendation,
        analyticTask: task,
        missionContext,
        audienceMode: audience,
        filters,
        createdAt: new Date().toISOString(),
      },
    );
    track('duplicate_recommendation', recommendation.id);
    setFeedbackStatus(
      'Working-copy configuration downloaded. Its chart, rationale, audience, context, and filters are included.',
    );
  };
  const recordRecommendationFeedback = (
    recommendation: VisualizationRecommendation,
    decision: 'useful' | 'not_useful',
  ) => {
    const record: RecommendationFeedback = {
      recommendationId: recommendation.id,
      title: recommendation.title,
      chartPattern: recommendation.chartPattern,
      analyticTask: task,
      audienceMode: audience,
      context: missionContext,
      filteredRowCount: rows.length,
      dataCharacteristics: {
        rowCount: profile.rowCount,
        fieldCount: profile.fields.length,
        fieldsWithMissingValues: profile.fields
          .filter((field) => field.nullableCount > 0)
          .map((field) => field.name),
        uncertaintyFields: profile.uncertaintyFields,
        temporalFields: profile.temporalFields,
        quantitativeFields: profile.numericFields,
        categoricalFields: profile.categoricalFields,
      },
      decision,
      reason: feedbackReason,
      timestamp: new Date().toISOString(),
    };
    setRecommendationFeedback(saveRecommendationFeedback(record));
    setFeedbackStatus(`Feedback saved locally: ${decision.replace('_', ' ')} · ${feedbackReason}.`);
    track('recommendation_feedback', `${decision}:${recommendation.id}:${feedbackReason}`);
  };
  const brush = useCallback(
    (start: string, end: string) => {
      setFilters((old) => ({ ...old, start, end }));
      track('time_brush', `${start}..${end}`);
    },
    [track],
  );
  const submit = () => {
    if (!answer) return;
    const expected = expectedAnswer(scenario);
    const record: EvaluationRecord = {
      sessionId,
      scenarioId: scenario,
      analyticTask: task,
      missionContext,
      chartSelected: selectedChart?.id ?? '',
      schemaVersion: 2,
      questionId: `${scenario}-question-v1`,
      audienceMode: audience,
      filters,
      visualInteractions: interactions,
      selectedReports: selectedId ? [selectedId] : [],
      timeToAnswerMs: Date.now() - startTime.current,
      submittedAnswer: answer,
      expectedAnswer: expected,
      correct: answer === expected,
      userConfidence,
      timestamp: new Date().toISOString(),
      researchNote: researchNote.trim(),
    };
    setLogs(saveEvaluation(record));
    setFeedback(
      record.correct
        ? 'Correct for this synthetic scenario.'
        : `Synthetic reference answer: ${expected}. Review the evidence and try another scenario.`,
    );
    startTime.current = Date.now();
  };
  const range = (key: 'minConfidence' | 'minValidation' | 'minConflict', label: string) => (
    <label className="field range">
      <span>
        {label} ≥ {Math.round(filters[key] * 100)}%
      </span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={filters[key]}
        onChange={(event) => updateFilter(key, Number(event.target.value))}
      />
    </label>
  );
  return (
    <div className="app-shell">
      <header className="site-header">
        <div>
          <div className="eyebrow">VISUALIZATION RESEARCH PROTOTYPE</div>
          <h1>Adaptive Visualization Recommender</h1>
          <p>
            Cedar Watch fictional training exercise · reported observations, uncertainty, and
            provenance
          </p>
        </div>
        <div className="header-actions">
          <div className="warning">{DATA_LABEL}</div>
          <label className="field audience-select">
            <span>Audience</span>
            <select
              value={audience}
              onChange={(event) => setAudience(event.target.value as AudienceMode)}
            >
              <option value="Commander">Commander</option>
              <option value="Analyst">Analyst</option>
            </select>
            <small>Changes presentation complexity, not the underlying evidence.</small>
          </label>
          <Select
            label="Research scenario"
            value={scenario}
            options={scenarioIds.map((id) => ({ value: id, label: SCENARIOS[id].label }))}
            onChange={chooseScenario}
          />
          <button className="button ghost" onClick={reset}>
            <RotateCcw size={16} /> Reset app
          </button>
        </div>
      </header>
      <div className="layout">
        <aside className="panel controls">
          <section aria-labelledby="task-context-heading">
            <div className="module-heading">
              <span className="module-number">1</span>
              <div>
                <h2 id="task-context-heading">Task &amp; Context</h2>
                <p>Frame the question for an MDMP phase and audience.</p>
              </div>
            </div>
            <Select
              label="MDMP task preset"
              value={taskPreset}
              options={MDMP_TASK_PRESETS.map((preset) => ({
                value: preset.id,
                label: preset.analyticTask
                  ? preset.label
                  : `${preset.label} — unavailable in this dataset`,
                disabled: !preset.analyticTask,
              }))}
              onChange={selectTaskPreset}
            />
            <p className="help">{presetMap.get(taskPreset)?.description}</p>
            <p className="metadata-caveat" role="note">
              Not available yet: no COA identifiers, outcome measures, or COA uncertainty; no
              operational risk measures; no structured enemy order-of-battle fields; and no spatial
              recommender rule.
            </p>
            {presetMap.get(taskPreset)?.requirement && (
              <p className="metadata-caveat" role="note">
                Not recommended: {presetMap.get(taskPreset)?.requirement}
              </p>
            )}
            <Select
              label="MDMP phase"
              value={missionContext.mdmpPhase}
              options={mdmpPhaseIds.map((id) => ({ value: id, label: MDMP_PHASES[id] }))}
              onChange={(value) =>
                setMissionContext((old) => ({ ...old, mdmpPhase: value as MdmpPhase }))
              }
            />
            <Select
              label="Echelon"
              value={missionContext.echelon}
              options={echelonIds.map((id) => ({ value: id, label: ECHELONS[id] }))}
              onChange={(value) =>
                setMissionContext((old) => ({ ...old, echelon: value as Echelon }))
              }
            />
            <Select
              label="Time horizon"
              value={missionContext.timeHorizon}
              options={timeHorizonIds.map((id) => ({ value: id, label: TIME_HORIZONS[id] }))}
              onChange={(value) =>
                setMissionContext((old) => ({ ...old, timeHorizon: value as TimeHorizon }))
              }
            />
            <Select
              label="Variable class"
              value={missionContext.variableClass}
              options={variableClassIds.map((id) => ({ value: id, label: VARIABLE_CLASSES[id] }))}
              onChange={(value) =>
                setMissionContext((old) => ({ ...old, variableClass: value as VariableClass }))
              }
            />
            <p className="help">
              Intended audience: <strong>{audience} view</strong>. Context frames this fictional
              exercise; it does not create missing operational data.
            </p>
          </section>
          <section className="filter-module" aria-labelledby="data-filters-heading">
            <div className="module-heading">
              <span className="module-number">2</span>
              <div>
                <h2 id="data-filters-heading">Data &amp; Filters</h2>
                <p>
                  {rows.length} of {profile.rowCount} scenario reports in view.
                </p>
              </div>
            </div>
            <p className="help">Common evidence slices</p>
            <div className="slice-actions">
              <button
                className="button ghost"
                type="button"
                onClick={() => applyQuickSlice('all scenario reports', emptyFilters)}
              >
                All scenario reports
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() =>
                  applyQuickSlice('elevated disagreement', {
                    ...emptyFilters,
                    minConflict: 0.5,
                  })
                }
              >
                Elevated disagreement
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() =>
                  applyQuickSlice('verification not recorded', {
                    ...emptyFilters,
                    verified: 'false',
                  })
                }
              >
                Verification not recorded
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() =>
                  applyQuickSlice('machine-translated reports', {
                    ...emptyFilters,
                    translation: 'machine',
                  })
                }
              >
                Machine-translated reports
              </button>
            </div>
            <div className="unavailable-slices">
              <p className="help">
                Not available for this dataset: COA 1 vs COA 2 at D+2 (no COA/time outcome fields);
                high-risk areas by terrain (no risk or terrain measures).
              </p>
            </div>
            <div className="button-row">
              <button
                className="button secondary"
                type="button"
                onClick={() => setShowProfile((old) => !old)}
              >
                <Database size={16} /> {showProfile ? 'Hide' : 'Show'} field metadata
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() => {
                  setFilters(emptyFilters);
                  setParallelRanges(createDefaultParallelRanges());
                  track('reset_filters', 'all');
                }}
              >
                Reset
              </button>
            </div>
            <div className="two-fields">
              <label className="field">
                <span>Observed from</span>
                <input
                  type="date"
                  value={filters.start}
                  onChange={(event) => updateFilter('start', event.target.value)}
                />
              </label>
              <label className="field">
                <span>Observed through</span>
                <input
                  type="date"
                  value={filters.end}
                  onChange={(event) => updateFilter('end', event.target.value)}
                />
              </label>
            </div>
            <Select
              label="Fictional location"
              value={filters.region}
              options={allOption([...new Set(dataset.reports.map((r) => r.region))])}
              onChange={(value) => updateFilter('region', value)}
            />
            <Select
              label="Observation type"
              value={filters.category}
              options={allOption([...new Set(dataset.reports.map((r) => r.event_category))])}
              onChange={(value) => updateFilter('category', value)}
            />
            <Select
              label="Source type"
              value={filters.sourceType}
              options={allOption([...new Set(dataset.sources.map((s) => s.source_type))])}
              onChange={(value) => updateFilter('sourceType', value)}
            />
            {range('minConfidence', 'Source confidence')}
            {range('minValidation', 'Validation score')}
            {range('minConflict', 'Conflict score')}
            <Select
              label="Translation"
              value={filters.translation}
              options={[
                { value: '', label: 'All' },
                { value: 'original', label: 'Original exercise-language report' },
                { value: 'machine', label: 'Machine translated' },
                { value: 'reviewed', label: 'Translation reviewed' },
              ]}
              onChange={(value) => updateFilter('translation', value)}
            />
            <Select
              label="Human verification"
              value={filters.verified}
              options={[
                { value: '', label: 'All' },
                { value: 'true', label: 'Recorded' },
                { value: 'false', label: 'Not recorded' },
              ]}
              onChange={(value) => updateFilter('verified', value)}
            />
            <button
              className="button primary full"
              type="button"
              onClick={() => {
                setChartId('');
                track('generate_recommendations', task);
              }}
            >
              Refresh recommendations
            </button>
          </section>
          <details open={audience === 'Analyst'}>
            <summary>
              <SlidersHorizontal size={18} />{' '}
              {audience === 'Analyst' ? 'Analyst controls' : 'Advanced controls'}
            </summary>
            <div className="controls-content">
              <p className="muted">{SCENARIOS[scenario].description}</p>
              <Select
                label="Analytic task"
                value={task}
                options={taskIds.map((id) => ({ value: id, label: TASKS[id].label }))}
                onChange={(value) => {
                  setTask(value as AnalyticTask);
                  setTaskPreset(presetForAnalyticTask(value as AnalyticTask));
                  setChartId('');
                  track('task', value);
                }}
              />
              <p className="help">
                Advanced analytic tasks provide lower-level rule selection; the MDMP preset remains
                the user-facing question.
              </p>
              <p className="help">{TASKS[task].description}</p>
              <h3>Salience weights</h3>
              <p className="help">
                Salience measures attention priority, not truthfulness. Each component is normalized
                to 0–1.
              </p>
              <div className="formula">S = Σ (weight × component) / Σ weights</div>
              {(Object.keys(weights) as (keyof SalienceWeights)[]).map((key) => (
                <label className="field range" key={key}>
                  <span>
                    {key.replace(/([A-Z])/g, ' $1')} · {weights[key].toFixed(1)}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="3"
                    step="0.1"
                    value={weights[key]}
                    onChange={(event) => {
                      setWeights((old) => ({ ...old, [key]: Number(event.target.value) }));
                      track('weight', key);
                    }}
                  />
                </label>
              ))}
            </div>
          </details>
        </aside>
        <main className="workspace">
          {showProfile && <ProfilePanel profile={profile} />}
          <section className="panel overview">
            <div className="section-title">
              <ChartNoAxesCombined size={20} />
              <div>
                <h2>Situation overview</h2>
                <p>
                  Cedar Watch · {SCENARIOS[scenario].label} · {rows.length} source-reported
                  observation{rows.length === 1 ? '' : 's'} visible
                </p>
                <p className="analytic-question">
                  <strong>Exercise question:</strong> {SCENARIOS[scenario].question}
                </p>
              </div>
            </div>
            <p className="situation-summary">{situationSummary}</p>
            <div className="notice">
              <Info size={16} />
              <span>
                Reports may describe the same items. Counts are not a verified total inventory and
                are not summed. Source confidence, validation, translation, verification, and
                disagreement are separate indicators; none establishes truth. High salience means
                attention priority, not verified truth.
              </span>
            </div>
            <div className="button-row">
              <button
                className="button secondary"
                type="button"
                aria-expanded={audience === 'Analyst' || showComparison}
                onClick={() => {
                  setShowComparison((old) => !old);
                  track('compare_reports', scenario);
                }}
              >
                {showComparison ? 'Hide report comparison' : 'Compare reports'}
              </button>
              <button className="button primary" type="button" onClick={inspectEvidence}>
                Inspect evidence
              </button>
            </div>
          </section>
          {(audience === 'Analyst' || showComparison) && (
            <>
              <ReportComparisonTable
                reports={rows}
                sources={dataset.sources}
                selectedId={selectedId}
                onSelect={selectReport}
              />
              <ObservationTimeline
                reports={rows}
                sources={dataset.sources}
                selectedId={selectedId}
                onSelect={selectReport}
              />
              {audience === 'Analyst' && (
                <FictionalGridPlot
                  reports={rows}
                  locations={dataset.locations}
                  onSelect={selectReport}
                />
              )}
            </>
          )}
          <section className="panel recommendation-summary">
            <div className="section-title">
              <div className="module-heading">
                <span className="module-number">3</span>
                <div>
                  <h2>Recommendations &amp; Rationale</h2>
                  <p>{recommendationResult.explanation}</p>
                </div>
              </div>
              <span className="pill">Rule-based heuristic</span>
            </div>
            {selectedChart ? (
              <>
                <h3>{selectedChart.title}</h3>
                <p>
                  <strong>Question answered:</strong> {selectedChart.answersQuestion}
                </p>
                <p>
                  <strong>Technique:</strong> {selectedChart.technique} · <strong>Modeling:</strong>{' '}
                  {selectedChart.modelingTechnique}
                </p>
                <p>{selectedChart.rationale[0]}</p>
                <p className="help">
                  <strong>Does not establish:</strong> {selectedChart.doesNotEstablish}
                </p>
                <p>
                  <strong>Visualization suitability: {selectedChart.suitabilityScore}/100.</strong>{' '}
                  Rule-based fit score, not report confidence.
                </p>
                <p className="help">
                  Active visualization: <strong>{selectedChart.title}</strong>. A mode change can
                  change ranking, but never silently changes the active visualization.
                </p>
                {selectedChart.rank > 1 && recommendations[0] && (
                  <p className="uncertainty-cautions" role="status">
                    {selectedChart.title} is ranked #{selectedChart.rank} for {audience} mode.
                    {recommendations[0].title} ranks higher; the active chart remains selected until
                    you choose “Use this visualization.”
                  </p>
                )}
                <div className="button-row">
                  <button className="button secondary" type="button" onClick={inspectEvidence}>
                    Inspect evidence
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => setShowAlternatives((value) => !value)}
                  >
                    {showAlternatives ? 'Hide alternatives' : 'View alternatives'}
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => setShowMethod((value) => !value)}
                  >
                    {showMethod ? 'Hide method and inputs' : 'Show method and inputs'}
                  </button>
                  <button
                    className="button primary"
                    type="button"
                    onClick={() => setShowDetailed(true)}
                  >
                    Open detailed analysis
                  </button>
                </div>
                <p className="help">High salience means attention priority, not verified truth.</p>
              </>
            ) : (
              <p className="empty">
                No compatible visualization is available for this task and these fields.
              </p>
            )}
            {showMethod && selectedChart && (
              <details open>
                <summary>Modeling method, inputs, outputs, and score components</summary>
                <p>
                  <strong>Visualization:</strong> {selectedChart.technique}. <strong>Unit:</strong>{' '}
                  {selectedChart.unitOfAnalysis}.
                </p>
                <p>
                  <strong>Required inputs:</strong> {selectedChart.requiredInputFields.join(', ')}.
                </p>
                <p>
                  <strong>Optional inputs:</strong>{' '}
                  {selectedChart.optionalInputFields.join(', ') || 'None'}.
                </p>
                <p>
                  <strong>Fields used:</strong> {selectedChart.fieldsUsed.join(', ')}.
                </p>
                <p>
                  <strong>Derived outputs:</strong>{' '}
                  {selectedChart.derivedOutputFields.join(', ') || 'None recorded'}.
                </p>
                <p>
                  <strong>Modeling inputs:</strong>{' '}
                  {models[0]?.inputFields.join(', ') || 'None recorded'} ·{' '}
                  <strong>Model outputs:</strong>{' '}
                  {models[0]?.outputFields.join(', ') || 'None recorded'}.
                </p>
                <p>
                  <strong>Score:</strong>{' '}
                  {Object.entries(selectedChart.scoreBreakdown)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(' · ')}{' '}
                  = {selectedChart.suitabilityScore}.
                </p>
                <p>{selectedChart.rationale.join(' ')}</p>
                <p>{selectedChart.doesNotEstablish}</p>
                <p>{selectedChart.cautions.join(' ')}</p>
              </details>
            )}
          </section>
          <section className="panel">
            <div className="section-title">
              <h2>Ranked options</h2>
              <span className="pill">
                {audience === 'Commander' ? 'Top 3' : 'Top 5'} · active chart stays explicit
              </span>
            </div>
            <p className="help">
              Recommendations are ranked for this question, available fields, uncertainty,
              provenance, and audience. Suitability is not confidence or truth.
            </p>
            <div className="recommendations">
              {recommendations
                .slice(
                  0,
                  showAlternatives ? recommendations.length : audience === 'Commander' ? 3 : 5,
                )
                .map((recommendation) => (
                  <RecommendationCard
                    key={recommendation.id}
                    recommendation={recommendation}
                    active={selectedChart?.id === recommendation.id}
                    snapshotDisabled={selectedChart?.id !== recommendation.id}
                    feedbackReason={feedbackReason}
                    lastDecision={
                      recommendationFeedback
                        .slice()
                        .reverse()
                        .find((entry) => entry.recommendationId === recommendation.id)?.decision
                    }
                    onFeedbackReasonChange={setFeedbackReason}
                    onFeedback={(decision) =>
                      recordRecommendationFeedback(recommendation, decision)
                    }
                    onOpen={() => openRecommendation(recommendation)}
                    onSnapshot={() => snapshotRecommendation(recommendation)}
                    onDuplicate={() => duplicateRecommendation(recommendation)}
                  />
                ))}
            </div>
            {recommendations.length > (audience === 'Commander' ? 3 : 5) && (
              <button
                className="button secondary"
                type="button"
                onClick={() => setShowAlternatives((value) => !value)}
              >
                {showAlternatives ? 'Show fewer options' : 'Show remaining alternatives'}
              </button>
            )}
            {feedbackStatus && (
              <p className="feedback" role="status">
                {feedbackStatus}
              </p>
            )}
            {recentUsefulRecommendations(recommendationFeedback).length > 0 && (
              <details className="recent-useful">
                <summary>Recent useful visualizations · saved on this browser</summary>
                <ul>
                  {recentUsefulRecommendations(recommendationFeedback).map((entry) => (
                    <li key={`${entry.recommendationId}-${entry.timestamp}`}>
                      {entry.title} · {TASKS[entry.analyticTask].label} · {entry.audienceMode} ·{' '}
                      {entry.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <details className="why-not">
              <summary>Why not other visualization types?</summary>
              <p className="help">
                These alternatives are excluded by task fit or the available data; add the stated
                fields before treating them as viable.
              </p>
              <ul>
                <li>
                  <strong>Pie chart:</strong> omitted for report comparisons because aligned
                  positions support count comparison more accurately than angles, especially when
                  sources disagree.
                </li>
                <li>
                  <strong>3D chart:</strong> omitted because no task or field requires depth and the
                  added perspective would make a brief harder to read.
                </li>
                <li>
                  <strong>Choropleth:</strong> unavailable because the exercise contains fictional
                  point coordinates, not validated area boundaries or polygon-level measures.
                </li>
                <li>
                  <strong>Network graph:</strong> unavailable because the data has no structured
                  relationship or dependency network suitable for a graph.
                </li>
                {excludedRecommendations.slice(0, 8).map((item) => (
                  <li key={item.title}>
                    <strong>{item.title}:</strong> {item.reason}
                  </li>
                ))}
              </ul>
            </details>
          </section>
          <section className="panel chart-panel" id="analysis-view">
            <div className="section-title">
              <div>
                <h2>{selectedChart?.title ?? 'No compatible chart'}</h2>
                <p>
                  {selectedChart?.technique} · {selectedChart?.unitOfAnalysis} ·{' '}
                  {selectedChart?.rationale[0]}
                </p>
              </div>
            </div>
            {rows.length > 0 && selectedChart?.chartPattern === 'parallel_coordinates' ? (
              <ParallelCoordinates
                records={chartData}
                selectedId={selectedId}
                audience={audience}
                ranges={parallelRanges}
                onRangesChange={setParallelRanges}
                onSelect={selectReport}
              />
            ) : rows.length > 0 && selectedChart ? (
              <VegaChart
                spec={selectedChart.vegaLiteSpec}
                onSelect={selectReport}
                onSelectDatum={selectChartDatum}
                onBrush={brush}
                ariaLabel={`${selectedChart.technique}. ${selectedChart.unitOfAnalysis}. ${selectedChart.title}`}
              />
            ) : (
              <p className="empty">No reports match the filters. Reset filters to continue.</p>
            )}
            <p className="caption">
              {selectedChart?.cautions[0]} Select report marks or use the selectable data table to
              inspect evidence. Use time brushing on time charts.
            </p>
            <details>
              <summary>Level 4 · Export visualization specification</summary>
              <button
                className="button secondary"
                disabled={!selectedChart}
                onClick={() =>
                  selectedChart && downloadJson('vega-lite-spec.json', selectedChart.vegaLiteSpec)
                }
              >
                <Download size={15} /> Export Vega-Lite specification
              </button>
            </details>
          </section>
          <details className="detailed-analysis" open={audience === 'Analyst' || showDetailed}>
            <summary>
              {audience === 'Analyst'
                ? 'Detailed analysis · expanded by default'
                : 'Level 4 · Open detailed analysis'}
            </summary>
            <div className="linked-grid">
              <section className="panel">
                <h2>Time and uncertainty</h2>
                <p className="help">
                  Technique: Error-band chart · Modeling: Uncertainty interval display · Unit: day.
                  Required inputs: report_time, reported_value. Model outputs: illustrative
                  uncertainty_lower/uncertainty_upper. Mapping: day → x; mean reported value → line;
                  synthetic bounds → band.
                </p>
                {rows.length > 0 && (
                  <VegaChart
                    spec={createVegaSpec('error_band', chartData)}
                    onSelectDatum={selectChartDatum}
                    onBrush={brush}
                    ariaLabel="Error-band chart of mean reported values and synthetic illustrative bounds by day"
                  />
                )}
              </section>
              <section className="panel">
                <h2>Fictional spatial context</h2>
                <p className="help">
                  Technique: Scatterplot (fictional coordinates) · Modeling: direct coordinate
                  display; no inferential model · Unit: one report per point. Inputs: latitude,
                  longitude, event_category, human_verified. Mapping: longitude → x, latitude → y,
                  category → color, verification → verbal shape label.
                </p>
                {rows.length > 0 && (
                  <VegaChart
                    spec={createVegaSpec('map', chartData)}
                    onSelect={selectReport}
                    onSelectDatum={selectChartDatum}
                    ariaLabel="Scatterplot of fictional longitude and latitude coordinates, one report per point"
                  />
                )}
              </section>
              <section className="panel">
                <h2>Confidence and validation</h2>
                <p className="help">
                  Technique: Scatterplot · Modeling: Data-quality assessment · Unit: one report per
                  point. Required inputs: source_confidence, validation_score. Optional inputs:
                  event_category, human_verified, report_id. Mapping: confidence → x, validation →
                  y, category → color, verification → verbal shape label.
                </p>
                {rows.length > 0 && (
                  <VegaChart
                    spec={createVegaSpec('scatter', chartData)}
                    onSelect={selectReport}
                    onSelectDatum={selectChartDatum}
                    ariaLabel="Scatterplot of source confidence versus validation score, one report per point"
                  />
                )}
              </section>
              <section className="panel">
                <h2>Baseline comparison</h2>
                <p className="help">
                  Technique: Bar chart · Modeling: Descriptive aggregation · Unit: event category.
                  Input: event_category; derived output: report_count. Mapping: category → x, count
                  → y. This baseline omits uncertainty, provenance, and within-group disagreement.
                </p>
                {rows.length > 0 && (
                  <VegaChart
                    spec={createBaselineSpec(chartData)}
                    onSelectDatum={selectChartDatum}
                    ariaLabel="Bar chart of report counts by event category"
                  />
                )}
              </section>
              <section className="panel">
                <ParallelCoordinates
                  records={chartData}
                  selectedId={selectedId}
                  audience={audience}
                  ranges={parallelRanges}
                  onRangesChange={setParallelRanges}
                  onSelect={selectReport}
                />
              </section>
            </div>
            <section className="panel">
              <h2>Model selection</h2>
              <div className="model-grid">
                {models.map((model) => (
                  <article key={model.technique}>
                    <strong>
                      {model.technique} · {model.suitabilityScore}/100
                    </strong>
                    <p>{model.reason}</p>
                    <small>
                      Inputs: {model.inputFields.join(', ')} · Outputs:{' '}
                      {model.outputFields.join(', ')}
                    </small>
                    <p className="help">
                      Assumption: {model.assumptions[0]} Limitation: {model.limitations[0]}
                    </p>
                  </article>
                ))}
              </div>
            </section>
            {showProfile && <ProfilePanel profile={profile} />}
          </details>
        </main>
        {(audience === 'Analyst' || showEvidence) && (
          <EvidencePanel
            report={selectedReport}
            source={selectedReport && sourceMap.get(selectedReport.source_id)}
            sources={dataset.sources}
            relatedReports={
              selectedReport
                ? dataset.reports.filter(
                    (report) =>
                      report.event_id === selectedReport.event_id &&
                      report.report_id !== selectedReport.report_id,
                  )
                : []
            }
            location={selectedReport && locationsMap.get(selectedReport.location_id)}
            provenance={selectedReport && provenanceMap.get(selectedReport.report_id)}
            output={selectedReport && modelMap.get(selectedReport.report_id)}
            analysis={selectedReport && analysis.get(selectedReport.report_id)}
            salience={selectedSalience}
            recommendation={selectedChart}
            modeling={models[0]}
            audience={audience}
            onClose={audience === 'Commander' ? () => setShowEvidence(false) : undefined}
          />
        )}
      </div>
      <details className="evaluation-disclosure" open={audience === 'Analyst' || showDetailed}>
        <summary>Level 4 · Local evaluation tools</summary>
        <section className="panel evaluation">
          <div>
            <div className="eyebrow">LOCAL RESEARCH EVALUATION</div>
            <h2>{SCENARIOS[scenario].question}</h2>
            <p className="help">
              Choose from synthetic IDs or days. Answers and interactions stay in this browser until
              exported or cleared.
            </p>
            <div className="evaluation-form">
              <Select
                label="Response"
                value={answer}
                options={[
                  { value: '', label: 'Select an answer' },
                  ...answerOptions(scenario).map((v) => ({ value: v, label: v })),
                ]}
                onChange={setAnswer}
              />
              <label className="field">
                <span>Your confidence · {userConfidence}/5</span>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={userConfidence}
                  onChange={(event) => setUserConfidence(Number(event.target.value))}
                />
              </label>
              <button className="button primary" disabled={!answer} onClick={submit}>
                Submit response
              </button>
            </div>
            <label className="field research-note">
              <span>Qualified research interpretation (optional; synthetic evidence only)</span>
              <textarea
                maxLength={2000}
                rows={3}
                value={researchNote}
                onChange={(event) => setResearchNote(event.target.value)}
              />
            </label>
            <p className="help">
              A note is saved only with a submitted local evaluation and is included in its JSON
              export.
            </p>
            {feedback && (
              <p className="feedback" role="status">
                {feedback}
              </p>
            )}
          </div>
          <div className="evaluation-stats">
            <h3>Session summary</h3>
            <p>
              {logs.length} completed · {Math.round(summary.accuracy * 100)}% accuracy
            </p>
            <p>
              Mean time: {summary.meanTimeSeconds.toFixed(1)} s · mean confidence:{' '}
              {summary.meanConfidence.toFixed(1)}/5
            </p>
            <p>
              Confidence calibration gap: {Math.round(summary.calibrationGap * 100)} percentage
              points
            </p>
            <p>{interactions.length} interactions in current task</p>
            <div className="button-row">
              <button className="button secondary" onClick={() => exportEvaluations(logs)}>
                <Download size={15} /> Export log
              </button>
              <button
                className="button ghost"
                onClick={() => {
                  clearEvaluations();
                  setLogs([]);
                  setFeedback('Local evaluation log cleared.');
                }}
              >
                Clear log
              </button>
            </div>
          </div>
        </section>
      </details>
      <footer>
        {DATA_LABEL} · Visualization research only · No real-world operational decision-making. ·{' '}
        <a href="/docs/usage-story.md">Read the two-audience usage story</a>
      </footer>
    </div>
  );
}
