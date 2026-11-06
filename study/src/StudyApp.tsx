import { ArrowUpRight, Check, LockKeyhole } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FictionalGridPlot, ObservationTimeline, ReportComparisonTable } from '../../src/components/charts/SituationEvidenceViews';
import { VegaChart } from '../../src/components/charts/VegaChart';
import { EvidencePanel } from '../../src/components/details/EvidencePanel';
import { SCENARIOS } from '../../src/domain/constants';
import {
  assignTrials,
  clearTrialDraft,
  clearSession,
  downloadExport,
  emptyTrialDraft,
  loadTrialDraft,
  loadSession,
  PROTOCOL_VERSION,
  RESPONSE_SCHEMA_VERSION,
  saveSession,
  sessionExportCsv,
  sessionExportJson,
  STIMULUS_SEED,
  STIMULUS_VERSION,
  STUDY_UI_VERSION,
  saveTrialDraft,
  type PilotSession,
  type StudyCondition,
  type TrialDraft,
  type TrialRecord,
} from './protocol';
import { getQuestion } from './questions';
import { containsTextMark, getScenarioView, sourceCommit } from './studyModel';

type Stage = 'introduction' | 'consent' | 'practice' | 'trial' | 'survey' | 'debrief' | 'declined' | 'exited' | 'saved';

function StudyChrome({ stage, completed = 0 }: { stage: Stage; completed?: number }) {
  const current = ['introduction', 'consent', 'practice'].includes(stage) ? 0
    : stage === 'trial' ? 1 : ['survey', 'debrief'].includes(stage) ? 2 : -1;
  return (
    <>
      <a className="study-skip" href="#study-content">Skip to study content</a>
      <div className="study-topbar">
        <div className="study-brand"><span>Cedar Watch<small>Visualization research</small></span></div>
        <span className="study-draft-badge">Draft pilot</span>
      </div>
      <nav className="study-journey" aria-label="Study progress">
        <ol>{['Prepare', 'Explore evidence', 'Reflect'].map((label, index) => (
          <li key={label} aria-current={current === index ? 'step' : undefined} data-complete={current > index}>
            <span>{current > index ? <Check size={15} aria-hidden="true" /> : index + 1}</span>{label}
          </li>
        ))}</ol>
        <span className="study-local"><LockKeyhole size={14} aria-hidden="true" /> Local rehearsal</span>
      </nav>
      {(stage === 'trial' || stage === 'survey' || stage === 'debrief') && (
        <div className="study-progress"><label htmlFor="trial-progress">{completed} of 10 trials recorded</label><progress id="trial-progress" max={10} value={completed} /></div>
      )}
      <div id="study-content" tabIndex={-1} />
    </>
  );
}

const anonymousId = (prefix: string) => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${value}`;
};

const noQuestionAnswer = (value: string) => value === '';
const isRatingValue = (value: string): value is TrialDraft['confidence'] =>
  ['', '1', '2', '3', '4', '5'].some((rating) => rating === value);
const conditionLabel: Record<StudyCondition, string> = {
  baseline: 'Evidence-only view',
  recommended: 'Task-aware recommended view',
};

function exportSession(session: PilotSession) {
  downloadExport(
    `cedar-watch-pilot-${session.sessionId}.json`,
    sessionExportJson(session),
    'application/json',
  );
}

function exportCsv(session: PilotSession) {
  downloadExport(
    `cedar-watch-pilot-${session.sessionId}.csv`,
    sessionExportCsv(session),
    'text/csv;charset=utf-8',
  );
}

export function StudyApp({
  onSessionChange,
}: {
  onSessionChange?: (session: PilotSession) => void;
}) {
  const [session, setSession] = useState<PilotSession | null>(() => loadSession());
  const [stage, setStage] = useState<Stage>(() => (session ? 'saved' : 'introduction'));
  const [consentChecked, setConsentChecked] = useState(false);
  const [practiceAnswer, setPracticeAnswer] = useState('');
  const [practiceFeedback, setPracticeFeedback] = useState('');
  const [draftState, setDraftState] = useState<{ key: string; draft: TrialDraft } | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const activeMilliseconds = useRef(0);
  const visibleSince = useRef<number | null>(null);
  const visibilityInterruptions = useRef(0);
  const submittedDraftKey = useRef<string | null>(null);
  const trialHeadingRef = useRef<HTMLHeadingElement>(null);

  const assignment = session ? assignTrials(session.participantId) : null;
  const trial = assignment && session ? assignment.trials[session.responses.length] : undefined;
  const trialId = trial?.trialId;
  const activeSessionId = session?.sessionId;
  const scenarioView = trial ? getScenarioView(trial.scenarioFamily) : undefined;
  const question = trial ? getQuestion(trial.scenarioFamily, trial.taskVariant) : undefined;
  const activeDraftKey =
    session && trial ? `${session.sessionId}/${trial.trialId}` : null;
  const activeDraft = useMemo(() => {
    if (!session || !trial || !activeDraftKey) return null;
    if (draftState?.key === activeDraftKey) return draftState.draft;
    return (
      loadTrialDraft(session.sessionId, trial.trialId) ??
      emptyTrialDraft(
        session.sessionId,
        trial.trialId,
        trial.condition === 'recommended'
          ? getScenarioView(trial.scenarioFamily).recommendations[0]?.id ?? ''
          : 'report-comparison-table',
      )
    );
  }, [activeDraftKey, draftState, session, trial]);
  const draftRef = useRef(activeDraft);
  draftRef.current = activeDraft;
  const selectedReportId = activeDraft?.selectedReportId ?? '';
  const selectedVisualizationId = activeDraft?.selectedVisualizationId ?? '';
  const selectedReport = scenarioView?.reports.find((report) => report.report_id === selectedReportId);
  const selectedVisualization =
    scenarioView?.recommendations.find((recommendation) => recommendation.id === selectedVisualizationId) ??
    scenarioView?.recommendations[0];
  const sourceMap = useMemo(
    () => new Map(scenarioView?.data.sources.map((source) => [source.source_id, source]) ?? []),
    [scenarioView],
  );
  const locationMap = useMemo(
    () => new Map(scenarioView?.data.locations.map((location) => [location.location_id, location]) ?? []),
    [scenarioView],
  );
  const outputMap = useMemo(
    () => new Map(scenarioView?.data.model_outputs.map((output) => [output.report_id, output]) ?? []),
    [scenarioView],
  );
  const provenanceMap = useMemo(
    () => new Map(scenarioView?.data.provenance.map((item) => [item.report_id, item]) ?? []),
    [scenarioView],
  );

  const updateDraft = (patch: Partial<TrialDraft>) => {
    if (!session || !trial || !activeDraftKey || !activeDraft) return;
    const updated = { ...activeDraft, ...patch };
    try {
      saveTrialDraft(updated);
      setDraftState({ key: activeDraftKey, draft: updated });
      draftRef.current = updated;
      setStatusMessage('');
    } catch {
      setStatusMessage(
        'This browser could not save the local trial draft. Export or stop before leaving this trial.',
      );
    }
  };

  useEffect(() => {
    if (stage !== 'trial' || trialId === undefined || !activeSessionId || !activeDraftKey) return;
    const currentKey = activeDraftKey;
    const currentTrialId = trialId;
    const sessionId = activeSessionId;
    const startedDraft = draftRef.current;
    activeMilliseconds.current = startedDraft?.activeTrialTimeMs ?? 0;
    visibilityInterruptions.current = startedDraft?.visibilityInterruptions ?? 0;
    visibleSince.current = document.hidden ? null : Date.now();
    if (submittedDraftKey.current !== currentKey) submittedDraftKey.current = null;
    const persistTiming = () => {
      const current = draftRef.current;
      if (!current || current.trialId !== currentTrialId || submittedDraftKey.current === currentKey)
        return;
      const updated = {
        ...current,
        activeTrialTimeMs: Math.max(
          0,
          Math.round(
            activeMilliseconds.current +
              (visibleSince.current === null ? 0 : Date.now() - visibleSince.current),
          ),
        ),
        visibilityInterruptions: visibilityInterruptions.current,
      };
      try {
        saveTrialDraft(updated);
        setDraftState({ key: currentKey, draft: updated });
        draftRef.current = updated;
      } catch {
        setStatusMessage(
          `This browser could not save the local trial draft for ${sessionId}. Export or stop before leaving this trial.`,
        );
      }
    };
    const updateVisibility = () => {
      if (document.hidden) {
        if (visibleSince.current !== null) {
          activeMilliseconds.current += Date.now() - visibleSince.current;
          visibleSince.current = null;
          visibilityInterruptions.current += 1;
          persistTiming();
        }
      } else if (visibleSince.current === null) {
        visibleSince.current = Date.now();
      }
    };
    document.addEventListener('visibilitychange', updateVisibility);
    window.addEventListener('pagehide', persistTiming);
    const focusTrial = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'instant' });
      trialHeadingRef.current?.focus({ preventScroll: true });
    });
    return () => {
      document.removeEventListener('visibilitychange', updateVisibility);
      window.removeEventListener('pagehide', persistTiming);
      window.cancelAnimationFrame(focusTrial);
      if (visibleSince.current !== null) {
        activeMilliseconds.current += Date.now() - visibleSince.current;
        visibleSince.current = null;
      }
      persistTiming();
    };
  }, [stage, trialId, activeSessionId, activeDraftKey]);

  useEffect(() => {
    if (session) onSessionChange?.(session);
  }, [session, onSessionChange]);

  const commitSession = (updated: PilotSession) => {
    try {
      saveSession(updated);
      setSession(updated);
      setStatusMessage('');
      return true;
    } catch {
      setStatusMessage(
        'This browser could not save the local study record. Do not continue unless your approved study procedure provides another supported collection method.',
      );
      return false;
    }
  };

  const acceptConsent = () => {
    if (!consentChecked) return;
    const participantId = anonymousId('P');
    const nextAssignment = assignTrials(participantId);
    const initial: PilotSession = {
      schemaVersion: RESPONSE_SCHEMA_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      uiVersion: STUDY_UI_VERSION,
      participantId,
      sessionId: anonymousId('S'),
      consentAccepted: true,
      sourceCommit: sourceCommit(),
      stimulusSeed: STIMULUS_SEED,
      stimulusVersion: STIMULUS_VERSION,
      counterbalanceGroup: nextAssignment.group,
      assignedOrder: nextAssignment.trials.map((item) => item.trialId),
      status: 'in_progress',
      responses: [],
      usability: {
        evidenceClarity: null,
        conditionPreference: null,
        easierCondition: null,
      },
    };
    if (commitSession(initial)) setStage('practice');
  };

  const elapsedActiveMs = () =>
    activeMilliseconds.current +
    (visibleSince.current === null ? 0 : Date.now() - visibleSince.current);

  const track = (
    type: 'report_select' | 'visualization_select',
    value: string,
    patch: Partial<TrialDraft> = {},
  ) => {
    if (!activeDraft) return;
    updateDraft({
      ...patch,
      interactions: [...activeDraft.interactions, { type, value, elapsedMs: elapsedActiveMs() }],
    });
  };

  const submitTrial = () => {
    if (
      !session ||
      !trial ||
      !question ||
      !activeDraft ||
      activeDraft.answerKind === null ||
      (activeDraft.answerKind === 'choice' && noQuestionAnswer(activeDraft.answerId)) ||
      !activeDraft.confidence ||
      !activeDraft.difficulty
    ) {
      return;
    }
    const updatedTrial: TrialRecord = {
      trialId: trial.trialId,
      trialIndex: session.responses.length,
      scenarioFamily: trial.scenarioFamily,
      taskVariant: trial.taskVariant,
      condition: trial.condition,
      recommendedVisualization:
        trial.condition === 'recommended' ? (scenarioView?.recommendations[0]?.id ?? null) : null,
      selectedVisualization:
        trial.condition === 'baseline'
          ? 'report-comparison-table'
          : (activeDraft.selectedVisualizationId || selectedVisualization?.id || 'unavailable'),
      selectedReports: [
        ...new Set(
          activeDraft.interactions
            .filter((event) => event.type === 'report_select')
            .map((event) => event.value),
        ),
      ],
      evidenceInteractions: activeDraft.interactions,
      answerKind: activeDraft.answerKind,
      answerId: activeDraft.answerKind === 'unknown' ? null : activeDraft.answerId,
      confidence: Number(activeDraft.confidence),
      perceivedDifficulty: Number(activeDraft.difficulty),
      activeTrialTimeMs: Math.max(0, Math.round(elapsedActiveMs())),
      visibilityInterruptions: visibilityInterruptions.current,
    };
    const next: PilotSession = {
      ...session,
      responses: [...session.responses, updatedTrial],
    };
    if (!commitSession(next)) return;
    if (activeDraftKey && session) {
      submittedDraftKey.current = activeDraftKey;
      clearTrialDraft(session.sessionId, trial.trialId);
    }
    if (next.responses.length === 10) setStage('survey');
  };

  const finishSurvey = (
    evidenceClarity: string,
    conditionPreference: string,
    easierCondition: string,
  ) => {
    if (!session || !evidenceClarity || !conditionPreference || !easierCondition) return;
    const next: PilotSession = {
      ...session,
      status: 'complete',
      usability: {
        evidenceClarity: Number(evidenceClarity),
        conditionPreference: conditionPreference as PilotSession['usability']['conditionPreference'],
        easierCondition: easierCondition as PilotSession['usability']['easierCondition'],
      },
    };
    if (commitSession(next)) setStage('debrief');
  };

  if (stage === 'introduction') {
    return (
      <main className="study-shell">
        <StudyChrome stage={stage} completed={session?.responses.length ?? 0} />
        <header className="study-header study-hero">
          <p className="study-kicker">Draft research pilot · fictional synthetic evidence</p>
          <h1>Cedar Watch visualization pilot</h1>
        </header>
        <div className="study-welcome-grid">
        <section className="study-card study-introduction">
          <h2>Study introduction</h2>
          <p>
            This draft pilot compares two ways of viewing the same scripted Cedar Watch evidence:
            a fixed evidence view and a task-aware visualization recommendation. All places,
            sources, and reports are fictional.
          </p>
          <p>
            If approved, participation will involve a short practice, ten evidence-interpretation
            trials, confidence and difficulty ratings, and a brief usability questionnaire.
            There are no operational recommendations and no known event ground truth.
          </p>
          <p className="study-notice">
            This is a draft requiring investigator and institutional approval. Do not use for
            recruitment or production participant collection.
          </p>
          <button className="button primary" type="button" onClick={() => setStage('consent')}>
            Continue to draft consent
          </button>
        </section>
        <aside className="study-overview" aria-label="What to expect">
          <h2>What to expect</h2>
          <ol>
            <li><strong>Get familiar</strong><span>Read the draft consent and try a practice exercise.</span></li>
            <li><strong>Explore ten trials</strong><span>Inspect the reports, then record a response and two ratings.</span></li>
            <li><strong>Share your perspective</strong><span>Finish with a brief usability questionnaire.</span></li>
          </ol>
          <p><LockKeyhole size={16} aria-hidden="true" /> Fictional data. Responses stay in this browser until exported or cleared.</p>
        </aside>
        </div>
      </main>
    );
  }

  if (stage === 'saved' && session) {
    return (
      <main className="study-shell">
        <StudyChrome stage={stage} completed={session?.responses.length ?? 0} />
        <section className="study-card">
          <h1>Saved local session</h1>
          <p>
            This browser already contains an anonymous {session.status === 'complete' ? 'completed' : 'incomplete'} pilot session.
            If this is a shared device, do not show it to another participant.
          </p>
          <div className="study-actions">
            <button
              className="button primary"
              type="button"
              onClick={() => setStage(session.status === 'complete' ? 'debrief' : session.responses.length === 10 ? 'survey' : 'trial')}
            >
              {session.status === 'complete' ? 'View completed debrief' : 'Resume saved session'}
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                clearSession();
                setSession(null);
                setStage('introduction');
              }}
            >
              Clear session and start new
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (stage === 'consent') {
    return (
      <main className="study-shell">
        <StudyChrome stage={stage} completed={session?.responses.length ?? 0} />
        <section className="study-card">
          <h1>Draft consent information</h1>
          <p>
            <strong>Purpose:</strong> compare evidence displays for interpreting fictional,
            synthetic observation reports. This protocol and consent text are drafts and require
            investigator approval before any study is run.
          </p>
          <p>
            <strong>What participation involves:</strong> practice, ten trials, and ratings of
            confidence, perceived difficulty, clarity, and preference. You may stop at any time.
          </p>
          <p>
            <strong>Data:</strong> the pilot creates a random anonymous participant ID and session
            ID. The default local app stores study responses only in this browser until you export
            or clear them. The app does not ask for your name, email, or imported data. Browser
            storage is not a central research database. Approved reVISit hosting may store
            participant metadata; the institution must review and configure that separately.
          </p>
          <p>
            <strong>Risks and benefits:</strong> no direct benefit is promised. No sensitive
            personal information is requested. The research contact and approved consent language
            have not yet been supplied.
          </p>
          <label className="study-consent-check">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(event) => setConsentChecked(event.target.checked)}
            />
            <span>
              I have read this draft and voluntarily agree to continue, pending investigator and
              institutional approval.
            </span>
          </label>
          <div className="study-actions">
            <button
              className="button primary"
              type="button"
              disabled={!consentChecked}
              onClick={acceptConsent}
            >
              Agree and begin practice
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                setConsentChecked(false);
                setStage('declined');
              }}
            >
              Decline and exit
            </button>
          </div>
          {statusMessage && <p role="alert">{statusMessage}</p>}
        </section>
      </main>
    );
  }

  if (stage === 'declined') {
    return (
      <main className="study-shell">
        <StudyChrome stage={stage} completed={session?.responses.length ?? 0} />
        <section className="study-card" role="status">
          <h1>You declined</h1>
          <p>No study session or response was saved. You may close this page.</p>
        </section>
      </main>
    );
  }

  if (stage === 'practice') {
    return (
      <main className="study-shell">
        <StudyChrome stage={stage} completed={session?.responses.length ?? 0} />
        <section className="study-card">
          <p className="study-kicker">Practice · not an experimental trial</p>
          <h1>Practice the evidence view</h1>
          <p>
            This separate fictional example is for learning the controls. It is not one of the
            Cedar Watch trial scenarios and will not be included in the exported responses.
          </p>
          <div className="tablewrap" role="region" aria-label="Practice reports" tabIndex={0}>
          <table>
            <caption>Fictional Harbor Lane practice reports</caption>
            <thead>
              <tr><th>Report</th><th>Observed</th><th>Received</th><th>Reported count</th></tr>
            </thead>
            <tbody>
              <tr><td>Practice log A</td><td>09:00</td><td>09:12</td><td>Not recorded</td></tr>
              <tr><td>Practice log B</td><td>09:10</td><td>09:42</td><td>About 3</td></tr>
            </tbody>
          </table>
          </div>
          <p>
            In the practice display, a count that is not recorded is unknown—not zero. Observation
            and receipt times describe different events. Reports can overlap and should not be
            added into a total.
          </p>
          <fieldset>
            <legend>Does “not recorded” mean the source reported zero?</legend>
            <label><input type="radio" name="practice" value="yes" checked={practiceAnswer === 'yes'} onChange={() => setPracticeAnswer('yes')} /> Yes</label>
            <label><input type="radio" name="practice" value="no" checked={practiceAnswer === 'no'} onChange={() => setPracticeAnswer('no')} /> No</label>
          </fieldset>
          <div className="study-actions">
            <button
              className="button secondary"
              type="button"
              disabled={!practiceAnswer}
              onClick={() => setPracticeFeedback(practiceAnswer === 'no' ? 'Correct for practice: missing is not zero.' : 'For practice, remember that missing is not zero.')}
            >
              Check practice response
            </button>
            <button
              className="button primary"
              type="button"
              disabled={!practiceFeedback}
              onClick={() => setStage('trial')}
            >
              Begin experimental trials
            </button>
          </div>
          {practiceFeedback && <p role="status">{practiceFeedback}</p>}
        </section>
      </main>
    );
  }

  if (stage === 'trial' && session && trial && question && scenarioView) {
    const relatedReports = selectedReport
      ? scenarioView.reports.filter(
          (report) => report.event_id === selectedReport.event_id && report.report_id !== selectedReport.report_id,
        )
      : [];
    return (
      <main className="study-shell study-trial">
        <StudyChrome stage={stage} completed={session.responses.length} />
        <nav className="study-trial-nav" aria-label="Trial sections"><a href="#trial-evidence">Review evidence</a><a href="#trial-response">Your response <ArrowUpRight size={16} aria-hidden="true" /></a></nav>
        <header className="study-header">
          <p className="study-kicker">
            {STUDY_UI_VERSION} · Trial {session.responses.length + 1} of 10
          </p>
          <h1 ref={trialHeadingRef} tabIndex={-1}>
            {question.prompt}
          </h1>
          <p>
            <strong>Scenario:</strong> {SCENARIOS[trial.scenarioFamily].label}
          </p>
          <p className="condition-label">{conditionLabel[trial.condition]}</p>
          <p className="condition-explanation">
            {trial.condition === 'baseline'
              ? 'This evidence-only view presents the fixed report table, timeline, fictional grid, and inspector without a task-aware chart recommendation.'
              : 'This task-aware view adds the recommender’s selected chart and rationale. The same source reports, uncertainty, and evidence inspector are available in both conditions.'}
          </p>
          <section className="study-card" aria-labelledby="scenario-context-heading">
            <h2 id="scenario-context-heading">1. Scenario context</h2>
            <p>{SCENARIOS[trial.scenarioFamily].description}</p>
          </section>
        </header>
        <p className="study-notice">
          Use only the reports shown. Missing values are not zero; repeated or derived reports are
          not independent evidence. These scripted reports do not reveal underlying event ground
          truth.
        </p>
        {trial.condition === 'recommended' && (
          <section className="study-card" aria-label="Task-aware recommendation">
            <h2>2. Recommendation for this task</h2>
            {selectedVisualization && (
              <>
                <p className="selected-chart-label">
                  <strong>Selected chart:</strong> {selectedVisualization.title} ·{' '}
                  {selectedVisualization.technique}
                </p>
                <p>{selectedVisualization.rationale.join(' ')}</p>
                <p className="study-caution">{selectedVisualization.doesNotEstablish}</p>
                <label className="study-field">
                  <span>Select visualization</span>
                  <select
                    value={selectedVisualization.id}
                    onChange={(event) => {
                      track('visualization_select', event.target.value, {
                        selectedVisualizationId: event.target.value,
                      });
                    }}
                  >
                    {scenarioView.recommendations.map((recommendation) => (
                      <option key={recommendation.id} value={recommendation.id}>
                        {recommendation.title}
                      </option>
                    ))}
                  </select>
                </label>
                {containsTextMark(selectedVisualization.vegaLiteSpec) ? (
                  <section aria-label={`Readable table for ${selectedVisualization.title}`}>
                    <p className="help">
                      This text-dense recommendation is shown as a readable report table. Select a
                      report here or in the shared evidence views below.
                    </p>
                    <ReportComparisonTable
                      reports={scenarioView.reports}
                      sources={scenarioView.data.sources}
                      selectedId={selectedReportId}
                      showInternalIds={false}
                      onSelect={(id) =>
                        track('report_select', id, { selectedReportId: id })
                      }
                    />
                  </section>
                ) : (
                  <VegaChart
                    spec={selectedVisualization.vegaLiteSpec}
                    onSelect={(id) =>
                      track('report_select', id, { selectedReportId: id })
                    }
                    ariaLabel={`Task-aware recommended ${selectedVisualization.title}`}
                  />
                )}
              </>
            )}
          </section>
        )}
        <section className="study-card" id="trial-evidence" tabIndex={-1}>
          <h2>{trial.condition === 'recommended' ? '3' : '2'}. Available evidence</h2>
          {trial.condition === 'baseline' && (
            <p>
              Fixed evidence-only view: report comparison table, observation-to-receipt timeline,
              and fictional local-grid plot. No task-aware chart is shown.
            </p>
          )}
          <ReportComparisonTable
            reports={scenarioView.reports}
            sources={scenarioView.data.sources}
            selectedId={selectedReportId}
            showInternalIds={false}
            onSelect={(id) => {
              track('report_select', id, { selectedReportId: id });
            }}
          />
          <ObservationTimeline
            reports={scenarioView.reports}
            sources={scenarioView.data.sources}
            selectedId={selectedReportId}
            onSelect={(id) => {
              track('report_select', id, { selectedReportId: id });
            }}
          />
          <FictionalGridPlot
            reports={scenarioView.reports}
            locations={scenarioView.data.locations}
            onSelect={(id) => {
              track('report_select', id, { selectedReportId: id });
            }}
          />
        </section>
        <EvidencePanel
          report={selectedReport}
          source={selectedReport ? sourceMap.get(selectedReport.source_id) : undefined}
          sources={scenarioView.data.sources}
          relatedReports={relatedReports}
          location={selectedReport ? locationMap.get(selectedReport.location_id) : undefined}
          provenance={selectedReport ? provenanceMap.get(selectedReport.report_id) : undefined}
          output={selectedReport ? outputMap.get(selectedReport.report_id) : undefined}
          analysis={selectedReport ? scenarioView.analysis.get(selectedReport.report_id) : undefined}
          salience={selectedReport ? scenarioView.salience.get(selectedReport.report_id) : undefined}
          recommendation={trial.condition === 'recommended' ? selectedVisualization : undefined}
          modeling={scenarioView.modeling}
          audience="Analyst"
          collapseTechnicalDetails
          showTechnicalIdentifiers={false}
        />
        <section className="study-card response-card" id="trial-response" tabIndex={-1} aria-label="Trial response panel">
          <h2>{trial.condition === 'recommended' ? '4' : '3'}. Your response</h2>
          <p className="question-repeat">
            <strong>Question:</strong> {question.prompt}
          </p>
          <fieldset>
            <legend>Your response</legend>
            {question.options.map((option) => (
              <label className="study-option" key={option.id}>
                <input
                  type="radio"
                  name="trial-answer"
                  value={option.id}
                  checked={activeDraft?.answerKind === 'choice' && activeDraft.answerId === option.id}
                  onChange={() => {
                    updateDraft({ answerKind: 'choice', answerId: option.id });
                  }}
                />
                <span>{option.label}</span>
              </label>
            ))}
            <label className="study-option">
              <input
                type="radio"
                name="trial-answer"
                value="unknown"
                checked={activeDraft?.answerKind === 'unknown'}
                onChange={() => {
                  updateDraft({ answerKind: 'unknown', answerId: '' });
                }}
              />
              <span>I cannot determine an answer from the available reports.</span>
            </label>
          </fieldset>
          <div className="study-two-fields">
            <label className="study-field">
              <span>Confidence (1 = not confident, 5 = very confident)</span>
              <select
                aria-label="Confidence"
                value={activeDraft?.confidence ?? ''}
                onChange={(event) => {
                  if (isRatingValue(event.target.value))
                    updateDraft({ confidence: event.target.value });
                }}
              >
                <option value="">Select</option>
                {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="study-field">
              <span>Perceived difficulty (1 = very easy, 5 = very difficult)</span>
              <select
                aria-label="Perceived difficulty"
                value={activeDraft?.difficulty ?? ''}
                onChange={(event) => {
                  if (isRatingValue(event.target.value))
                    updateDraft({ difficulty: event.target.value });
                }}
              >
                <option value="">Select</option>
                {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>
          <button
            className="button primary"
            type="button"
            aria-describedby={
              activeDraft?.answerKind === null ||
              activeDraft === null ||
              (activeDraft.answerKind === 'choice' && !activeDraft.answerId) ||
              !activeDraft.confidence ||
              !activeDraft.difficulty
                ? 'required-response-help'
                : undefined
            }
            disabled={
              activeDraft?.answerKind === null ||
              activeDraft === null ||
              (activeDraft.answerKind === 'choice' && !activeDraft.answerId) ||
              !activeDraft.confidence ||
              !activeDraft.difficulty
            }
            onClick={submitTrial}
          >
            Record response and continue
          </button>
          {(activeDraft?.answerKind === null ||
            activeDraft === null ||
            (activeDraft.answerKind === 'choice' && !activeDraft.answerId) ||
            !activeDraft.confidence ||
            !activeDraft.difficulty) && (
            <p className="help" id="required-response-help">
              Choose a response (or “I cannot determine”), confidence, and perceived difficulty to
              continue.
            </p>
          )}
          {statusMessage && <p role="alert">{statusMessage}</p>}
          <button className="button ghost" type="button" onClick={() => setStage('exited')}>
            Save and exit this draft session
          </button>
          <p className="help">Responses are not marked correct or incorrect during the study.</p>
        </section>
      </main>
    );
  }

  if (stage === 'survey' && session) {
    return <UsabilitySurvey onSubmit={finishSurvey} statusMessage={statusMessage} />;
  }

  if (stage === 'exited') {
    return (
      <main className="study-shell">
        <StudyChrome stage={stage} completed={session?.responses.length ?? 0} />
        <section className="study-card">
          <h1>Session paused</h1>
          <p>
            Your consented draft-session data remains in this browser only. This incomplete
            session can be exported for review, or cleared from this browser.
          </p>
          {session && (
            <div className="study-actions">
              <button className="button secondary" type="button" onClick={() => exportSession(session)}>Export JSON</button>
              <button className="button secondary" type="button" onClick={() => exportCsv(session)}>Export CSV</button>
              <button className="button ghost" type="button" onClick={() => setStage('trial')}>Resume</button>
              <button className="button ghost" type="button" onClick={() => { clearSession(); setSession(null); setStage('introduction'); }}>Clear local session</button>
            </div>
          )}
        </section>
      </main>
    );
  }

  if (stage === 'debrief' && session) {
    return (
      <main className="study-shell">
        <StudyChrome stage={stage} completed={session?.responses.length ?? 0} />
        <section className="study-card">
          <p className="study-kicker">Debrief · draft protocol</p>
          <h1>Thank you</h1>
          <p>
            This exploratory draft compares a fixed report table, observation/receipt timeline, and
            fictional-grid evidence view with the same evidence augmented by the recommender’s
            task-aware chart and rationale. Both conditions use the same scripted reports for a
            scenario family; no condition receives answer keys, event ground truth, or operational
            recommendations. The two variants are intended to be matched but have not been
            validated as equivalent in difficulty.
          </p>
          <p>
            The recommender is a rule-based research prototype. It does not establish truth or
            activity. No confirmatory inference or statistical power claim is made for this draft.
          </p>
          <p>
            Local JSON/CSV export is for investigator-approved rehearsal and analysis only.
            Browser storage is not a central research database.
          </p>
          <div className="study-actions">
            <button className="button primary" type="button" onClick={() => exportSession(session)}>Export validated JSON</button>
            <button className="button secondary" type="button" onClick={() => exportCsv(session)}>Export validated CSV</button>
            <button className="button ghost" type="button" onClick={() => { clearSession(); setSession(null); setStage('introduction'); }}>Clear local session</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="study-shell">
        <StudyChrome stage={stage} completed={session?.responses.length ?? 0} />
      <section className="study-card">
        <h1>Session not available</h1>
        <p>Start again from the introduction or clear the saved local session.</p>
        <button className="button primary" type="button" onClick={() => { clearSession(); setSession(null); setStage('introduction'); }}>
          Start over
        </button>
      </section>
    </main>
  );
}

function UsabilitySurvey({
  onSubmit,
  statusMessage,
}: {
  onSubmit: (clarity: string, preference: string, easier: string) => void;
  statusMessage: string;
}) {
  const [clarity, setClarity] = useState('');
  const [preference, setPreference] = useState('');
  const [easier, setEasier] = useState('');
  return (
    <main className="study-shell">
        <StudyChrome stage="survey" completed={10} />
      <section className="study-card response-card">
        <p className="study-kicker">After-trial questions</p>
        <h1>Usability and preference</h1>
        <label className="study-field">
          <span>How clear was the evidence overall? (1 = not clear, 5 = very clear)</span>
          <select aria-label="Evidence clarity" value={clarity} onChange={(event) => setClarity(event.target.value)}>
            <option value="">Select</option>
            {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="study-field">
          <span>Which view did you prefer overall?</span>
          <select aria-label="Condition preference" value={preference} onChange={(event) => setPreference(event.target.value)}>
            <option value="">Select</option>
            <option value="baseline">Evidence-only view</option>
            <option value="recommended">Task-aware recommended view</option>
            <option value="no-preference">No preference</option>
          </select>
        </label>
        <label className="study-field">
          <span>Which view felt easier to use?</span>
          <select aria-label="Easier condition" value={easier} onChange={(event) => setEasier(event.target.value)}>
            <option value="">Select</option>
            <option value="baseline">Evidence-only view</option>
            <option value="recommended">Task-aware recommended view</option>
            <option value="no-difference">No difference</option>
          </select>
        </label>
        <button
          className="button primary"
          type="button"
          disabled={!clarity || !preference || !easier}
          onClick={() => onSubmit(clarity, preference, easier)}
        >
          Save responses and view debrief
        </button>
        {statusMessage && <p role="alert">{statusMessage}</p>}
      </section>
    </main>
  );
}
