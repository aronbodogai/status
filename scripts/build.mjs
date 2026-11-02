// Builds the status page into dist/: the overview, history, a page per incident, the RSS feeds, and
// everything in public/ copied as is. No dependencies, so it runs anywhere Node 22 does.
//
//   node scripts/build.mjs                                     the real site
//   node scripts/build.mjs --incidents test/fixtures/incidents \
//     --data test/fixtures/monitor.json --now 2026-11-02T21:00:00Z   a preview with made-up history

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import config from '../site.config.mjs';
import { loadIncidents } from '../src/incidents.mjs';
import { emptyMonitor } from '../src/monitor.mjs';
import { buildModel } from '../src/model.mjs';
import { renderSite } from '../src/pages.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { values: options } = parseArgs({
  options: {
    incidents: { type: 'string', default: 'incidents' },
    data: { type: 'string', default: 'data/monitor.json' },
    out: { type: 'string', default: 'dist' },
    now: { type: 'string' },
  },
});

const now = options.now ? Date.parse(options.now) : Date.now();
if (Number.isNaN(now)) throw new Error(`--now ${options.now} isn't a time`);

let monitor;
try {
  monitor = JSON.parse(readFileSync(resolve(root, options.data), 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  monitor = emptyMonitor();
}

const incidents = await loadIncidents(resolve(root, options.incidents), config);
const files = renderSite(buildModel({ config, incidents, monitor, now }));

const out = resolve(root, options.out);
rmSync(out, { recursive: true, force: true });
cpSync(join(root, 'public'), out, { recursive: true });
for (const [path, content] of files) {
  mkdirSync(dirname(join(out, path)), { recursive: true });
  writeFileSync(join(out, path), content);
}
console.log(`Built ${files.size} pages and feeds into ${options.out}/ (${incidents.length} incidents).`);
