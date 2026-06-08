const PLUGIN_ID = 'newapi-key-info';
const REQUEST_TIMEOUT_MS = 15000;
const fs = require('node:fs');
const path = require('node:path');

const zh = {
  noBaseUrl: '\u7f3a\u5c11\u81ea\u5b9a\u4e49 API \u5730\u5740\u3002',
  badProtocol: '\u53ea\u5141\u8bb8 http/https API \u5730\u5740\u3002',
  requestFailed: '\u006e\u0065\u0077\u002d\u0061\u0070\u0069 \u8bf7\u6c42\u5931\u8d25',
  noUserDirs: '\u5f53\u524d\u8bf7\u6c42\u6ca1\u6709\u7528\u6237\u76ee\u5f55\u4fe1\u606f\u3002',
  noSavedKey: '\u672a\u627e\u5230\u5df2\u4fdd\u5b58\u7684 Custom API \u5bc6\u94a5\u3002',
  name: 'New API \u5bc6\u94a5\u4fe1\u606f',
  description: '\u8bfb\u53d6 SillyTavern \u5df2\u4fdd\u5b58\u7684 Custom API \u5bc6\u94a5\u5e76\u67e5\u8be2 new-api \u4ef7\u683c\u4e0e\u4f59\u989d\u3002',
};

function normalizeNewApiBase(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    throw new Error(zh.noBaseUrl);
  }

  const url = new URL(trimmed);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(zh.badProtocol);
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
      throw new Error(body.message || zh.requestFailed);
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function readCustomApiKey(request) {
  const directories = request.user?.directories;
  const secretId = String(request.body?.secretId || request.body?.secret_id || '').trim() || null;

  if (!directories) {
    throw new Error(zh.noUserDirs);
  }

  try {
    const { readSecret, SECRET_KEYS } = await import('../../src/endpoints/secrets.js');
    return readSecret(directories, SECRET_KEYS.CUSTOM, secretId)
      || readSecret(directories, SECRET_KEYS.CUSTOM)
      || readCustomApiKeyFromFile(directories, SECRET_KEYS.CUSTOM, secretId);
  } catch (error) {
    console.warn('[new-api-key-info] failed to import SillyTavern secrets helper:', error?.message || error);
    return readCustomApiKeyFromFile(directories, 'api_key_custom', secretId);
  }
}

function readCustomApiKeyFromFile(directories, key, secretId) {
  try {
    const filePath = path.join(directories.root, 'secrets.json');
    if (!fs.existsSync(filePath)) return '';

    const secrets = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const value = secrets?.[key];

    if (typeof value === 'string') return value;
    if (!Array.isArray(value)) return '';

    const selected = value.find((secret) => secretId ? secret?.id === secretId : secret?.active)
      || value.find((secret) => secret?.active)
      || value[0];
    return String(selected?.value || '');
  } catch (error) {
    console.warn('[new-api-key-info] failed to read secrets.json fallback:', error?.message || error);
    return '';
  }
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
        errors.usage = zh.noSavedKey;
      }

      response.json({
        success: true,
        mode: 'server',
        hasKey: Boolean(apiKey),
        keyTail: apiKey ? apiKey.slice(-6) : '',
        baseUrl,
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
    name: zh.name,
    description: zh.description,
  },
};
