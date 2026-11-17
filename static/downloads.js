(() => {
  const groups = [...document.querySelectorAll('[data-download-manifest]')];
  const cache = new Map();
  const labels = {
    'windows-x86_64': 'Windows · x86_64', 'windows-aarch64': 'Windows · ARM64', 'windows-x86': 'Windows · 32 位',
    'linux-x86_64': 'Linux · x86_64', 'linux-aarch64': 'Linux · ARM64', 'linux-x86': 'Linux · 32 位',
    'macos-aarch64': 'macOS · Apple Silicon', 'macos-x86_64': 'macOS · Intel',
  };

  async function detectPlatform() {
    const ua = navigator.userAgent || '';
    if (/Android|iPhone|iPad|iPod/i.test(ua) || navigator.userAgentData?.mobile ||
        (/Mac/i.test(navigator.platform) && navigator.maxTouchPoints > 1)) return '';
    if (navigator.userAgentData?.getHighEntropyValues) {
      let timer;
      try {
        const hints = await Promise.race([
          navigator.userAgentData.getHighEntropyValues(['platform', 'architecture', 'bitness', 'wow64']),
          new Promise(resolve => { timer = setTimeout(() => resolve(null), 1200); }),
        ]);
        if (hints) {
          const os = /Windows/i.test(hints.platform) ? 'windows' : /macOS/i.test(hints.platform) ? 'macos' : /Linux/i.test(hints.platform) ? 'linux' : '';
          const architecture = hints.architecture || '';
          const bits64 = hints.bitness === '64' || hints.wow64 === true || /64/.test(architecture);
          const arch = /arm|aarch/i.test(architecture) && bits64 ? 'aarch64'
            : /x86|amd/i.test(architecture) && bits64 ? 'x86_64'
            : hints.bitness === '32' ? 'x86' : '';
          if (os && arch) return `${os}-${arch}`;
        }
      } catch { /* Fall back only to architecture information actually present in the UA. */ }
      finally { clearTimeout(timer); }
    }
    // Safari reports Intel in the UA even on Apple Silicon; do not infer a Mac CPU from it.
    if (/Mac/i.test(navigator.platform) || /Macintosh/i.test(ua)) return '';
    const os = /Windows/i.test(ua) ? 'windows' : /Linux/i.test(ua) ? 'linux' : '';
    const arch = /aarch64|arm64/i.test(ua) ? 'aarch64' : /Win64|WOW64|x86_64|amd64|\bx64\b/i.test(ua) ? 'x86_64'
      : /i[3-6]86|\bx86\b/i.test(ua) ? 'x86' : '';
    return os && arch ? `${os}-${arch}` : '';
  }
  const detectedPlatform = detectPlatform();

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
    const status = group.querySelector('.download-status');
    const retry = group.querySelector('.download-retry');
    const splits = [...group.querySelectorAll('[data-download-channel]')];
    let manifest = null;
    let platform = '';

    function updateLink(link, asset, unavailable) {
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', String(!asset));
      link.tabIndex = asset ? 0 : -1;
      link.title = asset ? `${asset.filename}\n${(asset.size / 1048576).toFixed(1)} MiB\nSHA-256: ${asset.sha256}` : unavailable;
      if (asset) link.href = asset.url;
    }

    function render() {
      for (const split of splits) {
        const channel = manifest.channels[split.dataset.downloadChannel];
        const asset = channel?.assets[platform];
        const link = split.querySelector('.download-primary');
        const unavailable = !channel ? '此渠道尚未发布' : !platform ? '展开箭头选择平台' : `${labels[platform] || platform} 暂无构建`;
        updateLink(link, asset, unavailable);
        const version = channel?.version;
        const devBuild = split.dataset.downloadChannel === 'dev' && version?.match(/^dev-([0-9a-f]{7,40})-\d+-\d+$/i);
        split.querySelector('[data-download-version]').textContent = devBuild ? devBuild[1].slice(0, 7) : version || '未发布';
        split.querySelector('.download-filename').textContent = asset ? asset.filename : unavailable;
        split.querySelector('.download-filename').title = asset ? asset.filename : unavailable;
        split.querySelector('.download-menu-label').textContent = platform ? '其他平台' : '选择平台';
        for (const option of split.querySelectorAll('[data-platform]')) {
          const key = option.dataset.platform;
          const alternative = channel?.assets[key];
          option.hidden = key === platform;
          updateLink(option, alternative, channel ? '此平台暂无构建' : '此渠道尚未发布');
          option.querySelector('.download-option-note').textContent = alternative ? alternative.filename : channel ? '暂无此平台' : '未发布';
        }
      }
      status.textContent = (platform ? `已识别 ${labels[platform] || platform}` : '无法确认平台架构，请在箭头中选择') +
        ' · 下载来源：' + (manifest.source === 'tos' ? 'TOS' : 'GitHub Release');
    }

    async function refresh() {
      retry.hidden = true;
      status.textContent = '正在读取下载信息';
      try {
        const result = await Promise.all([load(group.dataset.downloadManifest, group.dataset.downloadSource), detectedPlatform]);
        manifest = result[0];
        platform = result[1];
        render();
      } catch {
        if (!manifest) {
          for (const split of splits) {
            split.querySelector('[data-download-version]').textContent = '信息不可用';
            split.querySelector('.download-filename').textContent = '下载信息暂不可用';
            for (const option of split.querySelectorAll('[data-platform]')) option.querySelector('.download-option-note').textContent = '信息不可用';
          }
        }
        status.textContent = manifest ? '更新失败，保留上次读取的下载信息' : '下载信息暂不可用，不代表尚未发布';
        retry.hidden = false;
      }
    }
    retry.addEventListener('click', refresh);
    refresh();
  });
})();
