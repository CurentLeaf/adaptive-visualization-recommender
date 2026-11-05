import type { ScenarioId } from '../../src/domain/types';
import type { TaskVariant } from './protocol';

export type TrialQuestion = {
  prompt: string;
  options: { id: string; label: string }[];
};

const questions: Record<ScenarioId, Record<TaskVariant, TrialQuestion>> = {
  corroboration: {
    A: {
      prompt: 'Do similar reports establish a count of distinct vehicles?',
      options: [
        { id: 'same-items', label: 'No. The reports may describe the same items, so their counts should not be added.' },
        { id: 'sum-counts', label: 'Yes. Add each source-reported count to obtain distinct vehicles.' },
        { id: 'single-source', label: 'Yes. Only one source made a report.' },
      ],
    },
    B: {
      prompt: 'Which sources are recorded as independently reporting similar counts?',
      options: [
        { id: 'four-sources', label: 'Observation Team Cedar, Imagery Review Desk, Road Patrol Log, and Community Contact Network.' },
        { id: 'one-source', label: 'Observation Team Cedar only.' },
        { id: 'all-sources', label: 'Every source in the dataset.' },
      ],
    },
  },
  conflict: {
    A: {
      prompt: 'How should the missing count from the Radio Log Monitor be interpreted?',
      options: [
        { id: 'unknown-not-zero', label: 'No count was recorded; missing is not zero.' },
        { id: 'zero-count', label: 'The source reported zero vehicles.' },
        { id: 'same-as-six', label: 'The source confirmed the count of about six.' },
      ],
    },
    B: {
      prompt: 'What do the available East Depot reports establish about the differing counts?',
      options: [
        { id: 'six-vs-four', label: 'Sources reported about six and four; the evidence does not establish a total inventory.' },
        { id: 'total-sixteen', label: 'The reports establish sixteen distinct vehicles.' },
        { id: 'all-six', label: 'Every source reported about six vehicles.' },
      ],
    },
  },
  uncertain: {
    A: {
      prompt: 'How long after observation did the Field Report Liaison report arrive?',
      options: [
        { id: 'four-hours', label: 'About four exercise hours.' },
        { id: 'one-hour', label: 'About one exercise hour.' },
        { id: 'eight-hours', label: 'About eight exercise hours.' },
      ],
    },
    B: {
      prompt: 'What does the report’s receipt time tell you about when the observation occurred?',
      options: [
        { id: 'observation-not-receipt', label: 'Observation and receipt are separate; late receipt does not move the observation time.' },
        { id: 'activity-at-receipt', label: 'The reported activity necessarily continued until receipt.' },
        { id: 'same-time', label: 'Observation and receipt always occurred at the same time.' },
      ],
    },
  },
  quality: {
    A: {
      prompt: 'Was the translated personnel-count range human verified?',
      options: [
        { id: 'not-verified', label: 'No. Human verification is not recorded.' },
        { id: 'verified', label: 'Yes. The range is human verified.' },
        { id: 'exact-count', label: 'Yes. The range establishes an exact count.' },
      ],
    },
    B: {
      prompt: 'How should the ambiguous translated range be represented?',
      options: [
        { id: 'unresolved-range', label: 'As an unresolved, source-reported range—not a precise count or a calibrated interval.' },
        { id: 'midpoint', label: 'As its midpoint, which is an exact count.' },
        { id: 'zero', label: 'As zero because the translation is unresolved.' },
      ],
    },
  },
  anomaly: {
    A: {
      prompt: 'Does rising report volume establish increased vehicle activity?',
      options: [
        { id: 'no-proof', label: 'No. Report frequency and coverage increased; activity is not established.' },
        { id: 'activity-increased', label: 'Yes. More reports prove more vehicle activity.' },
        { id: 'activity-decreased', label: 'Yes. The reports prove activity decreased.' },
      ],
    },
    B: {
      prompt: 'Which change is supported by the scripted reports?',
      options: [
        { id: 'frequency-and-coverage', label: 'Report frequency and reporting coverage increased; underlying activity remains unknown.' },
        { id: 'activity-and-coverage', label: 'Underlying vehicle activity and reporting coverage increased.' },
        { id: 'activity-only', label: 'Underlying vehicle activity increased; report coverage did not change.' },
      ],
    },
  },
};

export function getQuestion(scenario: ScenarioId, variant: TaskVariant): TrialQuestion {
  return questions[scenario][variant];
}
