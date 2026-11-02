export const MINUTE = 60_000;
export const DAY = 86_400_000;

const TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(Z|UTC|[+-]\d{2}:?\d{2})?$/i;

/**
 * Reads "2026-11-02 14:40", "2026-11-02T14:40:00Z" or "2026-11-02 14:40 +01:00". A time without an offset
 * is wall-clock time in `timeZone`. Returns null for anything else, including days that don't exist.
 */
export function parseTime(text, timeZone) {
  const match = TIME.exec(text.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '0', zone] = match;
  if (+month < 1 || +month > 12 || +hour > 23 || +minute > 59 || +second > 59) return null;
  const wall = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  // Date.UTC rolls 2026-02-30 over into March.
  if (new Date(wall).getUTCDate() !== +day) return null;

  if (zone && /^(z|utc)$/i.test(zone)) return new Date(wall);
  if (zone) {
    const [, sign, hours, minutes] = /^([+-])(\d{2}):?(\d{2})$/.exec(zone);
    return new Date(wall - (sign === '-' ? -1 : 1) * (+hours * 60 + +minutes) * MINUTE);
  }
  // Guess, then correct by the zone's offset at the guess. The second pass settles times near a DST change.
  let time = wall;
  for (let pass = 0; pass < 2; pass++) time = wall - zoneOffset(time, timeZone) * MINUTE;
  return new Date(time);
}

/** How many minutes `timeZone` is ahead of UTC at `time`. */
function zoneOffset(time, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(new Date(time))
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - time) / MINUTE);
}

/** The UTC day of `time`, as 2026-11-02. */
export const dayKey = (time) => new Date(time).toISOString().slice(0, 10);

export const startOfDay = (time) => Math.floor(time / DAY) * DAY;

/** A compact UTC timestamp for ids and anchors: 20261102T144000Z. */
export const stamp = (time) => new Date(time).toISOString().replace(/\.\d{3}/, '').replace(/[-:]/g, '');

const dateTimeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' });
const dateFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', dateStyle: 'medium' });
const weekdayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const monthFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' });

/** 2 Nov 2026, 14:40 UTC. Pages show it until app.js swaps in the reader's own time zone. */
export const formatUtc = (time) => `${dateTimeFormat.format(time)} UTC`;
export const formatDate = (time) => dateFormat.format(time);
export const formatWeekday = (time) => weekdayFormat.format(time);
export const formatMonth = (time) => monthFormat.format(time);

/** 45 min, 2 h 5 min, 3 days 4 h. */
export function formatDuration(ms) {
  const minutes = Math.max(1, Math.round(ms / MINUTE));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'}${hours % 24 ? ` ${hours % 24} h` : ''}`;
}
