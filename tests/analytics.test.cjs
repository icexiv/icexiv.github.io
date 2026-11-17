const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

const source = fs.readFileSync('static/_analytics/tracker.js', 'utf8');

async function run({ pathname = '/', protocol = 'https:', hostname = 'icexiv.top',
  doNotTrack = null, globalPrivacyControl = undefined, pingBody = '0', pingStatus = 200,
  hitStatus = 200, hidden = false } = {}) {
  const calls = [];
  const listeners = {};
  let clock = 1000;
  const context = {
    location: { protocol, hostname, pathname, origin: `${protocol}//${hostname}` },
    navigator: { doNotTrack, globalPrivacyControl },
    document: {
      hidden,
      referrer: 'https://example.com/secret?query=1',
      addEventListener(type, callback) { listeners[type] = callback; },
    },
    window: {},
    performance: { now: () => clock },
    crypto: { randomUUID: () => 'id-1' },
    Intl,
    AbortSignal,
    URL,
    encodeURIComponent,
    console,
    addEventListener(type, callback) { listeners[type] = callback; },
    fetch: async (url, options = {}) => {
      calls.push({ url, body: options.body ? JSON.parse(options.body) : null, method: options.method || 'GET' });
      if (url.includes('/ping')) return { ok: pingStatus === 200, status: pingStatus, text: async () => pingBody };
      return { ok: hitStatus === 200, status: hitStatus };
    },
  };
  vm.runInNewContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  return { calls, listeners, context, advance(ms) { clock += ms; } };
}

test('only runs on the domestic HTTPS origin', async () => {
  for (const options of [
    { protocol: 'http:' },
    { hostname: 'icexiv.github.io' },
    { hostname: 'market.icexiv.top' },
    { doNotTrack: '1' },
    { globalPrivacyControl: true },
  ]) {
    const { calls } = await run(options);
    assert.deepEqual(calls, []);
  }
});

test('counts allowlisted paths and collapses everything else to /other', async () => {
  for (const [pathname, expected] of [
    ['/', '/'], ['/projects/market.html', '/projects/market.html'],
    ['/projects/db.html', '/projects/db.html'], ['/projects/eorzea.html', '/projects/eorzea.html'],
    ['/projects/eorzea.html/', '/projects/eorzea.html'],
    ['/admin', '/other'], ['/projects/market.html/../../secret', '/other'], ['/index.html', '/other'],
  ]) {
    const { calls } = await run({ pathname });
    const hit = calls.find(call => call.url.endsWith('/hit'));
    assert.equal(hit.body.u, `https://icexiv.top${expected}`, pathname);
  }
});

test('never sends query strings, fragments or external referrer paths', async () => {
  const { calls } = await run({ pathname: '/projects/eorzea.html' });
  const hit = calls.find(call => call.url.endsWith('/hit')).body;
  assert.equal(hit.r, 'https://example.com/');
  assert.ok(!JSON.stringify(hit).includes('secret'));
  assert.ok(!JSON.stringify(hit).includes('query'));
  assert.equal(calls[0].url, '/_analytics/api/event/ping');
  assert.match(calls[1].url, /^\/_analytics\/api\/event\/ping\?u=icexiv\.top%2F/);
});

test('sends a visitor flag and page flag, then a duration when hidden', async () => {
  const { calls, listeners, context, advance } = await run();
  const load = calls.find(call => call.url.endsWith('/hit')).body;
  assert.equal(load.e, 'load');
  assert.equal(load.p, true);
  assert.equal(load.q, true);
  assert.equal(load.b, 'id-1');
  assert.ok(load.t);
  advance(1500);
  context.document.hidden = true;
  listeners.visibilitychange.call(null, {});
  const unload = calls.filter(call => call.url.endsWith('/hit')).at(-1).body;
  assert.equal(unload.e, 'unload');
  assert.equal(unload.m, 1500);
});

test('collector failure disables analytics without throwing', async () => {
  const { calls } = await run({ pingStatus: 500 });
  assert.equal(calls.length, 1);
  const rejected = await run({ hitStatus: 500 });
  assert.ok(rejected.calls.length >= 2);
});

test('does not double-load when injected twice', async () => {
  const first = await run();
  const callsBefore = first.calls.length;
  vm.runInNewContext(source, {
    location: { protocol: 'https:', hostname: 'icexiv.top', pathname: '/', origin: 'https://icexiv.top' },
    navigator: {}, document: { hidden: false, referrer: '', addEventListener() {} },
    window: first.context.window, performance: { now: () => 1 }, crypto: { randomUUID: () => 'id-2' },
    Intl, AbortSignal, URL, encodeURIComponent, console, addEventListener() {},
    fetch: async () => { throw new Error('should not fetch'); },
  });
  assert.equal(first.calls.length, callsBefore);
});
