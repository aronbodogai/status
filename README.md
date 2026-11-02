# Status

The status page for aroncreates.com, Episodic and Inventory, at [status.aroncreates.com](https://status.aroncreates.com). It shows the current status, 90 days of uptime per component, the history of incidents and outages, and RSS feeds to subscribe to.

It's a static site: nothing runs when someone opens it.

## How it fits together

| Piece | Where | What it does |
|---|---|---|
| Components | `site.config.mjs` | The products and their parts, and the URL each part is checked at |
| Hourly check | `.github/workflows/check.yml`, `scripts/check.mjs` | Requests every check URL once an hour from GitHub Actions and commits what changed to `data/monitor.json` |
| Check results | `data/monitor.json` | Up or down per component, every outage found, and days the check didn't run. Only the hourly job writes it |
| Incidents | `incidents/*.md` | Written by hand, one Markdown file each |
| Build | `scripts/build.mjs`, `src/` | Turns the three above into HTML and RSS in `dist/`. No dependencies |
| Hosting | `wrangler.jsonc` | Cloudflare serves `dist/` as static assets on status.aroncreates.com |

Every push to `main` makes Cloudflare Workers Builds rebuild and deploy the page. That's either an incident you push, or the hourly job's commit when something goes down or comes back. The job also commits once a day, so the page knows the checks are still running, and so GitHub doesn't switch the schedule off: it does that after 60 days without activity in a public repository. If the checks stop saving for 36 hours, the page says it may be out of date.

## Writing an incident

Copy `incidents/_template.md` to `incidents/2026-11-02-short-name.md` and replace the example. The file name becomes the address (`/incidents/2026-11-02-short-name/`). On a phone, github.com works: Add file → Create new file.

```md
---
title: Inventory sync is failing
impact: major
components: inventory-accounts
---

## Resolved · 2026-11-02 14:40

The fix is deployed, and sync works again.

## Identified · 2026-11-02 14:10

Today's migration broke a sync policy. Rolling it back.

## Investigating · 2026-11-02 13:55

Sync fails with an error for every household.
```

- `impact` is `degraded` (slow or flaky), `partial` (some things don't work) or `major` (it's down).
- `components` lists component ids from `site.config.mjs`, separated by commas. A group id, like `episodic`, means every component in it.
- Each update is a heading: Investigating, Identified, Monitoring, Update or Resolved, then the time. Newest on top reads best, but the order doesn't matter.
- Times without an offset are Europe/Budapest time. Add `Z` or an offset like `+01:00` to say otherwise.
- The incident is over once its newest update is Resolved. Adding another update after that reopens it.
- Writing one up afterwards? Add `start: 2026-11-02 13:30` to the front matter, and a single Resolved update.
- Updates take Markdown: paragraphs, `- ` lists, `code`, `**bold**`, `*italic*` and links.

Every update is its own item in the feeds, identified by its time. Fixing a typo is fine, but readers won't see the change. Changing an update's time makes readers see it again as a new post.

If a file can't be read, the Build check on the commit turns red in GitHub, and the log says what's wrong. Cloudflare's build fails the same way, and the live page stays as it was.

## Checks

- With `expect`, only that status code counts as up. Without it, any response below 500 does.
- A component is down only when three attempts, 20 seconds apart, all fail. An attempt fails after 10 seconds without a response.
- A Cloudflare bot challenge counts as up, since the edge answered.
- Checks send the user agent `aroncreates-status-check (+https://status.aroncreates.com)`, so you can filter them out of analytics.
- `npm run check` runs a check from your machine and updates `data/monitor.json`. Discard that change instead of committing it, unless it's the first run.

### Health endpoints

Three components are checked at an address that answers 404 or 405 today. That proves the Worker is reachable, but not that it works:

- `episodic-push` at `https://push.episodic.aroncreates.com/`
- `episodic-calendar` at `https://calendar.episodic.aroncreates.com/`
- `inventory-mcp` at `https://inventory.aroncreates.com/mcp`

Give each of those Workers a `GET /health` (for Inventory, `/api/health`, which already runs the Worker first) that:

- answers `200` when the Worker can reach what it depends on (D1 and Supabase for push, Supabase for the calendar and Inventory), and `503` when it can't
- sends `cache-control: no-store`, needs no auth, writes nothing, and answers well within 10 seconds

Then change `check.url` to it and add `expect: 200` in `site.config.mjs`. The static sites (aroncreates.com, the Episodic website and web app, and the Inventory app) don't need one: getting the page with a 200 is the check.

## How uptime is calculated

- Each bar is one UTC day, colored by the worst thing that happened that day.
- Time the check found a component not responding counts as down, and so does a `major` incident. A `partial` incident counts as 30% down. `degraded` doesn't count against uptime, but still colors the bar.
- When an incident covers the same time as an outage the check found, the time counts once, and history shows only the incident.
- Days before a component's first check, and days the check didn't run at all, have no data. They're gray and left out of the percentage.
- With hourly checks, an outage appears within about an hour, and its length is accurate to about an hour.

### False alarms

If the check marks something down that wasn't, wait until it's back up, then delete that entry from `outages` in `data/monitor.json` and push. The bars and history forget it on the next build. Feed readers that already picked it up keep it.

## Feeds

- Everything: `https://status.aroncreates.com/feed.xml`
- One product: `https://status.aroncreates.com/feed/aroncreates.xml`, `…/feed/episodic.xml`, `…/feed/inventory.xml`

The page links them for feed autodiscovery, so pasting `status.aroncreates.com` into a reader finds them.

## Develop

```sh
npm install
npm test        # unit tests
npm run dev     # build, then serve dist/ at http://localhost:8787
```

To see the page with made-up incidents and outages:

```sh
node scripts/build.mjs --incidents test/fixtures/incidents --data test/fixtures/monitor.json --now 2026-11-02T21:00:00Z
npx wrangler dev
```

`npm run build` puts the real site back in `dist/`.

## Set up

1. Push this repository to GitHub as a public repository, `aronbodogai/status`. Actions minutes are free for public repositories.
2. In the Cloudflare dashboard, go to Workers & Pages → Create → Import a repository, and pick `aronbodogai/status`. Use `npm run build` as the build command and `npx wrangler deploy` as the deploy command. The `status.aroncreates.com` custom domain comes from `wrangler.jsonc`.
3. In the repository's Actions tab, run Check services once with Run workflow, to see that it can check and commit.
