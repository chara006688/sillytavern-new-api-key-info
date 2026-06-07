const EXT_ID = 'newapi-key-info';
const PLUGIN_ENDPOINT = '/api/plugins/newapi-key-info/summary';
const QUOTA_PER_USD = 500000;
const MODEL_WAIT_TIMEOUT_MS = 8000;

const zh = {
  requestFailed: '\u006e\u0065\u0077\u002d\u0061\u0070\u0069 \u8bf7\u6c42\u5931\u8d25',
  noBaseUrl: '\u7f3a\u5c11\u81ea\u5b9a\u4e49 API \u5730\u5740\u3002',
  noServerKey: '\u540e\u7aef\u6ca1\u6709\u8bfb\u5230\u5df2\u4fdd\u5b58\u7684 Custom API \u5bc6\u94a5\u3002',
  noUsageData: '\u4f59\u989d\u63a5\u53e3\u6ca1\u6709\u8fd4\u56de\u6570\u636e\u3002',
  browserNoKey: '\u672a\u5b89\u88c5\u002f\u672a\u542f\u7528\u540e\u7aef\u63d2\u4ef6\uff0c\u4e14 ST \u5df2\u9690\u85cf\u4fdd\u5b58\u7684\u5bc6\u94a5\uff0c\u4f59\u989d\u67e5\u8be2\u9700\u8981\u9875\u9762\u4e2d\u5b58\u5728\u5b8c\u6574\u5bc6\u94a5\u3002',
  serverUnavailable: '\u540e\u7aef\u63d2\u4ef6\u4e0d\u53ef\u7528',
  quota: '\u989d\u5ea6',
  loading: '\u6b63\u5728\u52a0\u8f7d...',
  clickRefresh: '\u70b9\u51fb\u8fde\u63a5\u6216\u5237\u65b0\u3002',
  unlimited: '\u65e0\u9650\u989d\u5ea6',
  remaining: '\u5269\u4f59',
  about: '\u7ea6',
  used: '\u5df2\u7528',
  total: '\u603b\u8ba1',
  badUsageFields: '\u63a5\u53e3\u672a\u8fd4\u56de\u53ef\u8bc6\u522b\u7684\u4f59\u989d\u5b57\u6bb5\u3002',
  waitModels: '\u6b63\u5728\u7b49\u5f85\u6a21\u578b\u5217\u8868...',
  noPrice: '\u5f53\u524d\u6a21\u578b\u6ca1\u6709\u4ef7\u683c\u4fe1\u606f\u3002',
  badPrice: '\u4ef7\u683c\u672a\u914d\u7f6e\u3002',
  perRequest: '\u6309\u6b21',
  metered: '\u6309\u91cf',
  input: '\u8f93\u5165',
  output: '\u8f93\u51fa',
  noModel: '\u672a\u9009\u62e9\u6a21\u578b\u3002',
  group: '\u5206\u7ec4',
  serverMode: '\u540e\u7aef\u6a21\u5f0f',
  browserMode: '\u524d\u7aef\u6a21\u5f0f',
  onlyNewApi: '\u4ec5\u652f\u6301 new-api',
  waitingModelShort: '\u7b49\u5f85\u6a21\u578b...',
  loadingShort: '\u52a0\u8f7d\u4e2d...',
  title: 'New API \u4fe1\u606f',
  refresh: '\u5237\u65b0',
  model: '\u6a21\u578b',
  price: '\u4ef7\u683c',
  balance: '\u4f59\u989d',
  source: '\u6765\u6e90',
  keyTail: '\u5bc6\u94a5\u5c3e\u53f7',
};

const selectors = {
  source: [
    '#chat_completion_source',
    '#openai_api_source',
    '[name="chat_completion_source"]',
  ],
  baseUrl: [
    '#custom_api_url_text',
    '#custom_openai_api_url',
    '#custom_api_url',
    '#openai_reverse_proxy',
    '[name="custom_api_url"]',
    '[name="custom_openai_api_url"]',
  ],
  apiKey: [
    '#custom_openai_api_key',
    '#custom_api_key',
    '#api_key_custom',
    '#api_key_openai',
    '#openai_api_key',
    '[name="custom_openai_api_key"]',
    '[name="custom_api_key"]',
    'input[type="password"]',
  ],
  model: [
    '#model_openai_select',
    '#model_custom_select',
    '#model_chat_completion',
    '#openai_model',
    '#custom_model',
    '[name="model"]',
  ],
  connect: [
    '#api_button_openai',
    '#api_button',
    '#connect_button',
    '[data-i18n="Connect"]',
  ],
};

let state = {
  pricing: null,
  usage: null,
  lastBaseUrl: '',
  lastApiKeyTail: '',
  mode: '',
  loadingPricing: false,
  loadingUsage: false,
  waitingForModel: false,
  pricingError: '',
  usageError: '',
};

function firstVisible(selectorList) {
  for (const selector of selectorList) {
    for (const el of document.querySelectorAll(selector)) {
      if (el instanceof HTMLElement && el.offsetParent !== null) {
        return el;
      }
    }
  }
  return null;
}

function getValue(el) {
  if (!el) return '';
  if ('value' in el) return String(el.value || '').trim();
  return String(el.textContent || '').trim();
}

function selectedText(el) {
  if (!(el instanceof HTMLSelectElement)) return '';
  return String(el.options[el.selectedIndex]?.textContent || '').trim();
}

function isCustomChatCompletion() {
  const source = firstVisible(selectors.source);
  if (!source) return Boolean(firstVisible(selectors.baseUrl));

  const value = getValue(source).toLowerCase();
  const text = selectedText(source).toLowerCase();
  return value.includes('custom') || text.includes('custom');
}

function normalizeNewApiBase(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';

  const cleanPath = (path) => path
    .replace(/\/api\/pricing\/?$/i, '')
    .replace(/\/pricing\/?$/i, '')
    .replace(/\/api\/usage\/token\/?$/i, '')
    .replace(/\/v1\/chat\/completions\/?$/i, '')
    .replace(/\/v1\/?$/i, '')
    .replace(/\/api\/?$/i, '')
    .replace(/\/chat\/completions\/?$/i, '')
    .replace(/\/+$/g, '');

  try {
    const url = new URL(trimmed);
    url.pathname = cleanPath(url.pathname);
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/g, '');
  } catch {
    return cleanPath(trimmed).replace(/\/$/g, '');
  }
}

function bearer(apiKey) {
  const key = String(apiKey || '').trim();
  return key ? `Bearer ${key}` : '';
}

function looksLikeMaskedSecret(value) {
  const key = String(value || '').trim();
  if (!key) return true;
  return /^(\*+|hidden|saved)$/i.test(key)
    || /^sk-[*.]+$/i.test(key)
    || key.includes('****')
    || key.includes('\u2022\u2022\u2022\u2022');
}

function getVisibleApiKey() {
  const key = getValue(firstVisible(selectors.apiKey));
  return looksLikeMaskedSecret(key) ? '' : key;
}

function buildRequestHeaders() {
  const contextHeaders = globalThis.SillyTavern?.getContext?.()?.getRequestHeaders?.()
    || globalThis.getRequestHeaders?.()
    || {};
  return {
    ...contextHeaders,
    'Content-Type': 'application/json',
  };
}

async function fetchJson(url, apiKey) {
  const headers = {};
  const token = bearer(apiKey);
  if (token) headers.Authorization = token;

  const response = await fetch(url, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || `${response.status} ${response.statusText}`);
  }
  if (body.success === false || body.code === false) {
    throw new Error(body.message || zh.requestFailed);
  }
  return body;
}

async function fetchServerSummary(baseUrl) {
  const response = await fetch(PLUGIN_ENDPOINT, {
    method: 'POST',
    headers: buildRequestHeaders(),
    body: JSON.stringify({ baseUrl }),
    cache: 'no-store',
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new Error(body.message || `${response.status} ${response.statusText}`);
  }
  return body;
}

async function refreshViaServer(baseUrl) {
  const result = await fetchServerSummary(baseUrl);
  state.mode = 'server';
  state.pricing = result.pricing || null;
  state.usage = result.usage || null;
  state.pricingError = result.errors?.pricing || '';
  state.usageError = result.errors?.usage || '';
  state.lastApiKeyTail = result.keyTail || '';

  if (!result.hasKey) {
    state.usageError = zh.noServerKey;
  } else if (!state.usage && !state.usageError) {
    state.usageError = zh.noUsageData;
  }
}

async function refreshViaBrowser(baseUrl) {
  const apiKey = getVisibleApiKey();
  state.mode = 'browser';
  state.lastApiKeyTail = apiKey ? apiKey.slice(-6) : '';
  state.usageError = apiKey ? '' : zh.browserNoKey;

  const tasks = [
    (async () => {
      try {
        state.pricing = await fetchJson(`${baseUrl}/api/pricing`, apiKey);
      } catch (error) {
        state.pricingError = error?.message || String(error);
      }
    })(),
  ];

  if (apiKey) {
    tasks.push((async () => {
      try {
        state.usage = await fetchJson(`${baseUrl}/api/usage/token`, apiKey);
      } catch (error) {
        state.usageError = error?.message || String(error);
      }
    })());
  } else {
    state.usage = null;
  }

  await Promise.all(tasks);
}

async function refresh() {
  const baseUrl = normalizeNewApiBase(getValue(firstVisible(selectors.baseUrl)));

  if (!baseUrl) {
    state.pricingError = zh.noBaseUrl;
    state.usageError = '';
    render();
    return;
  }

  state.loadingPricing = true;
  state.loadingUsage = true;
  state.pricingError = '';
  state.usageError = '';
  state.lastBaseUrl = baseUrl;
  render();

  try {
    await refreshViaServer(baseUrl);
  } catch (serverError) {
    state.pricingError = '';
    await refreshViaBrowser(baseUrl);
    if (!state.usage && state.usageError) {
      state.usageError += `\uff08${zh.serverUnavailable}\uff1a${serverError?.message || String(serverError)}\uff09`;
    }
  } finally {
    state.loadingPricing = false;
    state.loadingUsage = false;
    render();
  }
}

function getCurrentModelName() {
  const modelEl = firstVisible(selectors.model);
  return getValue(modelEl) || selectedText(modelEl);
}

function pricingItems() {
  const data = state.pricing?.data;
  return Array.isArray(data) ? data : [];
}

function currentPricing() {
  const model = getCurrentModelName();
  if (!model) return null;

  return pricingItems().find((item) => item.model_name === model)
    || pricingItems().find((item) => item.model_name?.toLowerCase() === model.toLowerCase())
    || null;
}

function groupRatios() {
  const ratios = state.pricing?.group_ratio;
  if (!ratios || typeof ratios !== 'object') return [['default', 1]];
  const entries = Object.entries(ratios)
    .map(([name, ratio]) => [name, Number(ratio)])
    .filter(([, ratio]) => Number.isFinite(ratio));
  return entries.length ? entries : [['default', 1]];
}

function preferredGroupRatio() {
  const ratios = groupRatios();
  const defaultish = ratios.find(([name]) => ['default', 'standard'].includes(String(name).toLowerCase()));
  return defaultish || ratios[0] || ['default', 1];
}

function formatUsd(value, digits = 6) {
  if (!Number.isFinite(value)) return '-';
  return `$${Number(value).toFixed(digits).replace(/\.?0+$/g, '')}`;
}

function formatQuota(value) {
  if (!Number.isFinite(value)) return '-';
  return `${Math.round(value).toLocaleString()} ${zh.quota}`;
}

function formatUsage() {
  const data = state.usage?.data || {};
  if (state.loadingUsage) return zh.loading;
  if (state.usageError) return state.usageError;
  if (!state.usage) return zh.clickRefresh;
  if (data.unlimited_quota) return zh.unlimited;

  const available = Number(data.total_available);
  const used = Number(data.total_used);
  const granted = Number(data.total_granted);
  const parts = [];

  if (Number.isFinite(available)) {
    parts.push(`${zh.remaining} ${formatQuota(available)}，${zh.about} ${formatUsd(available / QUOTA_PER_USD, 4)}`);
  }
  if (Number.isFinite(used) && Number.isFinite(granted)) {
    parts.push(`${zh.used} ${formatQuota(used)} / ${zh.total} ${formatQuota(granted)}`);
  }
  return parts.join(' / ') || zh.badUsageFields;
}

function formatModelPrice() {
  const item = currentPricing();
  if (state.waitingForModel) return zh.waitModels;
  if (state.loadingPricing) return zh.loading;
  if (state.pricingError) return state.pricingError;
  if (!state.pricing) return zh.clickRefresh;
  if (!item) return zh.noPrice;

  const [, ratio] = preferredGroupRatio();
  if (Number(item.quota_type) === 1) {
    const price = Number(item.model_price) * ratio;
    const quota = price * QUOTA_PER_USD;
    return `${zh.perRequest} ${formatUsd(price, 6)} / ${formatQuota(quota)}`;
  }

  const modelRatio = Number(item.model_ratio);
  const completionRatio = Number(item.completion_ratio || 1);
  if (!Number.isFinite(modelRatio)) return zh.badPrice;

  const inputQuotaPer1k = modelRatio * ratio * 1000;
  const outputQuotaPer1k = modelRatio * completionRatio * ratio * 1000;
  const inputUsdPer1m = modelRatio * ratio * 2;
  const outputUsdPer1m = modelRatio * completionRatio * ratio * 2;
  return `${zh.metered} ${zh.input} ${formatQuota(inputQuotaPer1k)}/1K (${formatUsd(inputUsdPer1m, 6)}/1M)，${zh.output} ${formatQuota(outputQuotaPer1k)}/1K (${formatUsd(outputUsdPer1m, 6)}/1M)`;
}

function formatModelStatus() {
  const item = currentPricing();
  const model = getCurrentModelName();
  if (!model) return zh.noModel;
  if (!item) return model;

  const [group, ratio] = preferredGroupRatio();
  const type = Number(item.quota_type) === 1 ? zh.perRequest : zh.metered;
  return `${item.model_name}（${type}，${zh.group} ${group} x${ratio}）`;
}

function formatMode() {
  if (state.mode === 'server') return zh.serverMode;
  if (state.mode === 'browser') return zh.browserMode;
  return zh.onlyNewApi;
}

function panelHtml() {
  const status = state.waitingForModel
    ? `<span class="newapi-key-info__muted">${zh.waitingModelShort}</span>`
    : state.loadingPricing || state.loadingUsage
      ? `<span class="newapi-key-info__muted">${zh.loadingShort}</span>`
      : state.pricingError
        ? `<span class="newapi-key-info__error">${escapeHtml(state.pricingError)}</span>`
        : `<span class="newapi-key-info__muted">${escapeHtml(formatMode())}</span>`;

  const source = `${formatMode()}${state.lastApiKeyTail ? `，${zh.keyTail} ${state.lastApiKeyTail}` : ''}`;

  return `
    <div class="newapi-key-info__row">
      <span class="newapi-key-info__title">${zh.title}</span>
      <span class="newapi-key-info__actions">
        ${status}
        <button class="newapi-key-info__button menu_button" type="button" data-newapi-refresh>${zh.refresh}</button>
      </span>
    </div>
    <div class="newapi-key-info__grid">
      <span class="newapi-key-info__label">${zh.model}</span>
      <span class="newapi-key-info__value">${escapeHtml(formatModelStatus())}</span>
      <span class="newapi-key-info__label">${zh.price}</span>
      <span class="newapi-key-info__value">${escapeHtml(formatModelPrice())}</span>
      <span class="newapi-key-info__label">${zh.balance}</span>
      <span class="newapi-key-info__value">${escapeHtml(formatUsage())}</span>
      <span class="newapi-key-info__label">${zh.source}</span>
      <span class="newapi-key-info__value">${escapeHtml(source)}</span>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function findInsertionTarget() {
  const key = firstVisible(selectors.apiKey);
  if (key) return key.closest('.flex-container, .wide100p, .inline-drawer-content, label, div') || key;

  const baseUrl = firstVisible(selectors.baseUrl);
  if (baseUrl) return baseUrl.closest('.flex-container, .wide100p, .inline-drawer-content, label, div') || baseUrl;

  return document.querySelector('#APIBlock, #api_settings, #connection_profiles, .api_settings') || null;
}

function ensurePanel() {
  if (!isCustomChatCompletion()) {
    document.getElementById(EXT_ID)?.remove();
    return null;
  }

  let panel = document.getElementById(EXT_ID);
  if (panel) return panel;

  const target = findInsertionTarget();
  if (!target) return null;

  panel = document.createElement('div');
  panel.id = EXT_ID;
  panel.className = 'newapi-key-info';
  target.insertAdjacentElement('afterend', panel);
  panel.addEventListener('click', (event) => {
    if (event.target?.closest?.('[data-newapi-refresh]')) {
      refresh();
    }
  });
  return panel;
}

function render() {
  const panel = ensurePanel();
  if (!panel) return;
  panel.innerHTML = panelHtml();
}

function scheduleRender() {
  clearTimeout(scheduleRender.timer);
  scheduleRender.timer = setTimeout(render, 150);
}

scheduleRender.timer = null;

function waitForModel(timeoutMs = MODEL_WAIT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve) => {
    const tick = () => {
      if (getCurrentModelName()) {
        resolve(true);
        return;
      }

      if (Date.now() >= deadline) {
        resolve(false);
        return;
      }

      setTimeout(tick, 250);
    };

    tick();
  });
}

async function refreshAfterConnect() {
  state.waitingForModel = true;
  render();
  await waitForModel();
  state.waitingForModel = false;
  await refresh();
}

function bindLiveRefresh() {
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const clickedConnect = selectors.connect.some((selector) => target.closest(selector));
    const textLooksLikeConnect = /^(connect|\u8fde\u63a5|\u9023\u63a5)$/i.test(String(target.textContent || '').trim());
    if (clickedConnect || textLooksLikeConnect) {
      setTimeout(refreshAfterConnect, 500);
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target?.matches?.([
      ...selectors.source,
      ...selectors.baseUrl,
      ...selectors.apiKey,
      ...selectors.model,
    ].join(','))) {
      scheduleRender();
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target?.matches?.([
      ...selectors.baseUrl,
      ...selectors.apiKey,
      ...selectors.model,
    ].join(','))) {
      scheduleRender();
    }
  });

  const observer = new MutationObserver((mutations) => {
    const onlyOwnPanelChanged = mutations.every((mutation) => {
      const target = mutation.target instanceof Element
        ? mutation.target
        : mutation.target.parentElement;
      return target?.id === EXT_ID || target?.closest?.(`#${EXT_ID}`);
    });
    if (!onlyOwnPanelChanged) scheduleRender();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

bindLiveRefresh();
scheduleRender();
