const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

class Element {
  constructor() { this.attributes = {}; this.textContent = ''; this.hidden = false; this.listeners = {}; this.dataset = {}; }
  setAttribute(k, v) { this.attributes[k] = v; }
  removeAttribute(k) { delete this.attributes[k]; if (k === 'href') delete this.href; }
  addEventListener(k, callback) { this.listeners[k] = callback; }
}
function asset(source, filename = 'app.zip') {
  return { filename, size: 1024, sha256: 'a'.repeat(64),
    url: source === 'github' ? `https://github.com/icexiv/eorzea/releases/download/dev-build/${filename}`
      : 'https://azurice-shadow.tos-cn-beijing.volces.com/eorzea/objects/sha256/aa/' + 'a'.repeat(62) };
}
function manifest(source = 'github') {
  return { schema: 1, source, channels: { stable: null, dev: { version: 'dev-test', assets: {
    'windows-x86_64': asset(source), 'macos-aarch64': asset(source, 'app.dmg'),
  } } } };
}
async function run(data = manifest(), { source = 'github', failed = false, navigator = {} } = {}) {
  const status = new Element(), retry = new Element();
  const channels = {};
  for (const name of ['stable', 'dev']) {
    const main = new Element(), version = new Element(), filename = new Element(), menuLabel = new Element();
    const options = ['windows-x86_64', 'linux-x86_64', 'macos-aarch64'].map(key => {
      const link = new Element(); link.dataset.platform = key; link.note = new Element();
      link.querySelector = () => link.note;
      return link;
    });
    const split = new Element(); split.dataset.downloadChannel = name;
    split.querySelector = k => ({ '.download-primary': main, '[data-download-version]': version,
      '.download-filename': filename, '.download-menu-label': menuLabel })[k];
    split.querySelectorAll = () => options;
    channels[name] = { main, version, filename, options, split };
  }
  const group = { dataset: { downloadManifest: '/manifest.json', downloadSource: source },
    querySelector: k => k === '.download-status' ? status : retry,
    querySelectorAll: () => Object.values(channels).map(c => c.split) };
  vm.runInNewContext(fs.readFileSync('static/downloads.js', 'utf8'), {
    document: { querySelectorAll: () => [group] },
    navigator: { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 0, ...navigator },
    URL, AbortController, setTimeout, clearTimeout,
    fetch: async () => { if (failed) throw new Error('offline'); return { ok: true, json: async () => data }; },
  });
  await new Promise(resolve => setImmediate(resolve));
  return { channels, status, retry };
}
test('detects legacy Windows x64, shows exact filename below version, and hides current platform from alternatives', async () => {
  const { channels: c } = await run();
  assert.equal(c.stable.main.attributes['aria-disabled'], 'true');
  assert.equal(c.stable.version.textContent, '未发布');
  assert.equal(c.dev.main.attributes['aria-disabled'], 'false');
  assert.match(c.dev.main.href, /^https:\/\/github.com/);
  assert.equal(c.dev.version.textContent, 'dev-test');
  assert.equal(c.dev.filename.textContent, 'app.zip');
  assert.equal(c.dev.options[0].hidden, true);
  assert.equal(c.dev.options[2].hidden, false);
  assert.match(c.dev.options[2].href, /app.dmg$/);
});
test('stable and Dev versions and filenames are independent', async () => {
  const data = manifest();
  data.channels.stable = { version: '0.1.0', assets: { 'windows-x86_64': asset('github', 'stable.zip') } };
  const { channels: c } = await run(data);
  assert.equal(c.stable.version.textContent, '0.1.0');
  assert.equal(c.stable.filename.textContent, 'stable.zip');
  assert.equal(c.dev.filename.textContent, 'app.zip');
});
test('Dev build title uses a short commit while retaining full download metadata', async () => {
  const data = manifest();
  data.channels.dev.version = 'dev-466cf4a-9-1';
  data.channels.dev.assets['windows-x86_64'] = asset('github', 'eorzea-app-dev-466cf4a-9-1-windows-x86_64.zip');
  const { channels: c } = await run(data);
  assert.equal(c.dev.version.textContent, '466cf4a');
  assert.equal(c.dev.filename.textContent, 'eorzea-app-dev-466cf4a-9-1-windows-x86_64.zip');
  assert.match(c.dev.main.title, /eorzea-app-dev-466cf4a-9-1-windows-x86_64.zip/);
});
test('client hints detect Apple Silicon despite Intel UA', async () => {
  const { channels: c } = await run(manifest(), { navigator: {
    platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
    userAgentData: { getHighEntropyValues: async () => ({ platform: 'macOS', architecture: 'arm', bitness: '64' }) },
  } });
  assert.equal(c.dev.filename.textContent, 'app.dmg');
  assert.equal(c.dev.options[2].hidden, true);
});
test('Safari Mac and iPad never guess an Apple Silicon or Intel package', async () => {
  for (const maxTouchPoints of [0, 5]) {
    const { channels: c, status } = await run(manifest(), { navigator: {
      platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', maxTouchPoints,
    } });
    assert.equal(c.dev.main.href, undefined);
    assert.match(status.textContent, /无法确认/);
    assert.match(c.dev.options[2].href, /app.dmg$/);
  }
});
test('detected Intel Mac does not use the Apple Silicon build', async () => {
  const { channels: c } = await run(manifest(), { navigator: {
    platform: 'MacIntel', userAgentData: {
      getHighEntropyValues: async () => ({ platform: 'macOS', architecture: 'x86', bitness: '64' }),
    },
  } });
  assert.equal(c.dev.main.href, undefined);
  assert.match(c.dev.filename.textContent, /macOS · Intel 暂无构建/);
  assert.ok(c.dev.options[2].href);
});
test('ARM Windows and Linux do not silently download an x64 package', async () => {
  const profiles = [
    { userAgentData: { getHighEntropyValues: async () => ({ platform: 'Windows', architecture: 'arm', bitness: '64' }) } },
    { platform: 'Linux aarch64', userAgent: 'Mozilla/5.0 (X11; Linux aarch64)' },
  ];
  for (const navigator of profiles) {
    const { channels: c } = await run(manifest(), { navigator });
    assert.equal(c.dev.main.href, undefined);
    assert.match(c.dev.filename.textContent, /ARM64 暂无构建/);
    assert.ok(c.dev.options[0].href);
  }
});
test('domestic source only accepts the TOS manifest', async () => {
  const result = await run(manifest('tos'), { source: 'tos' });
  assert.match(result.channels.dev.main.href, /tos-cn-beijing/);
  const invalid = await run(manifest(), { source: 'tos' });
  assert.equal(invalid.channels.dev.main.href, undefined);
  assert.equal(invalid.retry.hidden, false);
});
test('network errors are not presented as unpublished channels', async () => {
  const { channels, status, retry } = await run(null, { failed: true });
  assert.equal(channels.stable.version.textContent, '信息不可用');
  assert.equal(channels.dev.version.textContent, '信息不可用');
  assert.match(status.textContent, /不代表尚未发布/);
  assert.equal(retry.hidden, false);
});
test('denied client hints use explicit UA architecture', async () => {
  const { channels: c } = await run(manifest(), { navigator: {
    userAgentData: { getHighEntropyValues: async () => { throw new Error('denied'); } },
  } });
  assert.equal(c.dev.filename.textContent, 'app.zip');
});
