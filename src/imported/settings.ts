import type { ImportedSettings, TemporalConfig } from './types';

export function defaultTemporalConfig(): TemporalConfig {
  return {
    asOfMeaning: 'unspecified',
    currentFlagMeaning: 'unspecified',
    intervalsConfirmed: false,
    endpointConvention: 'unspecified',
    nullValidTo: 'unconfirmed',
    nullValidFrom: 'unconfirmed',
    missingEndpointPolicy: 'unresolved',
    referenceTime: '',
    timestampField: 'as_of',
    origins: {},
  };
}

export function defaultSettings(): ImportedSettings {
  return { temporal: defaultTemporalConfig(), topicMap: {}, typeReview: {}, unitOverrides: {} };
}

/** Patching a temporal setting marks that setting as user-configured. */
export function patchTemporal(
  settings: ImportedSettings,
  patch: Partial<Omit<TemporalConfig, 'origins'>>,
): ImportedSettings {
  const origins = { ...settings.temporal.origins };
  for (const key of Object.keys(patch)) origins[key] = 'user_configured';
  return { ...settings, temporal: { ...settings.temporal, ...patch, origins } };
}
