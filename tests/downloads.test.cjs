const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

class Element {
  constructor() { this.attributes = {}; this.textContent = ''; this.hidden = false; this.listeners = {}; this.value = 'windows-x86_64'; }
  setAttribute(k, v) { this.attributes[k] = v; }
  removeAttribute(k) { delete this.attributes[k]; if (k === 'href') delete this.href; }
  addEventListener(k, callback) { this.listeners[k] = callback; }
}

function manifest(source = 'github') {
  return { schema: 1, source, channels: { stable: null, dev: { version: 'dev-test', assets: {
    'windows-x86_64': { filename: 'app.zip', size: 1024, sha256: 'a'.repeat(64),
      url: source === 'github' ? 'https://github.com/icexiv/eorzea/releases/download/dev-build/app.zip'
        : 'https://azurice-shadow.tos-cn-beijing.volces.com/eorzea/objects/sha256/aa/' + 'a'.repeat(62) }
  } } } };
}

async function run(data, source = 'github', failed = false) {
  const elements = Object.fromEntries(['.download-platform', '.download-status', '.download-retry', '[data-download-version]', '.download-option-note'].map(k => [k, new Element()]));
  for (const name of ['stable', 'dev']) {
    const link = new Element();
    link.querySelector = selector => elements[selector === '[data-download-version]' ? '[data-download-version]' : '.download-option-note'];
    elements[`[data-channel="${name}"]`] = link;
  }
  const group = { dataset: { downloadManifest: '/manifest.json', downloadSource: source }, querySelector: k => elements[k] };
  vm.runInNewContext(fs.readFileSync('static/downloads.js', 'utf8'), {
    document: { querySelectorAll: () => [group] }, navigator: { platform: 'Win32', userAgent: 'test' },
    URL, AbortController, setTimeout, clearTimeout,
    fetch: async () => { if (failed) throw new Error('offline'); return { ok: true, json: async () => data }; }
  });
  await new Promise(resolve => setImmediate(resolve));
  return elements;
}

test('enables a real Dev link while stable stays unavailable', async () => {
  const e = await run(manifest());
  assert.equal(e['[data-channel="stable"]'].attributes['aria-disabled'], 'true');
  assert.equal(e['[data-channel="dev"]'].attributes['aria-disabled'], 'false');
  assert.match(e['[data-channel="dev"]'].href, /^https:\/\/github.com/);
  assert.equal(e['.download-option-note'].textContent, 'dev-test');
});
test('domestic source only accepts the TOS manifest', async () => {
  const e = await run(manifest('tos'), 'tos');
  assert.match(e['[data-channel="dev"]'].href, /tos-cn-beijing/);
  const invalid = await run(manifest('github'), 'tos');
  assert.equal(invalid['[data-channel="dev"]'].href, undefined);
  assert.equal(invalid['.download-retry'].hidden, false);
});
test('network errors are not presented as unpublished channels', async () => {
  const e = await run(null, 'github', true);
  assert.equal(e['[data-download-version]'].textContent, '信息不可用');
  assert.match(e['.download-status'].textContent, /不代表尚未发布/);
});
test('missing platform disables the link, without falling back to another platform', async () => {
  const e = await run(manifest());
  e['.download-platform'].value = 'macos-aarch64';
  e['.download-platform'].listeners.change();
  assert.equal(e['[data-channel="dev"]'].href, undefined);
  assert.equal(e['.download-option-note'].textContent, '暂无此平台');
});
