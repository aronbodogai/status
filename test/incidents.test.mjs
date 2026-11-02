import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseIncident } from '../src/incidents.mjs';

const config = {
  timezone: 'Europe/Budapest',
  groups: [
    { id: 'app', name: 'App', components: [{ id: 'web' }, { id: 'api' }] },
    { id: 'blog', name: 'Blog', components: [{ id: 'site' }] },
  ],
};

const incident = (front, body) => `---\n${front}\n---\n\n${body}\n`;

test('reads front matter and updates, newest first', () => {
  const parsed = parseIncident(
    'sync',
    incident(
      'title: "Sync is failing"\n# a comment\nimpact: major\ncomponents: web, blog',
      '## Investigating · 2026-11-02 13:55\nLooking.\n\n## Resolved - 2026-11-02 14:40 Z\nFixed.',
    ),
    config,
  );
  assert.equal(parsed.title, 'Sync is failing');
  assert.equal(parsed.url, '/incidents/sync/');
  assert.deepEqual(parsed.components, ['web', 'site']);
  assert.deepEqual(
    parsed.updates.map((u) => u.status),
    ['resolved', 'investigating'],
  );
  assert.equal(parsed.status, 'resolved');
  assert.equal(new Date(parsed.start).toISOString(), '2026-11-02T12:55:00.000Z');
  assert.equal(new Date(parsed.end).toISOString(), '2026-11-02T14:40:00.000Z');
  assert.equal(parsed.updates[1].html, '<p>Looking.</p>');
});

test('an incident is open until its newest update is Resolved, and start: moves the start back', () => {
  const parsed = parseIncident(
    'slow',
    incident('title: Slow\nimpact: degraded\ncomponents: app\nstart: 2026-11-02 08:00', '## Monitoring · 2026-11-02 10:00\nBetter.'),
    config,
  );
  assert.equal(parsed.end, null);
  assert.equal(parsed.status, 'monitoring');
  assert.deepEqual(parsed.components, ['web', 'api']);
  assert.equal(new Date(parsed.start).toISOString(), '2026-11-02T07:00:00.000Z');
});

test('Windows line endings are fine', () => {
  const parsed = parseIncident('crlf', incident('title: A\nimpact: partial\ncomponents: api', '## Update · 2026-11-02 10:00\nText.').replace(/\n/g, '\r\n'), config);
  assert.equal(parsed.updates[0].html, '<p>Text.</p>');
});

test('mistakes are reported with the file name', () => {
  const cases = [
    ['no front matter', '## Update · 2026-11-02 10:00', /front matter/],
    [incident('impact: major\ncomponents: web', '## Update · 2026-11-02 10:00'), null, /add a title/],
    [incident('title: A\nimpact: huge\ncomponents: web', '## Update · 2026-11-02 10:00'), null, /impact must be one of/],
    [incident('title: A\nimpact: major\ncomponents: nope', '## Update · 2026-11-02 10:00'), null, /no component or group "nope"/],
    [incident('title: A\nimpact: major\ncomponents: web', 'Text first\n\n## Update · 2026-11-02 10:00'), null, /under a "## Status · time" heading/],
    [incident('title: A\nimpact: major\ncomponents: web', '## Fixed · 2026-11-02 10:00'), null, /should start with one of/],
    [incident('title: A\nimpact: major\ncomponents: web', '## Resolved · yesterday'), null, /write the time as/],
    [incident('title: A\nimpact: major\ncomponents: web', ''), null, /at least one update/],
  ];
  for (const [source, , error] of cases) {
    assert.throws(() => parseIncident('broken', source, config), (e) => e.message.startsWith('incidents/broken.md: ') && error.test(e.message));
  }
});
