import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChartNoAxesCombined,
  ChevronDown,
  Download,
  FlaskConical,
  HelpCircle,
} from 'lucide-react';
import { VegaChart } from '../components/charts/VegaChart';
import { answerOptions } from '../lib/evaluation';
import type { ScenarioId } from '../domain/types';
import { createRevisitBridge } from './revisit';
import {
  exerciseClock,
  frequencyRows,
  orderAnswers,
  parseCondition,
  quantityLabel,
  scenarioReports,
  sourceName,
  STUDY_SCENARIOS,
  TECHNIQUE_LABELS,
  type StudyCondition,
} from './model';
import { studySpec } from './specs';
import '../styles/study.css';

type TrialRecord = {
  schemaVersion: 'avr-study/1';
  trialId: string;
  scenario: ScenarioId;
  technique: string;
  answer: string;
  confidence: number;
  elapsedMs: number;
  responseTimeMs: number;
  interactions: { type: string; value: string; elapsedMs: number }[];
  answerOrder: string[];
  completion: true;
  submittedAt: string;
};
const defaultCondition: StudyCondition = { scenario: 'corroboration', technique: 'dot' };
function previewCondition() {
  const query = new URLSearchParams(window.location.search);
  if (!query.has('scenario') && !query.has('technique')) return defaultCondition;
  const scenario = query.get('scenario') ?? 'corroboration';
  const technique =
    query.get('technique') ??
    (Object.hasOwn(STUDY_SCENARIOS, scenario)
      ? STUDY_SCENARIOS[scenario as ScenarioId].techniques[0]
      : undefined);
  return parseCondition({ scenario, technique });
}

function DataTable({ scenario }: { scenario: ScenarioId }) {
  const reports = scenarioReports(scenario);
  return (
    <div
      className="study-table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Scrollable assigned data table"
    >
      <table className="study-data-table">
        <caption>{STUDY_SCENARIOS[scenario].chartTitle}</caption>
        <thead>
          <tr>
            {(scenario === 'anomaly'
              ? ['Observation hour', 'Reports', 'Sources']
              : scenario === 'uncertain'
                ? ['Source', 'Observed', 'Received', 'Delay (hours)', 'Independence']
                : scenario === 'quality'
                  ? ['Source', 'Reported people', 'Translation', 'Human verification']
                  : ['Source', 'Reported trucks', 'Independence', 'Observed']
            ).map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {scenario === 'anomaly'
            ? frequencyRows().map((row) => (
                <tr key={row.hour}>
                  <th scope="row">{row.hour}</th>
                  <td>{row.reports}</td>
                  <td>{row.sources}</td>
                </tr>
              ))
            : reports.map((r) => (
                <tr key={r.report_id}>
                  <th scope="row">{sourceName(r.source_id)}</th>
                  {scenario === 'uncertain' ? (
                    <>
                      <td>{exerciseClock(r.observed_at)}</td>
                      <td>{exerciseClock(r.received_at)}</td>
                      <td>{r.receipt_delay_hours.toFixed(2).replace(/\.?0+$/, '')}</td>
                      <td>{r.source_independent ? 'Independent' : 'Relayed'}</td>
                    </>
                  ) : scenario === 'quality' ? (
                    <>
                      <td>{quantityLabel(r)}</td>
                      <td>
                        {r.translation_status === 'machine'
                          ? 'Machine translated'
                          : r.translation_status === 'reviewed'
                            ? 'Translation reviewed'
                            : 'Original language'}
                      </td>
                      <td>{r.human_verified ? 'Verified' : 'Not verified'}</td>
                    </>
                  ) : (
                    <>
                      <td>{quantityLabel(r)}</td>
                      <td>{r.source_independent ? 'Independent' : 'Relayed'}</td>
                      <td>{exerciseClock(r.observed_at)}</td>
                    </>
                  )}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

export default function StudyApp() {
  const embedded = window.parent !== window;
  const [condition, setCondition] = useState<StudyCondition | null>(() =>
    embedded ? null : previewCondition(),
  );
  const [configurationError, setConfigurationError] = useState('');
  const [stage, setStage] = useState<'briefing' | 'trial' | 'complete'>('briefing');
  const stageRef = useRef(stage);
  const [answer, setAnswer] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [chartReady, setChartReady] = useState(false);
  const [chartError, setChartError] = useState('');
  const [submissionError, setSubmissionError] = useState('');
  const [record, setRecord] = useState<TrialRecord | null>(null);
  const [trialId, setTrialId] = useState(
    () =>
      new URLSearchParams(window.location.search).get('trialid') ??
      `preview-${crypto.randomUUID()}`,
  );
  const bridge = useRef<ReturnType<typeof createRevisitBridge> | null>(null);
  const [answerSeed, setAnswerSeed] = useState(() => crypto.randomUUID());
  const startTime = useRef(0);
  const readyTime = useRef(0);
  const interactions = useRef<TrialRecord['interactions']>([]);
  const submitted = useRef(false);
  const hoveredMarks = useRef(new Set<string>());
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);
  useEffect(() => {
    bridge.current = createRevisitBridge({
      onStudyData: (parameters) => {
        if (stageRef.current !== 'briefing') return;
        const next = parseCondition(parameters);
        setCondition(next);
        setConfigurationError(
          next
            ? ''
            : 'This trial needs a valid scenario and technique. Please contact the study facilitator.',
        );
      },
    });
    return () => {
      bridge.current?.destroy();
    };
  }, []);
  const config = condition ? STUDY_SCENARIOS[condition.scenario] : null;
  const options = useMemo(
    () => (condition ? orderAnswers(answerOptions(condition.scenario), answerSeed) : []),
    [condition, answerSeed],
  );
  const spec = useMemo(
    () =>
      condition && condition.technique !== 'table'
        ? studySpec(condition.scenario, condition.technique)
        : null,
    [condition],
  );
  const track = useCallback((type: string, value: string) => {
    if (!submitted.current && startTime.current)
      interactions.current.push({
        type,
        value,
        elapsedMs: Math.round(performance.now() - startTime.current),
      });
  }, []);
  const onReady = useCallback(() => {
    if (!readyTime.current) readyTime.current = performance.now();
    setChartReady(true);
  }, []);
  const onError = useCallback((message: string) => {
    setChartError(message);
    setChartReady(false);
  }, []);
  const onHoverDatum = useCallback(
    (datum: Record<string, unknown>) => {
      const mark =
        typeof datum.source === 'string'
          ? { source: datum.source, dimension: datum.dimension, report_id: datum.report_id }
          : typeof datum.hour === 'string'
            ? { hour: datum.hour, series: datum.series }
            : null;
      if (!mark) return;
      const key = JSON.stringify(mark);
      if (hoveredMarks.current.has(key)) return;
      hoveredMarks.current.add(key);
      track('chart_hover', key);
    },
    [track],
  );
  useEffect(() => {
    if (stage === 'trial' && condition?.technique === 'table') onReady();
  }, [stage, condition, onReady]);
  const begin = () => {
    if (!condition) return;
    startTime.current = performance.now();
    interactions.current = [];
    hoveredMarks.current.clear();
    submitted.current = false;
    readyTime.current = 0;
    setChartReady(false);
    setChartError('');
    stageRef.current = 'trial';
    setStage('trial');
    track('trial_started', `${condition.scenario}:${condition.technique}`);
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!condition || !answer || confidence === null || !chartReady || submitted.current) return;
    const now = performance.now();
    const next: TrialRecord = {
      schemaVersion: 'avr-study/1',
      trialId,
      ...condition,
      answer,
      confidence,
      elapsedMs: Math.round(now - startTime.current),
      responseTimeMs: Math.round(now - readyTime.current),
      interactions: [
        ...interactions.current,
        { type: 'submit', value: 'complete', elapsedMs: Math.round(now - startTime.current) },
      ],
      answerOrder: options,
      completion: true,
      submittedAt: new Date().toISOString(),
    };
    if (embedded && !bridge.current?.sendAnswer(next)) {
      setSubmissionError(
        'The study connection is unavailable. Keep this page open and contact the facilitator.',
      );
      return;
    }
    submitted.current = true;
    setRecord(next);
    setStage('complete');
  };
  const resetPreview = (next: StudyCondition) => {
    stageRef.current = 'briefing';
    setCondition(next);
    setStage('briefing');
    setAnswer('');
    setConfidence(null);
    setRecord(null);
    setChartReady(false);
    setTrialId(`preview-${crypto.randomUUID()}`);
    setAnswerSeed(crypto.randomUUID());
    setSubmissionError('');
    setChartError('');
    startTime.current = 0;
    readyTime.current = 0;
    submitted.current = false;
  };
  const download = () => {
    if (!record) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${record.scenario}-${record.technique}-trial.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const step = stage === 'briefing' ? 1 : stage === 'trial' ? 2 : 3;
  return (
    <div className={`study-app ${embedded ? 'study-embedded' : ''}`}>
      <header className="study-header">
        <a
          className="study-brand"
          href={embedded ? undefined : './'}
          aria-label="Cedar Watch study home"
        >
          <span className="study-brand-mark">
            <ChartNoAxesCombined size={21} />
          </span>
          <span>
            Cedar Watch<span className="study-brand-sub">VISUALIZATION STUDY</span>
          </span>
        </a>
        <span className="study-environment">
          <span />
          {embedded ? 'Study session' : 'Participant preview'}
        </span>
      </header>
      <main className="study-main">
        <nav className="study-progress" aria-label="Trial progress">
          <ol>
            {['Read the scenario', 'Explore & respond', 'Response complete'].map((label, i) => (
              <li
                key={label}
                className={step === i + 1 ? 'current' : step > i + 1 ? 'done' : ''}
                aria-current={step === i + 1 ? 'step' : undefined}
              >
                <span>{step > i + 1 ? <Check size={13} /> : `0${i + 1}`}</span>
                {label}
              </li>
            ))}
          </ol>
          <span className="study-trial-label">ONE SCENARIO · ONE VISUALIZATION</span>
        </nav>
        {!condition || !config ? (
          <section className="study-briefing">
            <span className="study-kicker">TRIAL SETUP</span>
            <h1>
              {configurationError ||
                (!embedded
                  ? 'This preview condition is unavailable.'
                  : 'Connecting to your study…')}
            </h1>
            <p>
              {embedded
                ? 'The study host supplies your assigned scenario and visualization.'
                : 'Choose a supported scenario and technique in Preview settings below.'}
            </p>
          </section>
        ) : stage === 'briefing' ? (
          <section className="study-briefing">
            <div className="study-brief-copy">
              <span className="study-kicker">YOUR NEXT SCENARIO</span>
              <h1>{config.title}</h1>
              <p className="study-intro">{config.context}</p>
              <div className="study-question">
                <span>THE QUESTION</span>
                <h2>{config.question}</h2>
              </div>
              <p className="study-brief-note">
                Use the assigned visualization to answer. Then tell us how confident you feel. There
                is no time limit.
              </p>
              <button className="study-primary" onClick={begin}>
                Start trial <ArrowRight size={17} />
              </button>
            </div>
            <aside className="study-instructions">
              <span className="study-instruction-icon">
                <FlaskConical size={25} />
              </span>
              <h2>Take a closer look.</h2>
              <p>We’re studying how people interpret information in different visualizations.</p>
              <ol>
                <li>
                  <span>01</span>
                  <div>
                    <strong>Read</strong>
                    <p>Understand the scenario and question.</p>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <strong>Explore</strong>
                    <p>
                      {condition.technique === 'table'
                        ? 'Read the rows in your assigned table.'
                        : 'Hover over marks to see exact values.'}
                    </p>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <strong>Respond</strong>
                    <p>Choose an answer and your confidence.</p>
                  </div>
                </li>
              </ol>
              <div className="study-fictional">
                All sources, locations, and reports in this study are fictional.
              </div>
            </aside>
          </section>
        ) : stage === 'trial' ? (
          <>
            <div className="study-task">
              <div>
                <span className="study-kicker">{config.title}</span>
                <h1>{config.question}</h1>
              </div>
              <span className="study-task-badge">YOUR TASK</span>
            </div>
            <div className="study-trial-grid">
              <section className="study-chart-card" aria-labelledby="study-chart-title">
                <div className="study-chart-heading">
                  <div>
                    <span className="study-kicker">ASSIGNED VISUALIZATION</span>
                    <h2 id="study-chart-title">{config.chartTitle}</h2>
                  </div>
                  <span className="study-technique">{TECHNIQUE_LABELS[condition.technique]}</span>
                </div>
                <div className="study-chart-body">
                  {condition.technique === 'table' ? (
                    <DataTable scenario={condition.scenario} />
                  ) : (
                    spec && (
                      <VegaChart
                        spec={spec}
                        ariaLabel={`${TECHNIQUE_LABELS[condition.technique]}: ${config.chartTitle}`}
                        onReady={onReady}
                        onError={onError}
                        onHoverDatum={onHoverDatum}
                        onSelect={(id) => track('chart_select', id)}
                        onSelectDatum={(datum) => track('chart_select', JSON.stringify(datum))}
                      />
                    )
                  )}
                </div>
                <div className="study-chart-help">
                  <HelpCircle size={16} />
                  <p>
                    {condition.technique === 'table'
                      ? 'Read one row at a time. All times use the fictional exercise clock (UTC−04:00).'
                      : config.hint}{' '}
                    {condition.technique !== 'table' && 'Hover over a mark for exact values.'}
                  </p>
                </div>
                {chartError && (
                  <p role="alert" className="study-error">
                    The visualization could not load. Please contact the facilitator before
                    continuing.
                  </p>
                )}
                <details className="study-context">
                  <summary>
                    Read scenario context <ChevronDown size={14} />
                  </summary>
                  <p>{config.context}</p>
                </details>
              </section>
              <form
                className="study-response-card"
                onSubmit={submit}
                aria-labelledby="response-heading"
              >
                <span className="study-kicker">YOUR RESPONSE</span>
                <h2 id="response-heading">What do you conclude?</h2>
                <p className="study-response-intro">
                  Choose the answer that best matches the evidence.
                </p>
                <fieldset disabled={!chartReady}>
                  <legend className="study-sr-only">Answer to the scenario question</legend>
                  <div className="study-answer-options">
                    {options.map((option, index) => (
                      <label
                        key={option}
                        className={`study-answer ${answer === option ? 'selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="answer"
                          value={option}
                          checked={answer === option}
                          onChange={() => {
                            setAnswer(option);
                            track('answer_changed', option);
                          }}
                        />
                        <span className="study-option-letter">
                          {String.fromCharCode(65 + index)}
                        </span>
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="study-confidence" disabled={!chartReady}>
                  <legend>How confident are you?</legend>
                  <div>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <label key={value} className={confidence === value ? 'selected' : ''}>
                        <input
                          type="radio"
                          name="confidence"
                          value={value}
                          checked={confidence === value}
                          onChange={() => {
                            setConfidence(value);
                            track('confidence_changed', String(value));
                          }}
                          aria-label={`Confidence ${value} of 5`}
                        />
                        <span>{value}</span>
                      </label>
                    ))}
                  </div>
                  <p>
                    <span>Not confident</span>
                    <span>Very confident</span>
                  </p>
                </fieldset>
                <button
                  className="study-primary"
                  type="submit"
                  disabled={!answer || confidence === null || !chartReady}
                >
                  Submit response <ArrowRight size={17} />
                </button>
                <p className="study-submit-note">
                  {!chartReady
                    ? 'Waiting for the visualization to load…'
                    : 'Select an answer and confidence to continue.'}
                </p>
                {submissionError && (
                  <p role="alert" className="study-error">
                    {submissionError}
                  </p>
                )}
              </form>
            </div>
          </>
        ) : (
          <section className="study-complete">
            <span className="study-complete-icon">
              <Check size={30} />
            </span>
            <span className="study-kicker">TRIAL COMPLETE</span>
            <h1>Thank you. Your response is complete.</h1>
            <p>
              {embedded
                ? 'Use the study’s Next trial button to continue.'
                : 'This is a standalone preview. Download the trial record to inspect the captured response.'}
            </p>
            {!embedded && (
              <button className="study-primary" onClick={download}>
                <Download size={17} /> Download trial record
              </button>
            )}
          </section>
        )}
        {!embedded && (
          <details className="study-preview-settings">
            <summary>
              <FlaskConical size={14} /> Preview settings
            </summary>
            <div>
              <label>
                Scenario
                <select
                  value={condition?.scenario ?? ''}
                  disabled={stage === 'trial'}
                  onChange={(e) => {
                    const scenario = e.target.value as ScenarioId;
                    resetPreview({ scenario, technique: STUDY_SCENARIOS[scenario].techniques[0] });
                  }}
                >
                  <option value="" disabled>
                    Select scenario
                  </option>
                  {Object.entries(STUDY_SCENARIOS).map(([id, value]) => (
                    <option key={id} value={id}>
                      {value.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assigned technique
                <select
                  value={condition?.technique ?? ''}
                  disabled={stage === 'trial' || !condition}
                  onChange={(e) =>
                    condition &&
                    resetPreview({
                      ...condition,
                      technique: e.target.value as StudyCondition['technique'],
                    })
                  }
                >
                  {condition &&
                    STUDY_SCENARIOS[condition.scenario].techniques.map((id) => (
                      <option key={id} value={id}>
                        {TECHNIQUE_LABELS[id]}
                      </option>
                    ))}
                </select>
              </label>
              <a href="?mode=researcher">
                Open researcher workspace <ArrowRight size={14} />
              </a>
            </div>
            <p>
              {stage === 'trial'
                ? 'Finish this trial to change the preview condition.'
                : 'Preview controls are hidden when embedded in reVISit.'}
            </p>
          </details>
        )}
      </main>
      <footer className="study-footer">
        <span>Cedar Watch · Human visualization research</span>
        <span>Fictional research data</span>
      </footer>
    </div>
  );
}
