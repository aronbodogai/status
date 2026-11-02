import { DAY, dayKey } from './time.mjs';

/**
 * data/monitor.json holds what the hourly check found, written only when something changes:
 *
 *   lastCheck   the last run that saved anything; the first run of every UTC day saves, so it's never a day old
 *   components  per component: up or down, since when, and when it was first checked
 *   outages     each time a component stopped responding, until it answered again (end is null until then)
 *   missedDays  UTC days with no run at all, so their bars show "no data" instead of a guess
 */
export const emptyMonitor = () => ({ lastCheck: null, components: {}, outages: [], missedDays: [] });

/**
 * Folds one run of check results ({ id, ok, detail } per component) into `monitor`, in place.
 * Returns what changed, for the commit message. An empty list means there's nothing to save.
 */
export function applyResults(monitor, results, now) {
  const at = new Date(now).toISOString();
  const changes = [];
  for (const { id, ok, detail } of results) {
    const state = monitor.components[id];
    if (!state) {
      monitor.components[id] = { status: ok ? 'up' : 'down', since: at, firstCheck: at };
      if (!ok) monitor.outages.push({ component: id, start: at, end: null, detail });
      changes.push(ok ? `start checking ${id}` : `start checking ${id}, down (${detail})`);
    } else if (state.status === 'up' && !ok) {
      Object.assign(state, { status: 'down', since: at });
      monitor.outages.push({ component: id, start: at, end: null, detail });
      changes.push(`${id} down (${detail})`);
    } else if (state.status === 'down' && ok) {
      Object.assign(state, { status: 'up', since: at });
      for (const outage of monitor.outages) if (outage.component === id && !outage.end) outage.end = at;
      changes.push(`${id} back up`);
    }
  }

  const today = dayKey(now);
  const lastDay = monitor.lastCheck && dayKey(Date.parse(monitor.lastCheck));
  if (lastDay !== today) {
    if (lastDay) {
      for (let day = Date.parse(lastDay) + DAY; dayKey(day) < today; day += DAY) monitor.missedDays.push(dayKey(day));
    }
    if (changes.length === 0) changes.push('daily check-in');
  }
  if (changes.length > 0) monitor.lastCheck = at;
  return changes;
}
