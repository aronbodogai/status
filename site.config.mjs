/**
 * What the status page shows and how each component is checked.
 *
 * Component and group ids are what incident files list under `components:` and what data/monitor.json is
 * keyed by, so don't rename one that already has history.
 *
 * `check.url` is requested once an hour (see .github/workflows/check.yml). With `expect`, only that status
 * code counts as up; without it, any response below 500 does. Three failed attempts in one run mark the
 * component down.
 */
export default {
  title: 'aroncreates status',
  /** Where the page is served. Used for canonical links and the feeds. */
  url: 'https://status.aroncreates.com',
  /** Linked from the footer. */
  repo: 'https://github.com/aronbodogai/status',
  /** Incident times written without an offset ("2026-11-02 14:40") are read in this zone. */
  timezone: 'Europe/Budapest',
  /** Days in each uptime bar. Phones show the last 30. */
  days: 90,
  groups: [
    {
      id: 'aroncreates',
      name: 'aroncreates.com',
      link: 'https://aroncreates.com',
      components: [
        {
          id: 'aroncreates-site',
          name: 'Website',
          check: { url: 'https://aroncreates.com/', expect: 200 },
        },
      ],
    },
    {
      id: 'episodic',
      name: 'Episodic',
      link: 'https://episodic.aroncreates.com',
      components: [
        {
          id: 'episodic-site',
          name: 'Website',
          description: 'episodic.aroncreates.com',
          check: { url: 'https://episodic.aroncreates.com/', expect: 200 },
        },
        {
          id: 'episodic-web',
          name: 'Web app',
          description: 'app.episodic.aroncreates.com',
          check: { url: 'https://app.episodic.aroncreates.com/', expect: 200 },
        },
        {
          id: 'episodic-accounts',
          name: 'Accounts and sync',
          description: 'Sign-in and Plus cloud sync',
          check: {
            url: 'https://mtrtdavjczenjkugkplp.supabase.co/auth/v1/health',
            expect: 200,
            // Public: the same publishable key the app ships with.
            headers: { apikey: 'sb_publishable_gbNBFdX27JpX7onCG0ohiA_MN03Mg8k' },
          },
        },
        {
          id: 'episodic-push',
          name: 'Web reminders',
          description: 'Reminder delivery for the web app',
          // Answers 404 on / for now. Switch to /health with expect: 200 once it exists.
          check: { url: 'https://push.episodic.aroncreates.com/' },
        },
        {
          id: 'episodic-calendar',
          name: 'Calendar feed',
          description: 'Calendar subscriptions for Plus',
          // Answers 404 on / for now. Switch to /health with expect: 200 once it exists.
          check: { url: 'https://calendar.episodic.aroncreates.com/' },
        },
      ],
    },
    {
      id: 'inventory',
      name: 'Inventory',
      link: 'https://inventory.aroncreates.com',
      components: [
        {
          id: 'inventory-app',
          name: 'App',
          description: 'inventory.aroncreates.com',
          check: { url: 'https://inventory.aroncreates.com/', expect: 200 },
        },
        {
          id: 'inventory-accounts',
          name: 'Accounts and sync',
          description: 'Sign-in, sync and household sharing',
          check: {
            url: 'https://tbaptwuodqgwsdheomdj.supabase.co/auth/v1/health',
            expect: 200,
            // Public: the same publishable key the app ships with.
            headers: { apikey: 'sb_publishable_1eaV55nL1NA4zhWf84R0Wg_Gl1kn7s0' },
          },
        },
        {
          id: 'inventory-mcp',
          name: 'Claude connector',
          description: 'inventory.aroncreates.com/mcp',
          // Answers 405 to GET, since MCP clients POST. Switch to /api/health with expect: 200 once it exists.
          check: { url: 'https://inventory.aroncreates.com/mcp' },
        },
      ],
    },
  ],
  /** Services the apps rely on, linked at the bottom of the page. They aren't checked from here. */
  upstream: [
    { name: 'Cloudflare', url: 'https://www.cloudflarestatus.com', note: 'Hosts every site and app here' },
    { name: 'Supabase', url: 'https://status.supabase.com', note: 'Accounts and sync' },
    { name: 'TMDB', url: 'https://status.themoviedb.org', note: 'Show and movie data in Episodic' },
    { name: 'TVmaze', url: 'https://status.tvmaze.com', note: 'Episode air times in Episodic' },
    { name: 'Resend', url: 'https://resend-status.com', note: 'Sign-in emails' },
    { name: 'GitHub', url: 'https://www.githubstatus.com', note: 'Runs the hourly checks for this page' },
  ],
};
