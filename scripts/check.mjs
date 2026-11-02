// Checks every component in site.config.mjs once and saves what changed to data/monitor.json.
// .github/workflows/check.yml runs it hourly and commits the file; `npm run check` runs it by hand.
//
// With COMMIT_MESSAGE_FILE set, it also writes a commit message there describing the changes.

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import config from '../site.config.mjs';
import { applyResults, emptyMonitor } from '../src/monitor.mjs';
import { probe } from '../src/probe.mjs';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'monitor.json');

let monitor;
try {
  monitor = JSON.parse(readFileSync(file, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  monitor = emptyMonitor();
}

const components = config.groups.flatMap((group) => group.components);
const results = await Promise.all(
  components.map(async (component) => ({ id: component.id, ...(await probe(component.check)) })),
);

const rows = results.map((r) => `| ${r.id} | ${r.ok ? 'up' : '**down**'} | ${r.detail} | ${r.ms} ms |`);
console.log(results.map((r) => `${r.ok ? 'up  ' : 'DOWN'}  ${r.id.padEnd(20)} ${r.detail.padEnd(24)} ${r.ms} ms`).join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `| Component | Result | Detail | Time |\n|---|---|---|---|\n${rows.join('\n')}\n`);
}

const changes = applyResults(monitor, results, Date.now());
if (changes.length === 0) {
  console.log('\nNothing changed.');
} else {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(monitor, null, 2)}\n`);
  console.log(`\nSaved: ${changes.join('; ')}`);
  if (process.env.COMMIT_MESSAGE_FILE) {
    const subject = `monitor: ${changes.join(', ')}`;
    const message =
      subject.length <= 72 ? subject : `monitor: ${changes.length} changes\n\n${changes.map((c) => `- ${c}`).join('\n')}`;
    writeFileSync(process.env.COMMIT_MESSAGE_FILE, `${message}\n`);
  }
}
