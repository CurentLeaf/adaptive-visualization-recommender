import { z } from 'zod';
import { isAllowedParentOrigin } from './iframeBridge';
import { isValidTrialTuple } from './protocol';

const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const paramsSchema = z.object({
  contractVersion: z.literal(1),
  trialId: z.string().regex(idPattern),
  scenarioFamily: z.enum(['corroboration', 'conflict', 'uncertain', 'quality', 'anomaly']),
  taskVariant: z.enum(['A', 'B']),
  condition: z.enum(['baseline', 'recommended']),
  stimulusSeed: z.literal(271828),
}).strict();

export type VisualizationParams = z.infer<typeof paramsSchema>;

export function parseVisualizationParams(value: unknown): VisualizationParams | null {
  const parsed = paramsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function createVisualizationHandshake(
  location: Pick<Location, 'search'>,
  target: Window,
  referrer: string,
  trustedOrigins: readonly string[],
  allowHttpLoopback = false,
) {
  const query = new URLSearchParams(location.search);
  const id = query.get('id');
  const componentTrialId = query.get('trialid');
  const parentOrigin = query.get('parentOrigin');
  let referrerOrigin: string | null = null;
  try { referrerOrigin = referrer ? new URL(referrer).origin : null; } catch { /* Fail closed. */ }
  const origin = isAllowedParentOrigin(parentOrigin, trustedOrigins, allowHttpLoopback)
    && parentOrigin === referrerOrigin ? parentOrigin : null;
  const enabled = Boolean(id && idPattern.test(id) && componentTrialId && idPattern.test(componentTrialId)
    && origin && target !== target.parent);
  let started = false;
  let received = false;
  let sentViewReady = false;
  let acceptedParams: VisualizationParams | null = null;
  let callback: ((params: VisualizationParams | null) => void) | undefined;
  const viewMessage = (type: '@REVISIT_COMMS/VIEW_READY' | '@REVISIT_COMMS/VIEW_NOT_READY') => ({
    error: false,
    type,
    iframeId: id,
    message: { contractVersion: 1, trialId: componentTrialId },
  });
  const receive = (event: MessageEvent) => {
    if (!enabled || event.source !== target.parent || event.origin !== origin) return;
    const envelope = event.data;
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return;
    const message = envelope as Record<string, unknown>;
    if (message.error !== false || message.iframeId !== id || message.type !== '@REVISIT_COMMS/STUDY_DATA') return;
    const params = parseVisualizationParams(message.message);
    const validParams = params && isValidTrialTuple(params.trialId, params.scenarioFamily, params.taskVariant, params.condition) ? params : null;
    if (!received) received = true;
    if (!validParams) {
      if (sentViewReady) target.parent.postMessage(viewMessage('@REVISIT_COMMS/VIEW_NOT_READY'), origin!);
      acceptedParams = null;
      sentViewReady = false;
      callback?.(null);
      return;
    }
    const sameTrial = acceptedParams !== null && acceptedParams.trialId === validParams.trialId
      && acceptedParams.scenarioFamily === validParams.scenarioFamily
      && acceptedParams.taskVariant === validParams.taskVariant
      && acceptedParams.condition === validParams.condition
      && acceptedParams.stimulusSeed === validParams.stimulusSeed;
    if (!sameTrial && sentViewReady) {
      target.parent.postMessage(viewMessage('@REVISIT_COMMS/VIEW_NOT_READY'), origin!);
      sentViewReady = false;
    }
    acceptedParams = validParams;
    callback?.(validParams);
    if (sameTrial && sentViewReady) target.parent.postMessage(viewMessage('@REVISIT_COMMS/VIEW_READY'), origin!);
  };
  return {
    enabled,
    start(onParams: (params: VisualizationParams | null) => void) {
      if (!enabled || started) return;
      started = true;
      callback = onParams;
      target.addEventListener('message', receive);
      target.parent.postMessage({ error: false, type: '@REVISIT_COMMS/WINDOW_READY', iframeId: id, message: {} }, origin!);
    },
    viewReady() {
      if (!enabled || !received || !acceptedParams || sentViewReady) return;
      sentViewReady = true;
      target.parent.postMessage(viewMessage('@REVISIT_COMMS/VIEW_READY'), origin!);
    },
    viewNotReady() {
      if (!enabled || !received || !acceptedParams) return;
      sentViewReady = false;
      target.parent.postMessage(viewMessage('@REVISIT_COMMS/VIEW_NOT_READY'), origin!);
    },
    dispose() { target.removeEventListener('message', receive); },
  };
}
