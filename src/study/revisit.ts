import type { ScenarioId } from '../domain/types';

const PREFIX = '@REVISIT_COMMS';
export const REVISIT_RESPONSE_ID = 'avrTrial';
const scenarios: ScenarioId[] = ['corroboration', 'uncertain', 'conflict', 'anomaly', 'quality'];

/** Query conditions are for previews; reVISit parameters remain authoritative in an iframe. */
export function readStudyQuery(search: string): {
  scenario?: ScenarioId;
  technique?: string;
  assigned: boolean;
} {
  const query = new URLSearchParams(search);
  const scenario = query.get('scenario');
  return {
    scenario: scenarios.includes(scenario as ScenarioId) ? (scenario as ScenarioId) : undefined,
    technique: query.get('technique') || undefined,
    assigned: !['0', 'false'].includes(query.get('assigned') ?? ''),
  };
}

/**
 * The WebsiteComponent protocol used by reVISit's official revisit-communicate.js.
 * See docs/revisit-study.md for the matching required reactive response.
 */
export function createRevisitBridge({
  onStudyData,
}: {
  onStudyData: (parameters: unknown) => void;
}) {
  const iframeId = new URLSearchParams(window.location.search).get('id');
  const host = window.parent;
  const embedded = host !== window && Boolean(iframeId);
  let connected = false;
  let destroyed = false;
  // A local WebsiteComponent and this app share an origin. A referrer also supports
  // explicit cross-origin hosts that supply the required iframe ID themselves.
  let hostOrigin = window.location.origin;
  if (document.referrer) {
    try {
      hostOrigin = new URL(document.referrer).origin;
    } catch {
      // A malformed referrer does not broaden the permitted origin.
    }
  }
  const post = (tag: string, message?: unknown) => {
    if (!embedded || destroyed) return;
    host.postMessage({ error: false, type: `${PREFIX}/${tag}`, iframeId, message }, hostOrigin);
  };
  const ready = () => post('WINDOW_READY');
  const receive = (event: MessageEvent) => {
    if (
      !embedded ||
      destroyed ||
      event.source !== host ||
      event.origin !== hostOrigin ||
      !event.data ||
      typeof event.data !== 'object' ||
      event.data.iframeId !== iframeId ||
      event.data.type !== `${PREFIX}/STUDY_DATA`
    )
      return;
    connected = true;
    onStudyData(event.data.message);
    post('READY', {
      documentHeight: document.documentElement.scrollHeight,
      documentWidth: document.documentElement.scrollWidth,
    });
  };
  window.addEventListener('message', receive);
  window.addEventListener('load', ready);
  ready();
  return {
    get connected() {
      return connected && !destroyed;
    },
    /** Completion alone unlocks reVISit's required response; drafts stay inside the stimulus. */
    sendAnswer(payload: Record<string, unknown>): boolean {
      if (!connected || destroyed || payload.completion !== true) return false;
      post('ANSWERS', { [REVISIT_RESPONSE_ID]: JSON.stringify(payload) });
      return true;
    },
    destroy() {
      destroyed = true;
      connected = false;
      window.removeEventListener('message', receive);
      window.removeEventListener('load', ready);
    },
  };
}
