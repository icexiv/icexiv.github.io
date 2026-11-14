(() => {
  const groups = [...document.querySelectorAll('[data-download-manifest]')];
  const cache = new Map();
  // macOS browser UA does not reliably distinguish Intel from Apple Silicon.
  const platform = /Win/i.test(navigator.platform) ? 'windows-x86_64'
    : /Linux/i.test(navigator.platform) && !/Android|aarch64|arm64/i.test(navigator.userAgent) ? 'linux-x86_64' : '';

  function validate(data, source) {
    if (data.schema !== 1 || data.source !== source || !data.channels) throw new Error('清单格式不正确');
    for (const name of ['stable', 'dev']) {
      const channel = data.channels[name];
      if (channel === null) continue;
      if (!channel || typeof channel.version !== 'string' || !channel.assets || typeof channel.assets !== 'object') throw new Error('渠道信息不正确');
      for (const asset of Object.values(channel.assets)) {
        const url = new URL(asset.url);
        if (url.protocol !== 'https:' || url.username || url.password ||
            !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.size) || asset.size <= 0 ||
            typeof asset.filename !== 'string' || !asset.filename) throw new Error('下载信息不正确');
        if (source === 'github' && (url.hostname !== 'github.com' || !url.pathname.startsWith('/icexiv/eorzea/releases/download/'))) throw new Error('下载来源不正确');
        if (source === 'tos' && (url.hostname !== 'azurice-shadow.tos-cn-beijing.volces.com' ||
            url.pathname !== `/eorzea/objects/sha256/${asset.sha256.slice(0, 2)}/${asset.sha256.slice(2)}` || url.search || url.hash)) throw new Error('下载来源不正确');
      }
    }
    return data;
  }

  function load(url, source) {
    const key = `${source}:${url}`;
    if (!cache.has(key)) cache.set(key, (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-cache', credentials: 'omit' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return validate(await response.json(), source);
      } finally { clearTimeout(timeout); }
    })().catch(error => { cache.delete(key); throw error; }));
    return cache.get(key);
  }

  groups.forEach(group => {
    const selector = group.querySelector('.download-platform');
    const status = group.querySelector('.download-status');
    const retry = group.querySelector('.download-retry');
    let manifest = null;
    selector.value = platform;

    function render() {
      for (const name of ['stable', 'dev']) {
        const link = group.querySelector(`[data-channel="${name}"]`);
        const channel = manifest?.channels[name];
        const asset = channel?.assets[selector.value];
        link.removeAttribute('href');
        link.setAttribute('aria-disabled', String(!asset));
        link.tabIndex = asset ? 0 : -1;
        if (asset) {
          link.href = asset.url;
          link.title = `${asset.filename}\n${(asset.size / 1048576).toFixed(1)} MiB\nSHA-256: ${asset.sha256}`;
        } else link.title = !selector.value ? '请选择下载平台' : channel ? '此版本没有对应平台的 App' : '此渠道尚未发布';
        const label = link.querySelector(name === 'stable' ? '[data-download-version]' : '.download-option-note');
        label.textContent = asset ? channel.version : !selector.value ? '选择平台' : channel ? '暂无此平台' : '未发布';
      }
      status.textContent = selector.value ? '下载来源：' + (manifest.source === 'tos' ? 'TOS' : 'GitHub Release') : '请选择下载平台';
    }

    async function refresh() {
      retry.hidden = true;
      status.textContent = '正在读取下载信息';
      try {
        manifest = await load(group.dataset.downloadManifest, group.dataset.downloadSource);
        render();
      } catch {
        if (!manifest) {
          group.querySelector('[data-download-version]').textContent = '信息不可用';
          group.querySelector('.download-option-note').textContent = '信息不可用';
        }
        status.textContent = manifest ? '更新失败，保留上次读取的下载信息' : '下载信息暂不可用，不代表尚未发布';
        retry.hidden = false;
      }
    }
    selector.addEventListener('change', () => { if (manifest) render(); });
    retry.addEventListener('click', refresh);
    refresh();
  });
})();
