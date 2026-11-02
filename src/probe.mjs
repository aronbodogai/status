const ATTEMPTS = 3;
const RETRY_DELAY = 20_000;
const TIMEOUT = 10_000;
/** Lets the Workers analytics tell these checks apart from people. */
export const USER_AGENT = 'aroncreates-status-check (+https://status.aroncreates.com)';

/**
 * Requests `check.url` up to three times, 20 seconds apart, so one dropped connection from the runner
 * isn't an outage. Resolves to { ok, ms, detail } for the last attempt made.
 */
export async function probe(check, { attempts = ATTEMPTS, retryDelay = RETRY_DELAY, timeout = TIMEOUT } = {}) {
  let result;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    result = await request(check, timeout);
    if (result.ok) break;
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, retryDelay));
  }
  return result;
}

async function request(check, timeout) {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  try {
    const response = await fetch(check.url, {
      headers: { 'user-agent': USER_AGENT, 'cache-control': 'no-cache', ...check.headers },
      signal: AbortSignal.timeout(timeout),
    });
    await response.body?.cancel();
    // A bot challenge is Cloudflare's edge answering for the site, so it says nothing about the site being down.
    if (response.headers.get('cf-mitigated') === 'challenge') return { ok: true, ms: elapsed(), detail: 'Cloudflare challenge' };
    const ok = check.expect ? response.status === check.expect : response.status < 500;
    return { ok, ms: elapsed(), detail: `HTTP ${response.status}` };
  } catch (error) {
    const detail = error.name === 'TimeoutError' ? `No response in ${timeout / 1000} s` : (error.cause?.code ?? error.message);
    return { ok: false, ms: elapsed(), detail };
  }
}
