const EXT_ID = 'newapi-key-info';
const QUOTA_PER_USD = 500000;
const MODEL_WAIT_TIMEOUT_MS = 8000;

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
    throw new Error(body.message || 'new-api 请求失败');
  }
  return body;
}

async function refresh() {
  const baseUrl = normalizeNewApiBase(getValue(firstVisible(selectors.baseUrl)));
  const apiKey = getVisibleApiKey();

  if (!baseUrl) {
    state.pricingError = '缺少自定义 API 地址。';
    state.usageError = '';
    render();
    return;
  }

  state.loadingPricing = true;
  state.loadingUsage = Boolean(apiKey);
  state.pricingError = '';
  state.usageError = apiKey
    ? ''
    : 'ST 已隐藏保存的密钥，余额查询需要页面中存在完整密钥。';
  state.lastBaseUrl = baseUrl;
  state.lastApiKeyTail = apiKey ? apiKey.slice(-6) : '';
  render();

  const tasks = [
    (async () => {
      try {
        state.pricing = await fetchJson(`${baseUrl}/api/pricing`, apiKey);
      } catch (error) {
        state.pricingError = error?.message || String(error);
      } finally {
        state.loadingPricing = false;
        render();
      }
    })(),
  ];

  if (apiKey) {
    tasks.push((async () => {
      try {
        state.usage = await fetchJson(`${baseUrl}/api/usage/token`, apiKey);
      } catch (error) {
        state.usageError = error?.message || String(error);
      } finally {
        state.loadingUsage = false;
        render();
      }
    })());
  } else {
    state.usage = null;
    state.loadingUsage = false;
  }

  await Promise.all(tasks);
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
  return `${Math.round(value).toLocaleString()} 额度`;
}

function formatUsage() {
  const data = state.usage?.data || {};
  if (state.loadingUsage) return '正在加载...';
  if (state.usageError) return state.usageError;
  if (!state.usage) return '点击连接或刷新。';
  if (data.unlimited_quota) return '无限额度';

  const available = Number(data.total_available);
  const used = Number(data.total_used);
  const granted = Number(data.total_granted);
  const parts = [];

  if (Number.isFinite(available)) {
    parts.push(`剩余 ${formatQuota(available)}，约 ${formatUsd(available / QUOTA_PER_USD, 4)}`);
  }
  if (Number.isFinite(used) && Number.isFinite(granted)) {
    parts.push(`已用 ${formatQuota(used)} / 总计 ${formatQuota(granted)}`);
  }
  return parts.join(' / ') || '接口未返回可识别的余额字段。';
}

function formatModelPrice() {
  const item = currentPricing();
  if (state.waitingForModel) return '正在等待模型列表...';
  if (state.loadingPricing) return '正在加载...';
  if (state.pricingError) return state.pricingError;
  if (!state.pricing) return '点击连接或刷新。';
  if (!item) return '当前模型没有价格信息。';

  const [, ratio] = preferredGroupRatio();
  if (Number(item.quota_type) === 1) {
    const price = Number(item.model_price) * ratio;
    const quota = price * QUOTA_PER_USD;
    return `按次 ${formatUsd(price, 6)} / ${formatQuota(quota)}`;
  }

  const modelRatio = Number(item.model_ratio);
  const completionRatio = Number(item.completion_ratio || 1);
  if (!Number.isFinite(modelRatio)) return '价格未配置。';

  const inputQuotaPer1k = modelRatio * ratio * 1000;
  const outputQuotaPer1k = modelRatio * completionRatio * ratio * 1000;
  const inputUsdPer1m = modelRatio * ratio * 2;
  const outputUsdPer1m = modelRatio * completionRatio * ratio * 2;
  return `按量 输入 ${formatQuota(inputQuotaPer1k)}/1K (${formatUsd(inputUsdPer1m, 6)}/1M)，输出 ${formatQuota(outputQuotaPer1k)}/1K (${formatUsd(outputUsdPer1m, 6)}/1M)`;
}

function formatModelStatus() {
  const item = currentPricing();
  const model = getCurrentModelName();
  if (!model) return '未选择模型。';
  if (!item) return model;

  const [group, ratio] = preferredGroupRatio();
  const type = Number(item.quota_type) === 1 ? '按次' : '按量';
  return `${item.model_name}（${type}，分组 ${group} x${ratio}）`;
}

function panelHtml() {
  const status = state.waitingForModel
    ? '<span class="newapi-key-info__muted">等待模型...</span>'
    : state.loadingPricing || state.loadingUsage
      ? '<span class="newapi-key-info__muted">加载中...</span>'
      : state.pricingError
        ? `<span class="newapi-key-info__error">${escapeHtml(state.pricingError)}</span>`
        : `<span class="newapi-key-info__muted">${escapeHtml(state.lastBaseUrl || '仅支持 new-api')}</span>`;

  return `
    <div class="newapi-key-info__row">
      <span class="newapi-key-info__title">New API 信息</span>
      <span class="newapi-key-info__actions">
        ${status}
        <button class="newapi-key-info__button menu_button" type="button" data-newapi-refresh>刷新</button>
      </span>
    </div>
    <div class="newapi-key-info__grid">
      <span class="newapi-key-info__label">模型</span>
      <span class="newapi-key-info__value">${escapeHtml(formatModelStatus())}</span>
      <span class="newapi-key-info__label">价格</span>
      <span class="newapi-key-info__value">${escapeHtml(formatModelPrice())}</span>
      <span class="newapi-key-info__label">余额</span>
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
