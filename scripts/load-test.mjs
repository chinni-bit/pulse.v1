#!/usr/bin/env node
// Minimal load-test tool - no new dependency (uses Node's built-in fetch),
// no external binary to install. Fires N concurrent requests at a list of
// pages/API routes and reports status codes and response times.
//
// Deliberately NOT run against the production deployment as part of the
// item-6 hardening pass - see CLAUDE.md and docs/DISASTER_RECOVERY.md's
// sibling doc, the hardening pass notes in docs/CHANGELOG.md, for why:
// running this against prod has real cost/risk implications (Supabase
// usage-based billing, Vercel function invocations) that need the
// owner's say-so first, not just a developer's judgment call.
//
// Usage:
//   node scripts/load-test.mjs [baseUrl] [concurrency] [requestsPerRoute]
//   node scripts/load-test.mjs http://localhost:3000 10 20

const baseUrl = process.argv[2] || 'http://localhost:3000';
const concurrency = Number(process.argv[3] || 10);
const requestsPerRoute = Number(process.argv[4] || 20);

// Read-only pages - safe to hammer, no side effects. Deliberately excludes
// anything that writes data (adjustments, transfers, etc.) - a load test
// should never be the thing that creates 200 fake adjustments.
const ROUTES = [
  '/dashboard',
  '/inventory',
  '/orders',
  '/products',
  '/analytics-sales',
  '/analytics-channels',
  '/analytics-products',
  '/analytics-inventory',
  '/analytics-loss-gain',
  '/api/health',
];

async function timeRequest(url) {
  const start = Date.now();
  try {
    const res = await fetch(url, { redirect: 'manual' });
    return { status: res.status, ms: Date.now() - start, ok: res.status < 400 || res.status === 302 };
  } catch (err) {
    return { status: 0, ms: Date.now() - start, ok: false, error: String(err) };
  }
}

async function runBatch(url, count, concurrency) {
  const results = [];
  let inFlight = 0;
  let launched = 0;

  return new Promise((resolve) => {
    function launchNext() {
      if (launched >= count) {
        if (inFlight === 0) resolve(results);
        return;
      }
      launched += 1;
      inFlight += 1;
      timeRequest(url).then((r) => {
        results.push(r);
        inFlight -= 1;
        launchNext();
      });
    }
    for (let i = 0; i < Math.min(concurrency, count); i++) launchNext();
  });
}

function summarize(route, results) {
  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const okCount = results.filter((r) => r.ok).length;
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const max = times[times.length - 1];
  return { route, requests: results.length, ok: okCount, failed: results.length - okCount, p50, p95, max };
}

async function main() {
  console.log(`Load test: ${baseUrl}, concurrency ${concurrency}, ${requestsPerRoute} requests/route\n`);
  const summaries = [];
  for (const route of ROUTES) {
    const url = `${baseUrl}${route}`;
    const results = await runBatch(url, requestsPerRoute, concurrency);
    const summary = summarize(route, results);
    summaries.push(summary);
    console.log(
      `${route.padEnd(24)} ok=${summary.ok}/${summary.requests}  p50=${summary.p50}ms  p95=${summary.p95}ms  max=${summary.max}ms`
    );
  }
  const totalFailed = summaries.reduce((s, x) => s + x.failed, 0);
  console.log(`\n${totalFailed === 0 ? 'All requests succeeded.' : `${totalFailed} requests failed - see above.`}`);
}

main().catch((err) => {
  console.error('Load test failed:', err);
  process.exit(1);
});
