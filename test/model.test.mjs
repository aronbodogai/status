import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseIncident } from '../src/incidents.mjs';
import { buildModel, formatUptime, history } from '../src/model.mjs';

const config = {
  title: 'Test status',
  url: 'https://status.example.com',
  timezone: 'UTC',
  days: 2,
  groups: [
    {
      id: 'app',
      name: 'App',
      components: [
        { id: 'web', name: 'Web' },
        { id: 'api', name: 'API' },
      ],
    },
    { id: 'blog', name: 'Blog', components: [{ id: 'site', name: 'Site' }] },
  ],
};

// Two days of bars: all of Nov 2, and Nov 3 until noon. 2160 watched minutes per component.
const now = Date.parse('2026-11-03T12:00:00Z');
const firstCheck = '2026-11-01T00:00:00.000Z';
const monitor = (overrides = {}) => ({
  lastCheck: '2026-11-03T00:17:00.000Z',
  components: Object.fromEntries(['web', 'api', 'site'].map((id) => [id, { status: 'up', since: firstCheck, firstCheck }])),
  outages: [],
  missedDays: [],
  ...overrides,
});
const incident = (slug, front, updates) => parseIncident(slug, `---\n${front}\n---\n${updates}`, config);
const component = (model, id) => model.components.find((c) => c.id === id);

test('everything up is 100%, with green days', () => {
  const model = buildModel({ config, incidents: [], monitor: monitor(), now });
  assert.equal(formatUptime(component(model, 'web').uptime), '100% uptime');
  assert.deepEqual(
    component(model, 'web').bars.map((bar) => bar.severity),
    ['ok', 'ok'],
  );
  assert.equal(model.overall.title, 'All systems operational');
});

test('an outage the check found counts in full', () => {
  const outages = [{ component: 'web', start: '2026-11-02T10:00:00.000Z', end: '2026-11-02T11:00:00.000Z', detail: 'HTTP 503' }];
  const model = buildModel({ config, incidents: [], monitor: monitor({ outages }), now });
  const web = component(model, 'web');
  assert.equal(formatUptime(web.uptime), '97.22% uptime');
  assert.deepEqual(web.bars[0], {
    day: Date.parse('2026-11-02T00:00:00Z'),
    severity: 'major',
    watched: 1440,
    down: 60,
    outage: 60,
    events: ['Not responding (HTTP 503)'],
  });
  assert.deepEqual(
    history(model).map((entry) => entry.id),
    ['outage-web-20261102T100000Z'],
  );
});

test('a partial outage counts 30%, degraded performance not at all', () => {
  const incidents = [
    incident('partial', 'title: P\nimpact: partial\ncomponents: api', '## Investigating · 2026-11-03 00:00\n\n## Resolved · 2026-11-03 02:00'),
    incident('slow', 'title: S\nimpact: degraded\ncomponents: site', '## Investigating · 2026-11-02 00:00\n\n## Resolved · 2026-11-02 23:00'),
  ];
  const model = buildModel({ config, incidents, monitor: monitor(), now });
  assert.equal(formatUptime(component(model, 'api').uptime), '98.33% uptime');
  assert.equal(component(model, 'api').bars[1].severity, 'partial');
  assert.equal(formatUptime(component(model, 'site').uptime), '100% uptime');
  assert.equal(component(model, 'site').bars[0].severity, 'degraded');
});

test('an incident about an outage hides it from history, and overlapping time counts once', () => {
  const outages = [{ component: 'web', start: '2026-11-02T10:00:00.000Z', end: '2026-11-02T11:00:00.000Z', detail: 'HTTP 503' }];
  const incidents = [
    incident('down', 'title: Web is down\nimpact: major\ncomponents: web', '## Investigating · 2026-11-02 10:30\n\n## Resolved · 2026-11-02 12:00'),
  ];
  const model = buildModel({ config, incidents, monitor: monitor({ outages }), now });
  assert.equal(component(model, 'web').bars[0].down, 120);
  assert.deepEqual(component(model, 'web').bars[0].events, ['Web is down']);
  assert.deepEqual(
    history(model).map((entry) => entry.title),
    ['Web is down'],
  );
  assert.equal(model.outages[0].coveredBy.slug, 'down');
});

test('days without checks have no data and are left out of uptime', () => {
  const model = buildModel({ config, incidents: [], monitor: monitor({ missedDays: ['2026-11-02'] }), now });
  const site = component(model, 'site');
  assert.deepEqual(
    site.bars.map((bar) => bar.severity),
    ['none', 'ok'],
  );
  assert.equal(site.bars[1].watched, 720);
  assert.equal(formatUptime(site.uptime), '100% uptime');
});

test('before the first check there is no data', () => {
  const components = { ...monitor().components, site: { status: 'up', since: now, firstCheck: '2026-11-03T06:00:00.000Z' } };
  const site = component(buildModel({ config, incidents: [], monitor: monitor({ components }), now }), 'site');
  assert.deepEqual(
    site.bars.map((bar) => [bar.severity, bar.watched]),
    [
      ['none', 0],
      ['ok', 360],
    ],
  );
});

test('current status: a component the check finds down, and an open incident', () => {
  const components = { ...monitor().components, api: { status: 'down', since: '2026-11-03T11:17:00.000Z', firstCheck } };
  const outages = [{ component: 'api', start: '2026-11-03T11:17:00.000Z', end: null, detail: 'No response in 10 s' }];
  const incidents = [incident('slow', 'title: Slow\nimpact: degraded\ncomponents: site', '## Investigating · 2026-11-03 09:00')];
  const model = buildModel({ config, incidents, monitor: monitor({ components, outages }), now });
  assert.equal(component(model, 'api').statusLabel, 'Not responding');
  assert.equal(component(model, 'site').statusLabel, 'Degraded performance');
  assert.equal(model.groups[0].statusLabel, 'Not responding');
  assert.equal(model.overall.title, 'Major outage');
  assert.equal(model.overall.detail, 'Affects App API and Blog Site.');
});

test('a component never checked shows no data', () => {
  const components = { web: monitor().components.web };
  const model = buildModel({ config, incidents: [], monitor: monitor({ components }), now });
  assert.equal(component(model, 'api').statusLabel, 'No data yet');
  assert.equal(formatUptime(component(model, 'api').uptime), 'No data yet');
  assert.equal(model.overall.title, 'All systems operational');
});
