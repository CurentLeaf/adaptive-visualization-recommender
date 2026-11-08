import { pilotSessionSchema, type PilotSession } from './protocol';

const PREFIX = '@REVISIT_COMMS';
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;

export function canSubmitHostedSession(startedInCurrentPage: boolean, session: PilotSession | null): session is PilotSession {
  return startedInCurrentPage && session?.status === 'complete' && pilotSessionSchema.safeParse(session).success;
}

export function isAllowedParentOrigin(
  value: string | null,
  trustedOrigins: readonly string[],
  allowHttpLoopback: boolean,
): value is string {
  if (!value || !trustedOrigins.includes(value)) return false;
  try {
    const parsed = new URL(value);
    if (parsed.origin !== value) return false;
    if (parsed.protocol === 'https:') return true;
    const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
    return allowHttpLoopback && parsed.protocol === 'http:' && loopbackHosts.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function createIframeBridge(
  location: Pick<Location, 'search' | 'origin'>,
  target: Window,
  referrer: string,
  onStudyData: (data: unknown) => void,
  trustedParentOrigins: readonly string[] = [],
  allowHttpLoopback = false,
) {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const trialId = params.get('trialid');
  const parentOrigin = params.get('parentOrigin');
  let ready = false;
  let receivedStudyData = false;
  let sentCompletion = false;
  let source: Window | null = null;
  let origin: string | null = null;
  let latestCompleteSession: PilotSession | null = null;

  const parsedOrigin = isAllowedParentOrigin(parentOrigin, trustedParentOrigins, allowHttpLoopback)
    ? parentOrigin
    : null;

  let referrerOrigin: string | null = null;
  try { referrerOrigin = referrer ? new URL(referrer).origin : null; } catch { /* No trustworthy referrer. */ }
  const enabled = Boolean(id && idPattern.test(id) && trialId && idPattern.test(trialId) && parsedOrigin && parsedOrigin === referrerOrigin && target !== target.parent);
  const deliverCompletion = () => {
    if (!latestCompleteSession || !receivedStudyData || !source || !origin || sentCompletion) return;
    sentCompletion = true;
    target.parent.postMessage({ error: false, type: `${PREFIX}/ANSWERS`, iframeId: id, message: { pilotSession: JSON.stringify(latestCompleteSession) } }, origin);
  };
  const receive = (event: MessageEvent) => {
    if (!enabled || event.source !== target.parent || event.origin !== parsedOrigin) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    const message = data as Record<string, unknown>;
    if (message.error !== false || message.iframeId !== id || typeof message.type !== 'string') return;
    if (message.type === `${PREFIX}/STUDY_DATA`) {
      if (receivedStudyData) return;
      receivedStudyData = true;
      source = event.source as Window;
      origin = event.origin;
      onStudyData(message.message);
      deliverCompletion();
    }
  };
  const start = () => {
    if (!enabled || ready) return;
    ready = true;
    target.addEventListener('message', receive);
    target.parent.postMessage({ error: false, type: `${PREFIX}/WINDOW_READY`, iframeId: id, message: {} }, parsedOrigin!);
  };
  const postSession = (session: PilotSession) => {
    if (!enabled || sentCompletion) return;
    const valid = pilotSessionSchema.safeParse(session);
    if (!valid.success || valid.data.status !== 'complete') return;
    latestCompleteSession = valid.data;
    deliverCompletion();
  };
  const resetCompletion = () => {
    latestCompleteSession = null;
    sentCompletion = false;
  };
  return { enabled, start, postSession, resetCompletion, dispose: () => target.removeEventListener('message', receive), get trialId() { return trialId; } };
}
