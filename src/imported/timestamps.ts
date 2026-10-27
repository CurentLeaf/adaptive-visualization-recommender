import type { ParsedTimestamp, TimestampField } from './types';

const PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * Strict ISO 8601 parsing. A timestamp without an explicit offset (including date-only values)
 * is timezone-ambiguous and is never given an epoch value.
 */
export function parseTimestamp(raw: string): ParsedTimestamp {
  const match = PATTERN.exec(raw.trim());
  if (!match) return { status: 'invalid', reason: 'Not an ISO 8601 date-time' };
  const [, ys, ms, ds, hs, mis, ss, frac, zone] = match;
  const [year, month, day] = [Number(ys), Number(ms), Number(ds)];
  const hour = hs === undefined ? 0 : Number(hs);
  const minute = mis === undefined ? 0 : Number(mis);
  const second = ss === undefined ? 0 : Number(ss);
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  )
    return { status: 'invalid', reason: 'Calendar date does not exist' };
  if (hour > 23 || minute > 59 || second > 59)
    return { status: 'invalid', reason: 'Time of day out of range' };
  if (hs === undefined) return { status: 'ambiguous_timezone', reason: 'date_only' };
  if (zone === undefined) return { status: 'ambiguous_timezone', reason: 'no_offset' };
  let offsetMinutes = 0;
  if (zone !== 'Z') {
    const oh = Number(zone.slice(1, 3));
    const om = Number(zone.slice(4, 6));
    if (oh > 23 || om > 59) return { status: 'invalid', reason: 'UTC offset out of range' };
    offsetMinutes = (zone[0] === '-' ? -1 : 1) * (oh * 60 + om);
  }
  const millis = frac ? Number(frac.slice(0, 3).padEnd(3, '0')) : 0;
  probe.setUTCHours(hour, minute, second, millis);
  return { status: 'valid', epochMs: probe.getTime() - offsetMinutes * 60000, offset: zone };
}

export function timestampField(present: boolean, raw: unknown): TimestampField {
  if (!present) return { state: 'missing' };
  if (raw === null) return { state: 'null' };
  if (typeof raw !== 'string') return { state: 'invalid_type', raw };
  return { state: 'value', raw, parsed: parseTimestamp(raw) };
}

/** Epoch milliseconds only when the original string has an explicit offset. */
export const epochOf = (field: TimestampField): number | null =>
  field.state === 'value' && field.parsed.status === 'valid' ? field.parsed.epochMs : null;

export const timestampLabel = (field: TimestampField): string =>
  field.state === 'value'
    ? field.raw
    : field.state === 'null'
      ? 'null'
      : field.state === 'missing'
        ? '(missing)'
        : `(non-string: ${JSON.stringify(field.raw)})`;
