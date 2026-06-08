const PLUGIN_ID = 'newapi-key-info';
const REQUEST_TIMEOUT_MS = 15000;
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SECRETS_FILE = 'secrets.json';
const CUSTOM_SECRET_KEYS = [
  'api_key_custom',
  'custom_openai_api_key',
  'custom_api_key',
];

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

  const inspected = inspectSecretsFile(request, secretId);
  const debug = inspected.debug;
  let helperKey = 'api_key_custom';

  try {
    const secretsModulePath = findSillyTavernSecretsModule();
    if (!secretsModulePath) {
      throw new Error('SillyTavern src/endpoints/secrets.js not found');
    }

    const { readSecret, SECRET_KEYS } = await import(pathToFileURL(secretsModulePath).href);
    helperKey = SECRET_KEYS?.CUSTOM || helperKey;
    debug.helperImported = true;

    const byId = secretId ? readSecret(directories, helperKey, secretId) : '';
    if (byId) {
      debug.helperFound = true;
      debug.found = true;
      debug.selectedKey = helperKey;
      debug.selectedBy = 'helper:secret-id';
      return { apiKey: byId, debug };
    }

    const active = readSecret(directories, helperKey);
    if (active) {
      debug.helperFound = true;
      debug.found = true;
      debug.selectedKey = helperKey;
      debug.selectedBy = 'helper:active';
      return { apiKey: active, debug };
    }
  } catch (error) {
    debug.helperError = error?.message || String(error);
    console.warn('[new-api-key-info] failed to use SillyTavern secrets helper:', debug.helperError);
  }

  const fileResult = readCustomApiKeyFromFile(inspected.secrets, unique([helperKey, ...CUSTOM_SECRET_KEYS]), secretId, debug);
  return { apiKey: fileResult, debug };
}

function findSillyTavernSecretsModule() {
  let current = __dirname;

  for (let depth = 0; depth < 10; depth += 1) {
    const candidate = path.join(current, 'src', 'endpoints', 'secrets.js');
    if (fs.existsSync(candidate)) return candidate;

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return '';
}

function inspectSecretsFile(request, secretId) {
  const root = request.user?.directories?.root || '';
  const filePath = root ? path.join(root, SECRETS_FILE) : '';
  const debug = {
    userHandle: request.user?.profile?.handle || '',
    root,
    secretFilePath: filePath,
    secretFileExists: false,
    requestedSecretId: Boolean(secretId),
    requestedSecretIdTail: secretId ? secretId.slice(-8) : '',
    helperImported: false,
    helperFound: false,
    helperError: '',
    secretKeys: [],
    candidates: [],
    selectedKey: '',
    selectedBy: '',
    found: false,
    errors: [],
  };

  if (!filePath) return { secrets: null, debug };
  if (!fs.existsSync(filePath)) return { secrets: null, debug };

  debug.secretFileExists = true;

  try {
    const secrets = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    debug.secretKeys = Object.keys(secrets || {}).sort();
    return { secrets, debug };
  } catch (error) {
    debug.errors.push(`read secrets.json: ${error?.message || String(error)}`);
    return { secrets: null, debug };
  }
}

function readCustomApiKeyFromFile(secrets, keys, secretId, debug) {
  let selectedApiKey = '';

  for (const key of keys) {
    const { apiKey, summary } = summarizeSecretCandidate(key, secrets?.[key], secretId);
    debug.candidates.push(summary);

    if (!selectedApiKey && apiKey) {
      selectedApiKey = apiKey;
      debug.found = true;
      debug.selectedKey = key;
      debug.selectedBy = summary.selectedBy;
    }
  }

  return selectedApiKey;
}

function summarizeSecretCandidate(key, value, secretId) {
  const summary = {
    key,
    type: secretValueType(value),
    count: 0,
    activeCount: 0,
    requestedFound: false,
    activeFound: false,
    firstValueFound: false,
    selectedBy: '',
  };

  if (typeof value === 'string') {
    const apiKey = cleanSecret(value);
    summary.count = apiKey ? 1 : 0;
    summary.firstValueFound = Boolean(apiKey);
    summary.selectedBy = apiKey ? 'file:string' : '';
    return { apiKey, summary };
  }

  if (Array.isArray(value)) {
    summary.count = value.length;
    summary.activeCount = value.filter((secret) => secret?.active).length;

    const byId = secretId ? value.find((secret) => String(secret?.id || '') === secretId && cleanSecret(secret?.value)) : null;
    const active = value.find((secret) => secret?.active && cleanSecret(secret?.value));
    const first = value.find((secret) => cleanSecret(secret?.value));
    const selected = byId || active || first;

    summary.requestedFound = Boolean(byId);
    summary.activeFound = Boolean(active);
    summary.firstValueFound = Boolean(first);
    summary.selectedBy = byId ? 'file:secret-id' : active ? 'file:active' : first ? 'file:first' : '';
    return { apiKey: cleanSecret(selected?.value), summary };
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    summary.count = entries.length;

    const direct = cleanSecret(value.value);
    const byId = secretId
      ? entries.find(([id, entry]) => (id === secretId || String(entry?.id || '') === secretId) && cleanSecret(secretEntryValue(entry)))
      : null;
    const active = entries.find(([, entry]) => entry?.active && cleanSecret(secretEntryValue(entry)));
    const first = entries.find(([, entry]) => cleanSecret(secretEntryValue(entry)));
    const selected = byId?.[1] || active?.[1] || first?.[1];

    summary.requestedFound = Boolean(byId);
    summary.activeFound = Boolean(active);
    summary.firstValueFound = Boolean(direct || first);

    if (direct) {
      summary.selectedBy = 'file:object-value';
      return { apiKey: direct, summary };
    }

    summary.selectedBy = byId ? 'file:object-secret-id' : active ? 'file:object-active' : first ? 'file:object-first' : '';
    return { apiKey: cleanSecret(secretEntryValue(selected)), summary };
  }

  return { apiKey: '', summary };
}

function secretValueType(value) {
  if (value === undefined) return 'missing';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function secretEntryValue(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') return entry.value;
  return '';
}

function cleanSecret(value) {
  return String(value || '').trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function init(router) {
  router.post('/summary', async (request, response) => {
    try {
      const baseUrl = normalizeNewApiBase(request.body?.baseUrl);
      const { apiKey, debug } = await readCustomApiKey(request);
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
        debug,
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
