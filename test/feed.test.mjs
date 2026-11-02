import assert from 'node:assert/strict';
import { test } from 'node:test';

import { feedItems, feeds, renderFeed } from '../src/feed.mjs';
import { parseIncident } from '../src/incidents.mjs';
import { buildModel } from '../src/model.mjs';

const config = {
  title: 'Test status',
  url: 'https://status.example.com',
  timezone: 'UTC',
  days: 2,
  groups: [
    { id: 'app', name: 'App', components: [{ id: 'web', name: 'Web' }] },
    { id: 'blog', name: 'Blog', components: [{ id: 'site', name: 'Site' }] },
  ],
};

const firstCheck = '2026-11-01T00:00:00.000Z';
const model = buildModel({
  config,
  now: Date.parse('2026-11-03T12:00:00Z'),
  incidents: [
    parseIncident(
      'login',
      `---\ntitle: Log-in <fails> & more\nimpact: major\ncomponents: web\n---\n## Investigating · 2026-11-02 10:00\nLooking.\n\n## Identified · 2026-11-02 10:20\nFound it.\n\n## Resolved · 2026-11-02 11:00\nFixed.`,
      config,
    ),
  ],
  monitor: {
    lastCheck: '2026-11-03T00:17:00.000Z',
    components: {
      web: { status: 'up', since: firstCheck, firstCheck },
      site: { status: 'up', since: firstCheck, firstCheck },
    },
    outages: [{ component: 'site', start: '2026-11-03T08:17:00.000Z', end: '2026-11-03T09:17:00.000Z', detail: 'HTTP 522' }],
    missedDays: [],
  },
});

test('every update and every outage change is an item of its own, newest first', () => {
  const items = feedItems(model);
  assert.deepEqual(
    items.map((item) => item.title),
    [
      'Blog Site is back up',
      "Blog Site isn't responding",
      'Log-in <fails> & more: Resolved',
      'Log-in <fails> & more: Identified',
      'Log-in <fails> & more: Investigating',
    ],
  );
  assert.equal(new Set(items.map((item) => item.guid)).size, items.length);
  assert.equal(items[2].link, 'https://status.example.com/incidents/login/#update-20261102T110000Z');
});

test('group feeds only carry their group', () => {
  const [all, app, blog] = feeds(model);
  assert.equal(all.path, '/feed.xml');
  assert.equal((renderFeed(model, all).match(/<item>/g) ?? []).length, 5);
  assert.equal((renderFeed(model, app).match(/<item>/g) ?? []).length, 3);
  assert.equal((renderFeed(model, blog).match(/<item>/g) ?? []).length, 2);
});

test('the feed is escaped XML that points at itself', () => {
  const xml = renderFeed(model, feeds(model)[1]);
  assert.match(xml, /^<\?xml version="1.0" encoding="utf-8"\?>\n<rss version="2.0"/);
  assert.match(xml, /<title>Log-in &lt;fails&gt; &amp; more: Resolved<\/title>/);
  assert.match(xml, /<atom:link href="https:\/\/status.example.com\/feed\/app.xml" rel="self"/);
  assert.match(xml, /<pubDate>Mon, 02 Nov 2026 11:00:00 GMT<\/pubDate>/);
  assert.match(xml, /<description>&lt;p&gt;&lt;strong&gt;Resolved&lt;\/strong&gt;/);
  assert.doesNotMatch(xml, /<fails>/);
});
