import { escapeHtml } from './markdown.mjs';
import { STATUS_LABELS, describeComponents, list } from './model.mjs';
import { formatDuration, formatUtc, stamp } from './time.mjs';

const ITEMS_PER_FEED = 50;

/** One feed with everything, and one per group. */
export function feeds(model) {
  return [
    {
      group: null,
      title: 'All services',
      path: '/feed.xml',
      description: `Incidents and outages for ${list(model.groups.map((group) => group.name))}.`,
    },
    ...model.groups.map((group) => ({
      group: group.id,
      title: group.name,
      path: `/feed/${group.id}.xml`,
      description: `Incidents and outages for ${group.name}.`,
    })),
  ];
}

/**
 * RSS 2.0. Every incident update, and every outage and recovery the check finds, is an item of its own with
 * its own guid. Readers only notify about guids they haven't seen, so a Resolved added to an existing item
 * would never reach anyone.
 */
export function renderFeed(model, feed) {
  const { config } = model;
  const items = feedItems(model)
    .filter((item) => feed.group === null || item.groups.includes(feed.group))
    .slice(0, ITEMS_PER_FEED);
  const title = feed.group === null ? config.title : `${feed.title} · ${config.title}`;
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${escapeHtml(title)}</title>
<link>${escapeHtml(config.url)}/</link>
<description>${escapeHtml(feed.description)}</description>
<language>en</language>
<ttl>60</ttl>
<lastBuildDate>${new Date(items[0]?.date ?? model.launch).toUTCString()}</lastBuildDate>
<atom:link href="${escapeHtml(config.url + feed.path)}" rel="self" type="application/rss+xml"/>
${items
  .map(
    (item) => `<item>
<title>${escapeHtml(item.title)}</title>
<link>${escapeHtml(item.link)}</link>
<guid isPermaLink="false">${escapeHtml(item.guid)}</guid>
<pubDate>${new Date(item.date).toUTCString()}</pubDate>
<description>${escapeHtml(item.html)}</description>
</item>
`,
  )
  .join('')}</channel>
</rss>
`;
}

/** Newest first, across every group. */
export function feedItems(model) {
  const { config } = model;
  const items = [];
  for (const incident of model.incidents) {
    const affects = escapeHtml(describeComponents(model, incident.components));
    for (const update of incident.updates) {
      const link = `${config.url}${incident.url}#update-${stamp(update.at)}`;
      const status = STATUS_LABELS[update.status];
      items.push({
        title: `${incident.title}: ${status}`,
        link,
        guid: link,
        date: update.at,
        html: `<p><strong>${status}</strong> · ${formatUtc(update.at)} · ${affects}</p>\n${update.html}`,
        groups: incident.groups,
      });
    }
  }
  for (const outage of model.outages) {
    const name = outage.component.fullName;
    const link = outage.coveredBy ? `${config.url}${outage.coveredBy.url}` : `${config.url}/history/#${outage.id}`;
    const guid = `${config.url}/history/#${outage.id}`;
    items.push({
      title: `${name} isn't responding`,
      link,
      guid: `${guid}-down`,
      date: outage.start,
      html: `<p>The hourly check couldn't reach it at ${formatUtc(outage.start)} (${escapeHtml(outage.detail)}).</p>`,
      groups: outage.groups,
    });
    if (outage.end !== null) {
      items.push({
        title: `${name} is back up`,
        link,
        guid: `${guid}-up`,
        date: outage.end,
        html: `<p>It answered the hourly check again at ${formatUtc(outage.end)}, after about ${formatDuration(outage.end - outage.start)}.</p>`,
        groups: outage.groups,
      });
    }
  }
  return items.sort((a, b) => b.date - a.date);
}
