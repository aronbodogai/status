import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import config from '../site.config.mjs';
import { loadIncidents } from '../src/incidents.mjs';
import { buildModel } from '../src/model.mjs';
import { renderSite } from '../src/pages.mjs';

const fixtures = new URL('./fixtures/', import.meta.url);

test('the real config renders the fixture history into every page', async () => {
  const incidents = await loadIncidents(fileURLToPath(new URL('incidents/', fixtures)), config);
  const monitor = JSON.parse(readFileSync(new URL('monitor.json', fixtures), 'utf8'));
  const files = renderSite(buildModel({ config, incidents, monitor, now: Date.parse('2026-11-02T21:00:00Z') }));

  assert.deepEqual([...files.keys()].sort(), [
    '404.html',
    'feed.xml',
    'feed/aroncreates.xml',
    'feed/episodic.xml',
    'feed/inventory.xml',
    'history/index.html',
    'incidents/2026-09-03-slow-emails/index.html',
    'incidents/2026-10-14-inventory-sync/index.html',
    'incidents/2026-11-02-calendar-late/index.html',
    'index.html',
    'subscribe/index.html',
  ]);

  const index = files.get('index.html');
  assert.match(index, /<h1>Major outage<\/h1>/);
  assert.match(index, /Episodic Web reminders isn(?:'|&#39;)t responding/);
  assert.match(index, /<a href="\/incidents\/2026-11-02-calendar-late\/">Calendar feeds update late<\/a>/);
  assert.match(index, /<link rel="alternate" type="application\/rss\+xml" title="Episodic" href="https:\/\/status.aroncreates.com\/feed\/episodic.xml">/);
  assert.equal((index.match(/class="bar /g) ?? []).length, config.days * 9);

  const historyPage = files.get('history/index.html');
  assert.match(historyPage, /aroncreates.com Website wasn(?:'|&#39;)t responding/);
  // The Inventory outage on Oct 14 is covered by the incident written about it.
  assert.doesNotMatch(historyPage, /Inventory Accounts and sync wasn/);
  assert.match(historyPage, /<h2>August 2026<\/h2>\n\n<p class="empty">No incidents reported<\/p>/);

  assert.match(files.get('incidents/2026-10-14-inventory-sync/index.html'), /A database migration broke the <strong>sync<\/strong> policy/);
});

test('the template is skipped and the real incidents folder builds', async () => {
  const incidents = await loadIncidents(fileURLToPath(new URL('../incidents/', import.meta.url)), config);
  assert.ok(incidents.every((incident) => !incident.slug.startsWith('_')));
});
