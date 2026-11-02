import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyResults, emptyMonitor } from '../src/monitor.mjs';

const at = (time) => Date.parse(`2026-11-${time}Z`);
const up = (id) => ({ id, ok: true, detail: 'HTTP 200' });
const down = (id) => ({ id, ok: false, detail: 'HTTP 503' });

test('the first run starts checking every component and saves', () => {
  const monitor = emptyMonitor();
  const changes = applyResults(monitor, [up('web'), down('api')], at('02T10:17:00'));
  assert.deepEqual(changes, ['start checking web', 'start checking api, down (HTTP 503)']);
  assert.equal(monitor.lastCheck, '2026-11-02T10:17:00.000Z');
  assert.deepEqual(monitor.components.web, { status: 'up', since: monitor.lastCheck, firstCheck: monitor.lastCheck });
  assert.deepEqual(monitor.outages, [{ component: 'api', start: monitor.lastCheck, end: null, detail: 'HTTP 503' }]);
});

test('later runs save only when something changes', () => {
  const monitor = emptyMonitor();
  applyResults(monitor, [up('web')], at('02T10:17:00'));
  assert.deepEqual(applyResults(monitor, [up('web')], at('02T11:17:00')), []);
  assert.equal(monitor.lastCheck, '2026-11-02T10:17:00.000Z');

  assert.deepEqual(applyResults(monitor, [down('web')], at('02T12:17:00')), ['web down (HTTP 503)']);
  assert.deepEqual(applyResults(monitor, [down('web')], at('02T13:17:00')), []);
  assert.deepEqual(applyResults(monitor, [up('web')], at('02T14:17:00')), ['web back up']);
  assert.deepEqual(monitor.outages, [
    { component: 'web', start: '2026-11-02T12:17:00.000Z', end: '2026-11-02T14:17:00.000Z', detail: 'HTTP 503' },
  ]);
  assert.equal(monitor.components.web.since, '2026-11-02T14:17:00.000Z');
  assert.equal(monitor.lastCheck, '2026-11-02T14:17:00.000Z');
});

test('the first run of a day checks in, and days without any run are recorded', () => {
  const monitor = emptyMonitor();
  applyResults(monitor, [up('web')], at('02T23:17:00'));
  assert.deepEqual(applyResults(monitor, [up('web')], at('03T00:17:00')), ['daily check-in']);
  assert.deepEqual(monitor.missedDays, []);
  assert.deepEqual(applyResults(monitor, [up('web')], at('06T09:17:00')), ['daily check-in']);
  assert.deepEqual(monitor.missedDays, ['2026-11-04', '2026-11-05']);
  assert.equal(monitor.lastCheck, '2026-11-06T09:17:00.000Z');
});
