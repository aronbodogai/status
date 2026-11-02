import { DAY, MINUTE, dayKey, startOfDay, stamp } from './time.mjs';

export const SEVERITIES = ['ok', 'degraded', 'partial', 'major'];
export const IMPACT_LABELS = {
  ok: 'Operational',
  degraded: 'Degraded performance',
  partial: 'Partial outage',
  major: 'Major outage',
};
export const STATUS_LABELS = {
  investigating: 'Investigating',
  identified: 'Identified',
  monitoring: 'Monitoring',
  update: 'Update',
  resolved: 'Resolved',
};

/** How much of each minute counts as down in the uptime percentage. Outages the check finds count as major. */
const DOWNTIME = { degraded: 0, partial: 0.3, major: 1 };
const MINUTES_PER_DAY = DAY / MINUTE;

const worse = (a, b) => (SEVERITIES.indexOf(b) > SEVERITIES.indexOf(a) ? b : a);
const listFormat = new Intl.ListFormat('en-GB', { type: 'conjunction' });
export const list = (items) => listFormat.format(items);

/**
 * Everything the pages and feeds show, worked out once from the config, the incident files and
 * data/monitor.json, as of `now`.
 */
export function buildModel({ config, incidents, monitor, now }) {
  const components = config.groups.flatMap((group) =>
    group.components.map((component) => ({ ...component, group, fullName: `${group.name} ${component.name}` })),
  );
  const byId = new Map(components.map((component) => [component.id, component]));
  const overlaps = (a, b) => a.start <= (b.end ?? now) && b.start <= (a.end ?? now);

  const outages = monitor.outages
    .filter((outage) => byId.has(outage.component))
    .map((outage) => {
      const start = Date.parse(outage.start);
      const entry = {
        kind: 'outage',
        id: `outage-${outage.component}-${stamp(start)}`,
        component: byId.get(outage.component),
        components: [outage.component],
        groups: [byId.get(outage.component).group.id],
        impact: 'major',
        start,
        end: outage.end ? Date.parse(outage.end) : null,
        detail: outage.detail,
      };
      // When an incident was written up about the same thing, it tells the story, so history shows only that.
      entry.coveredBy =
        incidents.find((incident) => incident.components.includes(outage.component) && overlaps(incident, entry)) ?? null;
      return entry;
    })
    .sort((a, b) => b.start - a.start);

  const missed = new Set(monitor.missedDays);
  for (const component of components) {
    const state = monitor.components[component.id];
    const open = incidents.filter((incident) => incident.end === null && incident.components.includes(component.id));
    component.severity = open.reduce((severity, incident) => worse(severity, incident.impact), 'ok');
    component.statusLabel = IMPACT_LABELS[component.severity];
    if (state?.status === 'down') {
      if (component.severity !== 'major') component.statusLabel = 'Not responding';
      component.severity = 'major';
    } else if (!state && open.length === 0) {
      component.severity = 'none';
      component.statusLabel = 'No data yet';
    }

    const intervals = [
      ...incidents.filter((incident) => incident.components.includes(component.id)),
      ...outages
        .filter((outage) => outage.component === component)
        .map((outage) => ({ ...outage, title: outage.coveredBy ? null : `Not responding (${outage.detail})` })),
    ];
    component.firstCheck = state ? Date.parse(state.firstCheck) : null;
    component.bars = dailyBars(intervals, component.firstCheck, missed, now, config.days);
    component.uptime = uptime(component.bars);
    component.uptimeShort = uptime(component.bars.slice(-30));
  }

  const groups = config.groups.map((group) => {
    const members = components.filter((component) => component.group === group);
    const affected = members.filter((component) => SEVERITIES.indexOf(component.severity) > 0);
    return {
      ...group,
      components: members,
      severity: affected.reduce((severity, component) => worse(severity, component.severity), 'ok'),
      statusLabel:
        affected.length === 0 ? 'Operational' : affected.length === 1 ? affected[0].statusLabel : `${affected.length} affected`,
    };
  });

  const affected = components.filter((component) => SEVERITIES.indexOf(component.severity) > 0);
  const severity = affected.reduce((worst, component) => worse(worst, component.severity), 'ok');
  const groupIds = (ids) => groups.filter((group) => group.components.some((c) => ids.includes(c.id))).map((g) => g.id);
  const firstChecks = components.map((component) => component.firstCheck).filter((time) => time !== null);

  return {
    config,
    now,
    lastCheck: monitor.lastCheck,
    launch: Math.min(now, ...firstChecks, ...incidents.map((incident) => incident.start)),
    components,
    groups,
    incidents: incidents.map((incident) => ({ ...incident, groups: groupIds(incident.components) })),
    outages,
    overall: {
      severity,
      title: severity === 'ok' ? 'All systems operational' : IMPACT_LABELS[severity],
      detail:
        affected.length > 0
          ? `Affects ${list(affected.map((component) => component.fullName))}.`
          : 'No known problems, and everything answered the last hourly check.',
    },
  };
}

/** Incidents and the outages no incident covers, newest first. */
export function history(model) {
  return [...model.incidents, ...model.outages.filter((outage) => !outage.coveredBy)].sort((a, b) => b.start - a.start);
}

/** What's going on right now: unresolved incidents, and outages no incident covers yet. */
export function ongoing(model) {
  return history(model).filter((entry) => entry.end === null);
}

/** "Episodic: Web app, Calendar feed · Inventory", naming a whole group when every component in it is affected. */
export function describeComponents(model, ids) {
  return model.groups
    .map((group) => {
      const names = group.components.filter((component) => ids.includes(component.id)).map((component) => component.name);
      if (names.length === 0) return null;
      return names.length === group.components.length ? group.name : `${group.name}: ${names.join(', ')}`;
    })
    .filter(Boolean)
    .join(' · ');
}

export function formatUptime(percent) {
  if (percent === null) return 'No data yet';
  // Rounded down, so any downtime at all shows as less than 100%.
  return `${percent >= 100 ? '100' : (Math.floor(percent * 100) / 100).toFixed(2)}% uptime`;
}

/**
 * One entry per UTC day, oldest first: the worst severity that day, how many minutes were watched (checked
 * and after the first check), how many of those count as down, and the titles of what happened.
 */
function dailyBars(intervals, firstCheck, missed, now, days) {
  const today = startOfDay(now);
  return Array.from({ length: days }, (_, index) => {
    const dayStart = today - (days - 1 - index) * DAY;
    const dayEnd = Math.min(dayStart + DAY, now);
    const from = firstCheck === null ? Infinity : Math.max(dayStart, firstCheck);
    const watched = !missed.has(dayKey(dayStart)) && from < dayEnd;

    let severity = 'ok';
    const events = [];
    const weights = new Float64Array(MINUTES_PER_DAY);
    for (const interval of intervals) {
      const end = interval.end ?? now;
      if (interval.start >= dayStart + DAY || end < dayStart) continue;
      severity = worse(severity, interval.impact);
      if (interval.title && !events.includes(interval.title)) events.push(interval.title);
      const first = Math.max(0, Math.floor((interval.start - dayStart) / MINUTE));
      const last = Math.ceil((Math.min(end, dayEnd) - dayStart) / MINUTE);
      for (let minute = first; minute < last; minute++) {
        weights[minute] = Math.max(weights[minute], DOWNTIME[interval.impact]);
      }
    }

    let watchedMinutes = 0;
    let down = 0;
    let outage = 0;
    if (watched) {
      const first = Math.floor((from - dayStart) / MINUTE);
      const last = Math.ceil((dayEnd - dayStart) / MINUTE);
      watchedMinutes = last - first;
      for (let minute = first; minute < last; minute++) {
        down += weights[minute];
        if (weights[minute] === 1) outage++;
      }
    }
    if (severity === 'ok' && !watched) severity = 'none';
    return { day: dayStart, severity, watched: watchedMinutes, down, outage, events };
  });
}

function uptime(bars) {
  const watched = bars.reduce((sum, bar) => sum + bar.watched, 0);
  if (watched === 0) return null;
  return 100 * (1 - bars.reduce((sum, bar) => sum + bar.down, 0) / watched);
}
