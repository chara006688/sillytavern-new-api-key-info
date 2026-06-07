const EXT_ID = 'newapi-key-info';
const QUOTA_PER_USD = 500000;

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
  loading: false,
  error: '',
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

  try {
    const url = new URL(trimmed);
    url.pathname = url.pathname
      .replace(/\/v1\/chat\/completions\/?$/i, '')
      .replace(/\/v1\/?$/i, '')
      .replace(/\/chat\/completions\/?$/i, '')
      .replace(/\/+$/g, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/g, '');
  } catch {
    return trimmed
      .replace(/\/v1\/chat\/completions\/?$/i, '')
      .replace(/\/v1\/?$/i, '')
      .replace(/\/chat\/completions\/?$/i, '')
      .replace(/\/+$/g, '');
  }
}

function bearer(apiKey) {
  const key = String(apiKey || '').trim();
  return key ? `Bearer ${key}` : '';
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
    throw new Error(body.message || 'new-api request failed');
  }
  return body;
}

async function refresh() {
  const baseUrl = normalizeNewApiBase(getValue(firstVisible(selectors.baseUrl)));
  const apiKey = getValue(firstVisible(selectors.apiKey));

  if (!baseUrl) {
    state.error = 'Missing custom API URL.';
    render();
    return;
  }

  if (!apiKey) {
    state.error = 'Missing visible API key. Paste or reveal the key before refreshing.';
    render();
    return;
  }

  state.loading = true;
  state.error = '';
  render();

  try {
    const [pricing, usage] = await Promise.all([
      fetchJson(`${baseUrl}/api/pricing`, apiKey),
      fetchJson(`${baseUrl}/api/usage/token`, apiKey),
    ]);
    state.pricing = pricing;
    state.usage = usage;
    state.lastBaseUrl = baseUrl;
    state.lastApiKeyTail = apiKey.slice(-6);
  } catch (error) {
    state.error = error?.message || String(error);
  } finally {
    state.loading = false;
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
  return `${Math.round(value).toLocaleString()} quota`;
}

function formatUsage() {
  const data = state.usage?.data || {};
  if (!state.usage) return 'Click Refresh.';
  if (data.unlimited_quota) return 'Unlimited quota';

  const available = Number(data.total_available);
  const used = Number(data.total_used);
  const granted = Number(data.total_granted);
  const parts = [];

  if (Number.isFinite(available)) {
    parts.push(`${formatQuota(available)} (${formatUsd(available / QUOTA_PER_USD, 4)}) left`);
  }
  if (Number.isFinite(used) && Number.isFinite(granted)) {
    parts.push(`${formatQuota(used)} used of ${formatQuota(granted)}`);
  }
  return parts.join(' / ') || 'No quota fields returned.';
}

function formatModelPrice() {
  const item = currentPricing();
  if (!state.pricing) return 'Click Refresh.';
  if (!item) return 'No price for selected model.';

  const [, ratio] = preferredGroupRatio();
  if (Number(item.quota_type) === 1) {
    const price = Number(item.model_price) * ratio;
    const quota = price * QUOTA_PER_USD;
    return `per request ${formatUsd(price, 6)} / ${formatQuota(quota)}`;
  }

  const modelRatio = Number(item.model_ratio);
  const completionRatio = Number(item.completion_ratio || 1);
  if (!Number.isFinite(modelRatio)) return 'Price not configured.';

  const inputQuotaPer1k = modelRatio * ratio * 1000;
  const outputQuotaPer1k = modelRatio * completionRatio * ratio * 1000;
  const inputUsdPer1m = modelRatio * ratio * 2;
  const outputUsdPer1m = modelRatio * completionRatio * ratio * 2;
  return `metered input ${formatQuota(inputQuotaPer1k)}/1K (${formatUsd(inputUsdPer1m, 6)}/1M), output ${formatQuota(outputQuotaPer1k)}/1K (${formatUsd(outputUsdPer1m, 6)}/1M)`;
}

function formatModelStatus() {
  const item = currentPricing();
  const model = getCurrentModelName();
  if (!model) return 'No model selected.';
  if (!item) return model;

  const [group, ratio] = preferredGroupRatio();
  const type = Number(item.quota_type) === 1 ? 'fixed' : 'metered';
  return `${item.model_name} (${type}, group ${group} x${ratio})`;
}

function panelHtml() {
  const status = state.loading
    ? '<span class="newapi-key-info__muted">Loading...</span>'
    : state.error
      ? `<span class="newapi-key-info__error">${escapeHtml(state.error)}</span>`
      : `<span class="newapi-key-info__muted">${escapeHtml(state.lastBaseUrl || 'new-api only')}</span>`;

  return `
    <div class="newapi-key-info__row">
      <span class="newapi-key-info__title">New API info</span>
      <span class="newapi-key-info__actions">
        ${status}
        <button class="newapi-key-info__button menu_button" type="button" data-newapi-refresh>Refresh</button>
      </span>
    </div>
    <div class="newapi-key-info__grid">
      <span class="newapi-key-info__label">Model</span>
      <span class="newapi-key-info__value">${escapeHtml(formatModelStatus())}</span>
      <span class="newapi-key-info__label">Price</span>
      <span class="newapi-key-info__value">${escapeHtml(formatModelPrice())}</span>
      <span class="newapi-key-info__label">Balance</span>
      <span class="newapi-key-info__value">${escapeHtml(formatUsage())}</span>
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

function bindLiveRefresh() {
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const clickedConnect = selectors.connect.some((selector) => target.closest(selector));
    const textLooksLikeConnect = /^(connect|连接|連接)$/i.test(String(target.textContent || '').trim());
    if (clickedConnect || textLooksLikeConnect) {
      setTimeout(refresh, 1500);
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
