const PLUGIN_ID = 'newapi-key-info';
const REQUEST_TIMEOUT_MS = 15000;

function normalizeNewApiBase(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    throw new Error('缺少自定义 API 地址。');
  }

  const url = new URL(trimmed);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('只允许 http/https API 地址。');
  }

  url.pathname = url.pathname
    .replace(/\/api\/pricing\/?$/i, '')
    .replace(/\/pricing\/?$/i, '')
    .replace(/\/api\/usage\/token\/?$/i, '')
    .replace(/\/v1\/chat\/completions\/?$/i, '')
    .replace(/\/v1\/?$/i, '')
    .replace(/\/api\/?$/i, '')
    .replace(/\/chat\/completions\/?$/i, '')
    .replace(/\/+$/g, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/g, '');
}

async function fetchJson(url, apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.message || `${response.status} ${response.statusText}`);
    }
    if (body.success === false || body.code === false) {
      throw new Error(body.message || 'new-api 请求失败');
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function readCustomApiKey(request) {
  const { readSecret, SECRET_KEYS } = await import('../../src/endpoints/secrets.js');
  const directories = request.user?.directories;

  if (!directories) {
    throw new Error('当前请求没有用户目录信息。');
  }

  return readSecret(directories, SECRET_KEYS.CUSTOM);
}

async function init(router) {
  router.post('/summary', async (request, response) => {
    try {
      const baseUrl = normalizeNewApiBase(request.body?.baseUrl);
      const apiKey = await readCustomApiKey(request);
      const errors = {};
      let pricing = null;
      let usage = null;

      try {
        pricing = await fetchJson(`${baseUrl}/api/pricing`, apiKey);
      } catch (error) {
        errors.pricing = error?.message || String(error);
      }

      if (apiKey) {
        try {
          usage = await fetchJson(`${baseUrl}/api/usage/token`, apiKey);
        } catch (error) {
          errors.usage = error?.message || String(error);
        }
      } else {
        errors.usage = '未找到已保存的 Custom API 密钥。';
      }

      response.json({
        success: true,
        mode: 'server',
        hasKey: Boolean(apiKey),
        keyTail: apiKey ? apiKey.slice(-6) : '',
        pricing,
        usage,
        errors,
      });
    } catch (error) {
      response.status(500).json({
        success: false,
        message: error?.message || String(error),
      });
    }
  });

  console.log('[new-api-key-info] server plugin loaded');
}

async function exit() {
  return Promise.resolve();
}

module.exports = {
  init,
  exit,
  info: {
    id: PLUGIN_ID,
    name: 'New API 密钥信息',
    description: '读取 SillyTavern 已保存的 Custom API 密钥并查询 new-api 价格与余额。',
  },
};
