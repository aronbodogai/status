import { feeds, renderFeed } from './feed.mjs';
import { escapeHtml } from './markdown.mjs';
import { IMPACT_LABELS, STATUS_LABELS, describeComponents, formatUptime, history, list, ongoing } from './model.mjs';
import { MINUTE, formatDate, formatDuration, formatMonth, formatUtc, formatWeekday, stamp } from './time.mjs';

class Html {
  constructor(value) {
    this.value = value;
  }
}

/** Markup that's already safe, like rendered Markdown, which `html` leaves alone. */
const raw = (value) => new Html(String(value));

/** Template tag that escapes everything interpolated, except arrays of, and results from, html`` and raw(). */
function html(strings, ...values) {
  return new Html(strings.reduce((out, string, index) => out + toHtml(values[index - 1]) + string));
}

function toHtml(value) {
  if (value === null || value === undefined || value === false) return '';
  if (Array.isArray(value)) return value.map(toHtml).join('');
  if (value instanceof Html) return value.value;
  return escapeHtml(value);
}

const MARK = raw(
  '<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8"/><path d="M6 17h5l3-7 4 13 3-6h5"/></svg>',
);
const ICONS = {
  ok: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'),
  problem: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5v7.5M12 17.5v.01"/></svg>'),
};

/** Every file the site is made of, by path inside dist/. */
export function renderSite(model) {
  const files = new Map([
    ['index.html', indexPage(model)],
    ['history/index.html', historyPage(model)],
    ['subscribe/index.html', subscribePage(model)],
    ['404.html', notFoundPage(model)],
  ]);
  for (const incident of model.incidents) files.set(`incidents/${incident.slug}/index.html`, incidentPage(model, incident));
  for (const feed of feeds(model)) files.set(feed.path.slice(1), renderFeed(model, feed));
  return files;
}

/** The HTML says UTC, and app.js rewrites it in the reader's own time zone. */
function time(at, format = 'datetime') {
  return html`<time datetime="${new Date(at).toISOString()}" data-format="${format}">${format === 'date' ? formatDate(at) : formatUtc(at)}</time>`;
}

function layout(model, { path, title, description, body }) {
  const { config } = model;
  const link = (href, label, className) =>
    html`<a${className ? raw(` class="${className}"`) : ''} href="${href}"${path === href ? raw(' aria-current="page"') : ''}>${label}</a>`;
  const page = html`<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title ? `${title} · ${config.title}` : config.title}</title>
<meta name="description" content="${description}">
${path ? html`<link rel="canonical" href="${config.url}${path}">` : ''}
<meta name="color-scheme" content="light dark">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/styles.css">
${feeds(model).map(
  (feed) => html`<link rel="alternate" type="application/rss+xml" title="${feed.title}" href="${config.url}${feed.path}">
`,
)}<script type="module" src="/app.js"></script>
</head>
<body>
<div class="page">
<header class="site-header">
<a class="brand" href="/">${MARK}<span>aroncreates</span><span class="brand-sub">status</span></a>
<nav class="site-nav" aria-label="Main">${link('/history/', 'History')}${link('/subscribe/', 'Subscribe', 'button')}</nav>
</header>
${
  model.lastCheck
    ? html`<p class="stale" id="stale" data-last-check="${model.lastCheck}" hidden>The hourly checks haven't reported since ${time(Date.parse(model.lastCheck))}, so this page may be out of date.</p>`
    : ''
}
<main>
${body}
</main>
<footer class="site-footer">
<p>Checked every hour from GitHub Actions. The page updates when a result changes, and at least once a day. Last updated ${time(model.now, 'relative')}.</p>
<p><a href="/subscribe/">RSS feeds</a> · <a href="${config.repo}">Source</a> · <a href="https://aroncreates.com">aroncreates.com</a></p>
</footer>
</div>
</body>
</html>
`;
  return `<!doctype html>\n${page.value}`;
}

function indexPage(model) {
  const { overall, config } = model;
  const current = ongoing(model);
  const body = html`<section class="banner banner-${overall.severity}">
<span class="banner-icon">${overall.severity === 'ok' ? ICONS.ok : ICONS.problem}</span>
<div>
<h1>${overall.title}</h1>
<p>${overall.detail}</p>
</div>
</section>
${current.length > 0 ? html`<section class="ongoing" aria-label="Ongoing">${current.map((entry) => ongoingCard(model, entry))}</section>` : ''}
${model.groups.map((group) => groupSection(model, group))}
<p class="more"><a href="/history/">Incident history</a></p>
<section class="upstream" aria-labelledby="upstream-title">
<h2 id="upstream-title">Upstream providers</h2>
<p>The apps depend on these services. When one of them has trouble, its own status page has the details.</p>
<ul>
${config.upstream.map(
  (provider) => html`<li><a href="${provider.url}">${provider.name}</a><span>${provider.note}</span></li>
`,
)}</ul>
</section>
<details class="about">
<summary>How uptime is calculated</summary>
<ul>
<li>Each bar is one day in UTC, colored by the worst thing that happened that day.</li>
<li>Every component is checked once an hour. Time it doesn't respond counts as down, and so does a major outage reported in an incident. A partial outage counts as 30% down; degraded performance doesn't count.</li>
<li>With hourly checks, an outage shows up here within about an hour, and its length is accurate to about an hour.</li>
<li>Gray days have no data: the component wasn't checked yet, or no check ran that day.</li>
</ul>
</details>`;
  return layout(model, {
    path: '/',
    description: `Current status and uptime of ${list(model.groups.map((group) => group.name))}.`,
    body,
  });
}

function ongoingCard(model, entry) {
  if (entry.kind === 'outage') {
    return html`<article class="card impact-major">
<h2>${entry.component.fullName} isn't responding</h2>
<p class="meta">Found by the hourly check at ${time(entry.start)} · ${entry.detail}</p>
</article>`;
  }
  const latest = entry.updates[0];
  return html`<article class="card impact-${entry.impact}">
<h2><a href="${entry.url}">${entry.title}</a></h2>
<p class="meta"><strong>${STATUS_LABELS[latest.status]}</strong> · ${time(latest.at)} · ${describeComponents(model, entry.components)}</p>
<div class="prose">${raw(latest.html)}</div>
</article>`;
}

function groupSection(model, group) {
  return html`<section class="group" aria-labelledby="group-${group.id}">
<header class="group-head">
<h2 id="group-${group.id}"><a href="${group.link}">${group.name}</a></h2>
<span class="status status-${group.severity}">${group.statusLabel}</span>
</header>
<ul class="components">
${group.components.map((component) => componentRow(model, component))}</ul>
</section>
`;
}

function componentRow(model, component) {
  const { days } = model.config;
  const short = Math.min(30, days);
  const problemDays = component.bars.filter((bar) => bar.severity !== 'ok' && bar.severity !== 'none').length;
  const summary = `${formatUptime(component.uptime)} over the last ${days} days${
    problemDays > 0 ? `, with problems on ${problemDays} ${problemDays === 1 ? 'day' : 'days'}` : ''
  }`;
  return html`<li class="component">
<div class="component-head">
<div>
<h3>${component.name}</h3>
${component.description ? html`<p>${component.description}</p>` : ''}
</div>
<span class="status status-${component.severity}">${component.statusLabel}</span>
</div>
<ol class="bars" role="img" aria-label="${summary}">${component.bars.map(
    (bar, index) => html`<li class="bar bar-${bar.severity}${index < days - short ? ' older' : ''}" data-tip="${barTip(bar)}"></li>`,
  )}</ol>
<p class="bars-legend" aria-hidden="true"><span><span class="long">${days} days ago</span><span class="short">${short} days ago</span></span><span><span class="long">${formatUptime(component.uptime)}</span><span class="short">${formatUptime(component.uptimeShort)}</span></span><span>Today</span></p>
</li>
`;
}

/** Tooltip lines: the day, what it amounted to, then what happened. */
function barTip(bar) {
  let summary = IMPACT_LABELS[bar.severity];
  if (bar.severity === 'none') summary = 'No data';
  else if (bar.severity === 'ok') summary = 'No downtime';
  else if (bar.outage > 0) summary += `, down ${formatDuration(bar.outage * MINUTE)}`;
  return [formatWeekday(bar.day), summary, ...bar.events].join('\n');
}

function historyPage(model) {
  const entries = history(model);
  const now = new Date(model.now);
  const first = new Date(model.launch);
  const stop = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1);
  const months = [];
  for (let month = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1); month >= stop; ) {
    const date = new Date(month);
    const next = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
    months.push({ start: month, entries: entries.filter((entry) => entry.start >= month && entry.start < next) });
    month = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1);
  }
  const body = html`<h1>History</h1>
<p class="lede">Incidents and outages since ${time(model.launch, 'date')}. Outages are found by the hourly check; incidents are written up by hand.</p>
<div class="filters" role="group" aria-label="Show" hidden>
<button type="button" data-filter="all" aria-pressed="true">All</button>
${model.groups.map((group) => html`<button type="button" data-filter="${group.id}" aria-pressed="false">${group.name}</button>`)}
</div>
${months.map(
  (month) => html`<section class="month">
<h2>${formatMonth(month.start)}</h2>
${month.entries.length > 0 ? html`<ol class="entries">${month.entries.map((entry) => historyEntry(model, entry))}</ol>` : ''}
<p class="empty"${month.entries.length > 0 ? raw(' hidden') : ''}>No incidents reported</p>
</section>
`,
)}`;
  return layout(model, { path: '/history/', title: 'History', description: 'Past incidents and outages.', body });
}

function historyEntry(model, entry) {
  const groups = entry.groups.join(' ');
  if (entry.kind === 'outage') {
    return html`<li class="entry impact-major" id="${entry.id}" data-groups="${groups}">
<h3>${entry.component.fullName} ${entry.end === null ? "isn't" : "wasn't"} responding</h3>
<p class="meta">Found by the hourly check · ${entry.detail}</p>
<p class="meta">${time(entry.start)} · ${entry.end === null ? 'Ongoing' : `Lasted about ${formatDuration(entry.end - entry.start)}`}</p>
</li>
`;
  }
  return html`<li class="entry impact-${entry.impact}" data-groups="${groups}">
<h3><a href="${entry.url}">${entry.title}</a></h3>
<p class="meta">${IMPACT_LABELS[entry.impact]} · ${describeComponents(model, entry.components)}</p>
<p class="meta">${time(entry.start)} · ${
    entry.end === null ? `Ongoing, ${STATUS_LABELS[entry.status].toLowerCase()}` : `Lasted ${formatDuration(entry.end - entry.start)}`
  }</p>
</li>
`;
}

function incidentPage(model, incident) {
  const body = html`<nav class="crumbs" aria-label="Breadcrumb"><a href="/history/">History</a></nav>
<h1>${incident.title}</h1>
<p class="tags"><span class="tag impact-${incident.impact}">${IMPACT_LABELS[incident.impact]}</span><span class="tag">${STATUS_LABELS[incident.status]}</span></p>
<dl class="facts">
<div><dt>Affects</dt><dd>${describeComponents(model, incident.components)}</dd></div>
<div><dt>Started</dt><dd>${time(incident.start)}</dd></div>
${
  incident.end === null
    ? html`<div><dt>Ongoing for</dt><dd>${formatDuration(model.now - incident.start)}</dd></div>`
    : html`<div><dt>Resolved</dt><dd>${time(incident.end)}</dd></div>
<div><dt>Duration</dt><dd>${formatDuration(incident.end - incident.start)}</dd></div>`
}
</dl>
<h2 class="updates-title">Updates</h2>
<ol class="updates">
${incident.updates.map(
  (update) => html`<li id="update-${stamp(update.at)}">
<p class="update-head"><strong>${STATUS_LABELS[update.status]}</strong><a href="#update-${stamp(update.at)}">${time(update.at)}</a></p>
<div class="prose">${raw(update.html)}</div>
</li>
`,
)}</ol>`;
  return layout(model, {
    path: incident.url,
    title: incident.title,
    description: `${IMPACT_LABELS[incident.impact]}: ${describeComponents(model, incident.components)}.`,
    body,
  });
}

function subscribePage(model) {
  const body = html`<h1>Subscribe</h1>
<p class="lede">Follow incidents and outages in any RSS reader. There's nothing to sign up for: add a feed, and your reader checks it for new posts.</p>
<ul class="feeds">
${feeds(model).map(
  (feed) => html`<li>
<div><h2>${feed.title}</h2><code>${model.config.url}${feed.path}</code></div>
<button type="button" class="button" data-copy="${model.config.url}${feed.path}" hidden>Copy</button>
</li>
`,
)}</ul>
<h2>Good to know</h2>
<ul class="notes">
<li>Every update is a post of its own, so you hear when something is fixed, not only when it breaks.</li>
<li>Any feed reader works, like Feedly, Inoreader, NetNewsWire or Thunderbird. Slack's RSS app can post new items to a channel.</li>
<li>Readers check feeds every hour or so, so a post can reach you a little after it appears here.</li>
<li>There are no email or text alerts.</li>
</ul>`;
  return layout(model, { path: '/subscribe/', title: 'Subscribe', description: 'RSS feeds of incidents and outages.', body });
}

function notFoundPage(model) {
  const body = html`<h1>Page not found</h1>
<p class="lede">There's nothing at this address. See the <a href="/">current status</a> or the <a href="/history/">history</a>.</p>`;
  return layout(model, { path: null, title: 'Page not found', description: 'Page not found.', body });
}
