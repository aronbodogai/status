import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatDuration, parseTime, stamp } from '../src/time.mjs';

const iso = (text, zone = 'Europe/Budapest') => parseTime(text, zone)?.toISOString() ?? null;

test('a time without an offset is read in the given zone, summer time included', () => {
  assert.equal(iso('2026-11-02 14:40'), '2026-11-02T13:40:00.000Z');
  assert.equal(iso('2026-07-02 14:40'), '2026-07-02T12:40:00.000Z');
  assert.equal(iso('2026-11-02T09:05:30', 'America/New_York'), '2026-11-02T14:05:30.000Z');
});

test('an explicit offset or Z wins over the zone', () => {
  assert.equal(iso('2026-11-02 14:40Z'), '2026-11-02T14:40:00.000Z');
  assert.equal(iso('2026-11-02 14:40 UTC'), '2026-11-02T14:40:00.000Z');
  assert.equal(iso('2026-11-02T14:40 +0530'), '2026-11-02T09:10:00.000Z');
  assert.equal(iso('2026-11-02 14:40 -05:00'), '2026-11-02T19:40:00.000Z');
});

test('anything else is not a time', () => {
  for (const text of ['yesterday', '2026-11-02', '2026-02-30 10:00', '2026-11-02 24:00', '2026-13-01 10:00', '14:40']) {
    assert.equal(iso(text), null, text);
  }
});

test('durations read naturally', () => {
  assert.equal(formatDuration(0), '1 min');
  assert.equal(formatDuration(45 * 60_000), '45 min');
  assert.equal(formatDuration(60 * 60_000), '1 h');
  assert.equal(formatDuration(125 * 60_000), '2 h 5 min');
  assert.equal(formatDuration(26 * 3_600_000), '1 day 2 h');
  assert.equal(formatDuration(72 * 3_600_000), '3 days');
});

test('stamps are compact UTC', () => {
  assert.equal(stamp(Date.parse('2026-11-02T14:40:05.123Z')), '20261102T144005Z');
});
