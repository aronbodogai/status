import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { renderMarkdown } from './markdown.mjs';
import { parseTime } from './time.mjs';

export const IMPACTS = ['degraded', 'partial', 'major'];
export const STATUSES = ['investigating', 'identified', 'monitoring', 'update', 'resolved'];

/** Every incident in `dir`, newest first. Files whose names start with _ (like the template) are skipped. */
export async function loadIncidents(dir, config) {
  let names;
  try {
    names = await readdir(dir);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const incidents = [];
  for (const name of names.filter((n) => n.endsWith('.md') && !n.startsWith('_'))) {
    const slug = name.slice(0, -'.md'.length);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      throw new Error(`incidents/${name}: name the file with lowercase letters, digits and dashes`);
    }
    incidents.push(parseIncident(slug, await readFile(join(dir, name), 'utf8'), config));
  }
  return incidents.sort((a, b) => b.start - a.start);
}

/**
 * An incident file is front matter (title, impact, components and optionally start) followed by one
 * "## Status · time" section per update. The newest update decides the status; the incident is over once
 * that's Resolved. It starts at its oldest update, or at `start:` when it's written up afterwards.
 */
export function parseIncident(slug, source, config) {
  const fail = (message) => {
    throw new Error(`incidents/${slug}.md: ${message}`);
  };
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(source.replace(/\r\n?/g, '\n'));
  if (!match) fail('start the file with front matter between two --- lines');

  const meta = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const field = /^(\w+):\s*(.*)$/.exec(line);
    if (!field) fail(`can't read the front matter line "${line}"`);
    meta[field[1].toLowerCase()] = field[2].trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  if (!meta.title) fail('add a title');
  const impact = meta.impact?.toLowerCase();
  if (!IMPACTS.includes(impact)) fail(`impact must be one of ${IMPACTS.join(', ')}`);
  const components = componentIds(meta.components ?? '', config, fail);

  const sections = match[2].replace(/<!--[\s\S]*?-->/g, '').split(/^##[ \t]+/m);
  if (sections[0].trim()) fail('put every update under a "## Status · time" heading');
  const updates = sections.slice(1).map((section) => {
    const newline = section.indexOf('\n');
    const heading = (newline === -1 ? section : section.slice(0, newline)).trim();
    const parts = /^(\w+)\s*[·•|—–:,-]?\s*(.*)$/.exec(heading);
    const status = parts?.[1].toLowerCase();
    if (!STATUSES.includes(status)) fail(`"## ${heading}" should start with one of ${STATUSES.join(', ')}`);
    const at = parseTime(parts[2], config.timezone);
    if (!at) fail(`"## ${heading}": write the time as 2026-11-02 14:40, optionally followed by Z or an offset like +01:00`);
    return { status, at: at.getTime(), html: renderMarkdown(newline === -1 ? '' : section.slice(newline + 1)) };
  });
  if (updates.length === 0) fail('add at least one update');
  updates.sort((a, b) => b.at - a.at);

  let start = updates.at(-1).at;
  if (meta.start) {
    const at = parseTime(meta.start, config.timezone);
    if (!at) fail('write start: as 2026-11-02 14:40, optionally followed by Z or an offset like +01:00');
    start = Math.min(start, at.getTime());
  }
  const status = updates[0].status;
  return {
    slug,
    url: `/incidents/${slug}/`,
    title: meta.title,
    impact,
    components,
    status,
    start,
    end: status === 'resolved' ? updates[0].at : null,
    updates,
  };
}

/** `components:` lists component ids or group ids (a group means all of its components), comma-separated. */
function componentIds(value, config, fail) {
  const ids = value
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0) fail('list what it affects, like components: inventory-app');
  const result = new Set();
  for (const id of ids) {
    const group = config.groups.find((g) => g.id === id);
    if (group) group.components.forEach((component) => result.add(component.id));
    else if (config.groups.some((g) => g.components.some((component) => component.id === id))) result.add(id);
    else fail(`there's no component or group "${id}" in site.config.mjs`);
  }
  return [...result];
}
