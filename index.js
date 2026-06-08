const EXT_ID = 'newapi-key-info';
const PLUGIN_ENDPOINT = '/api/plugins/newapi-key-info/summary';
const SECRET_FIND_ENDPOINT = '/api/secrets/find';
const QUOTA_PER_USD = 500000;
const MODEL_WAIT_TIMEOUT_MS = 8000;
const CUSTOM_SECRET_KEY = 'api_key_custom';

const zh = {
  requestFailed: 'new-api 请求失败',
  noBaseUrl: '缺少自定义 API 地址。',
  noUsageData: '余额接口没有返回数据。',
  tauriHiddenKey: 'TauriTavern 默认禁止第三方前端插件读取隐藏密钥；余额需要打开 allowKeysExposure，或在输入框里临时显示完整 key。',
  browserNoKey: 'ST 已隐藏保存的密钥；余额查询需要页面中存在完整密钥。',
  serverUnavailable: 'ST 后端插件不可用',
  quota: '额度',
  loading: '正在加载...',
  clickRefresh: '点击连接或刷新。',
  unlimited: '无限额度',
  remaining: '剩余',
  about: '约',
  used: '已用',
  total: '总计',
  badUsageFields: '接口未返回可识别的余额字段。',
  waitModels: '正在等待模型列表...',
  noPrice: '当前模型没有价格信息。',
  badPrice: '价格未配置。',
  perRequest: '按次',
  metered: '按量',
  input: '输入',
  output: '输出',
  noModel: '未选择模型。',
  group: '分组',
  tauriMode: 'TauriTavern 单插件模式',
  serverMode: 'ST 后端插件模式',
  browserMode: '前端模式',
  onlyNewApi: '仅支持 new-api',
  waitingModelShort: '等待模型...',
  loadingShort: '加载中...',
  title: 'New API 信息',
  refresh: '刷新',
  model: '模型',
  price: '价格',
  balance: '余额',
  source: '来源',
  keyTail: '密钥尾号',
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
    '#api_key_custom',
    '#custom_openai_api_key',
    '#custom_api_key',
    '[name="api_key_custom"]',
    '[name="custom_openai_api_key"]',
    '[name="custom_api_key"]',
  ],
  model: [
    '#custom_model_id',
    '#model_custom_select',
    '.model_custom_select',
    '#custom_model',
    '[name="custom_model"]',
  ],
  profile: [
    '#connection_profiles',
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
  note: '',
};

function firstVisible(selectorList) {
  for (const selector of selectorList) {
    for (const el of document.querySelectorAll(selector)) {
      if (el instanceof HTMLElement && el.offsetParent !== null) return el;
    }
  }
  return null;
}

function firstElement(selectorList) {
  for (const selector of selectorList) {
    const el = document.querySelector(selector);
    if (el instanceof HTMLElement) return el;
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

function normalizeModelName(value) {
  const model = String(value || '').trim();
  return /^(none|null|undefined)$/i.test(model) ? '' : model;
}

function getContext() {
  try {
    return globalThis.SillyTavern?.getContext?.() || {};
  } catch {
    return {};
  }
}

function getChatCompletionSettings() {
  return getContext().chatCompletionSettings || globalThis.oai_settings || {};
}

function getExtensionSettings() {
  const context = getContext();
  return context.extensionSettings || globalThis.extension_settings || {};
}

function getRequestHeaders(contentType = true) {
  const context = getContext();
  const headers = context.getRequestHeaders?.()
    || globalThis.getRequestHeaders?.()
    || {};
  return contentType ? { ...headers, 'Content-Type': 'application/json' } : headers;
}

function isTauriTavernRuntime() {
  return globalThis.__TAURI_RUNNING__ === true
    || Boolean(globalThis.__TAURITAVERN__)
    || Boolean(globalThis.__TAURITAVERN_MAIN_READY__)
    || Boolean(globalThis.__TAURI_INTERNALS__)
    || typeof globalThis.__TAURI__?.core?.invoke === 'function';
}

function isCustomChatCompletion() {
  const contextSource = String(getChatCompletionSettings().chat_completion_source || '').toLowerCase();
  if (contextSource === 'custom') return true;

  const source = firstElement(selectors.source);
  if (!source) return !contextSource && Boolean(firstVisible(selectors.baseUrl));

  const value = getValue(source).toLowerCase();
  const text = selectedText(source).toLowerCase();
  if (value) return value === 'custom';
  if (contextSource) return false;
  return text.includes('custom') && text.includes('openai-compatible');
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

function getCustomBaseUrl() {
  const settings = getChatCompletionSettings();
  return normalizeNewApiBase(settings.custom_url || getValue(firstElement(selectors.baseUrl)) || '');
}

function looksLikeMaskedSecret(value) {
  const key = String(value || '').trim();
  if (!key) return true;
  return /^(\*+|hidden|saved)$/i.test(key)
    || /^sk-[*.]+$/i.test(key)
    || key.includes('****')
    || key.includes('••••');
}

function getVisibleApiKey() {
  const key = getValue(firstElement(selectors.apiKey));
  return looksLikeMaskedSecret(key) ? '' : key;
}

function getSelectedProfile() {
  const connectionManager = getExtensionSettings().connectionManager;
  const selectedId = getValue(firstElement(selectors.profile)) || connectionManager?.selectedProfile || '';
  const profiles = Array.isArray(connectionManager?.profiles) ? connectionManager.profiles : [];
  return profiles.find((profile) => profile.id === selectedId || profile.name === selectedId) || null;
}

function getActiveSecretId() {
  const profileSecretId = getSelectedProfile()?.['secret-id'];
  if (profileSecretId) return String(profileSecretId);

  const secretState = globalThis.secret_state || getContext().secretState || {};
  const customSecrets = secretState.api_key_custom;
  if (Array.isArray(customSecrets)) {
    return customSecrets.find((secret) => secret?.active)?.id || '';
  }

  return '';
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
  if (!response.ok) throw new Error(body.message || `${response.status} ${response.statusText}`);
  if (body.success === false || body.code === false) throw new Error(body.message || zh.requestFailed);
  return body;
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify(payload || {}),
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(body.message || body.error || `${response.status} ${response.statusText}`);
  return body;
}

async function findSavedCustomKey(secretId) {
  const payload = { key: CUSTOM_SECRET_KEY };
  if (secretId) payload.id = secretId;
  const body = await postJson(SECRET_FIND_ENDPOINT, payload);
  return String(body.value || '').trim();
}

async function fetchServerSummary(baseUrl, secretId) {
  return postJson(PLUGIN_ENDPOINT, { baseUrl, secretId });
}

async function refreshViaServerPlugin(baseUrl, secretId) {
  const result = await fetchServerSummary(baseUrl, secretId);
  state.mode = 'server';
  state.pricing = result.pricing || null;
  state.usage = result.usage || null;
  state.pricingError = result.errors?.pricing || '';
  state.usageError = result.errors?.usage || '';
  state.lastApiKeyTail = result.keyTail || '';

  if (!result.hasKey && !state.usageError) state.usageError = '后端插件没有读到 Custom API 密钥。';
  if (result.debug && !result.hasKey) state.note = summarizeBackendDebug(result.debug);
  if (result.hasKey && !state.usage && !state.usageError) state.usageError = zh.noUsageData;
}

async function refreshDirect(baseUrl, apiKey, mode, hiddenKeyMessage) {
  state.mode = mode;
  state.lastApiKeyTail = apiKey ? apiKey.slice(-6) : '';

  try {
    state.pricing = await fetchJson(`${baseUrl}/api/pricing`, apiKey);
  } catch (error) {
    state.pricingError = error?.message || String(error);
  }

  if (!apiKey) {
    state.usage = null;
    state.usageError = hiddenKeyMessage;
    return;
  }

  try {
    state.usage = await fetchJson(`${baseUrl}/api/usage/token`, apiKey);
  } catch (error) {
    state.usageError = error?.message || String(error);
  }
}

async function refreshViaTauriTavern(baseUrl, secretId) {
  let apiKey = getVisibleApiKey();
  let hiddenKeyMessage = zh.tauriHiddenKey;

  if (!apiKey) {
    try {
      apiKey = await findSavedCustomKey(secretId);
    } catch (error) {
      hiddenKeyMessage = `${zh.tauriHiddenKey}（${error?.message || String(error)}）`;
    }
  }

  await refreshDirect(baseUrl, apiKey, 'tauri', hiddenKeyMessage);
}

async function refreshViaBrowser(baseUrl) {
  await refreshDirect(baseUrl, getVisibleApiKey(), 'browser', zh.browserNoKey);
}

async function refresh() {
  const baseUrl = getCustomBaseUrl();
  const secretId = getActiveSecretId();

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
  state.note = '';
  state.lastBaseUrl = baseUrl;
  render();

  try {
    if (isTauriTavernRuntime()) {
      await refreshViaTauriTavern(baseUrl, secretId);
      return;
    }

    try {
      await refreshViaServerPlugin(baseUrl, secretId);
    } catch (serverError) {
      state.pricingError = '';
      state.note = `${zh.serverUnavailable}: ${serverError?.message || String(serverError)}`;
      await refreshViaBrowser(baseUrl);
      if (!state.usage) state.usageError += `（${state.note}）`;
    }
  } finally {
    state.loadingPricing = false;
    state.loadingUsage = false;
    render();
  }
}

function getCurrentModelName() {
  const settings = getChatCompletionSettings();
  const candidates = [
    settings.custom_model,
    getValue(document.querySelector('#custom_model_id')),
    getValue(document.querySelector('#model_custom_select')),
    selectedText(document.querySelector('#model_custom_select')),
  ];

  for (const selector of selectors.model) {
    for (const el of document.querySelectorAll(selector)) {
      if (!(el instanceof HTMLElement)) continue;
      if (el instanceof HTMLDataListElement || el.tagName === 'DATALIST') continue;
      candidates.push(getValue(el), selectedText(el));
    }
  }

  for (const candidate of candidates) {
    const model = normalizeModelName(candidate);
    if (model) return model;
  }
  return '';
}

function topLevelPricingSource() {
  const data = state.pricing?.data;
  return data && typeof data === 'object' ? data : state.pricing;
}

function pricingItems() {
  const data = state.pricing?.data;
  if (Array.isArray(data)) return data.map(normalizePricingItem);

  const source = topLevelPricingSource();
  if (!source || typeof source !== 'object') return [];

  const nested = source.models || source.prices || source.pricing;
  if (Array.isArray(nested)) return nested.map(normalizePricingItem);

  const modelRatios = source.model_ratio || source.modelRatio || {};
  const completionRatios = source.completion_ratio || source.completionRatio || {};
  const modelPrices = source.model_price || source.modelPrice || {};
  const quotaTypes = source.quota_type || source.quotaType || {};
  const names = new Set([
    ...Object.keys(modelRatios),
    ...Object.keys(completionRatios),
    ...Object.keys(modelPrices),
    ...Object.entries(source)
      .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
      .map(([key]) => key),
  ]);

  return [...names]
    .filter((name) => !['group_ratio', 'model_ratio', 'completion_ratio', 'model_price', 'quota_type'].includes(name))
    .map((modelName) => normalizePricingItem({
      model_name: modelName,
      model_ratio: modelRatios[modelName],
      completion_ratio: completionRatios[modelName],
      model_price: modelPrices[modelName],
      quota_type: quotaTypes[modelName],
      ...(source[modelName] && typeof source[modelName] === 'object' ? source[modelName] : {}),
    }));
}

function normalizePricingItem(item) {
  const source = item && typeof item === 'object' ? item : {};
  return {
    ...source,
    model_name: source.model_name || source.model || source.name || source.id || '',
    model_ratio: source.model_ratio ?? source.modelRatio ?? source.prompt_ratio ?? source.promptRatio,
    completion_ratio: source.completion_ratio ?? source.completionRatio ?? source.output_ratio ?? source.outputRatio ?? 1,
    model_price: source.model_price ?? source.modelPrice ?? source.price,
    quota_type: source.quota_type ?? source.quotaType ?? 0,
  };
}

function normalizeForCompare(value) {
  return String(value || '').trim().toLowerCase();
}

function currentPricing() {
  const model = getCurrentModelName();
  if (!model) return null;

  const items = pricingItems();
  const normalized = normalizeForCompare(model);
  return items.find((item) => item.model_name === model)
    || items.find((item) => normalizeForCompare(item.model_name) === normalized)
    || items.find((item) => normalizeForCompare(item.model_name).endsWith(`/${normalized}`))
    || items.find((item) => normalized.endsWith(`/${normalizeForCompare(item.model_name)}`))
    || null;
}

function groupRatios() {
  const source = topLevelPricingSource();
  const ratios = source?.group_ratio || source?.groupRatio;
  if (!ratios || typeof ratios !== 'object') return [['default', 1]];
  const entries = Object.entries(ratios)
    .map(([name, ratio]) => [name, Number(ratio)])
    .filter(([, ratio]) => Number.isFinite(ratio));
  return entries.length ? entries : [['default', 1]];
}

function preferredGroupRatio() {
  const ratios = groupRatios();
  return ratios.find(([name]) => ['default', 'standard'].includes(String(name).toLowerCase()))
    || ratios[0]
    || ['default', 1];
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
    if (!Number.isFinite(price)) return zh.badPrice;
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
  if (state.mode === 'tauri') return zh.tauriMode;
  if (state.mode === 'server') return zh.serverMode;
  if (state.mode === 'browser') return zh.browserMode;
  return zh.onlyNewApi;
}

function summarizeBackendDebug(debug) {
  const custom = Array.isArray(debug.candidates)
    ? debug.candidates.find((candidate) => candidate.key === CUSTOM_SECRET_KEY)
    : null;
  const parts = [];
  if (debug.userHandle) parts.push(`用户 ${debug.userHandle}`);
  parts.push(`secrets.json ${debug.secretFileExists ? '存在' : '不存在'}`);
  if (custom) parts.push(`${CUSTOM_SECRET_KEY}: ${custom.type}, ${custom.count || 0} 个`);
  if (debug.helperError) parts.push(`helper: ${debug.helperError}`);
  return parts.join('；');
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
  const noteRow = state.note
    ? `<span class="newapi-key-info__label">诊断</span><span class="newapi-key-info__value newapi-key-info__muted">${escapeHtml(state.note)}</span>`
    : '';

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
      ${noteRow}
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
  const key = firstElement(selectors.apiKey);
  if (key) return key.closest('.flex-container, .wide100p, .inline-drawer-content, label, div') || key;

  const baseUrl = firstElement(selectors.baseUrl);
  if (baseUrl) return baseUrl.closest('.flex-container, .wide100p, .inline-drawer-content, label, div') || baseUrl;

  return document.querySelector('#custom_form, #openai_api, #APIBlock, #api_settings, #connection_profiles, .api_settings') || null;
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
    if (event.target?.closest?.('[data-newapi-refresh]')) refresh();
  });
  return panel;
}

function render() {
  const panel = ensurePanel();
  if (!panel) return;
  panel.innerHTML = panelHtml();
  maybeAutoRefresh();
}

function scheduleRender() {
  clearTimeout(scheduleRender.timer);
  scheduleRender.timer = setTimeout(render, 150);
}

scheduleRender.timer = null;

function clearRemoteData() {
  state.pricing = null;
  state.usage = null;
  state.lastApiKeyTail = '';
  state.lastBaseUrl = '';
  state.mode = '';
  state.pricingError = '';
  state.usageError = '';
  state.note = '';
}

function scheduleDataReset() {
  clearRemoteData();
  scheduleRender();
}

function hasRemoteResultOrError() {
  return Boolean(state.pricing || state.usage || state.pricingError || state.usageError);
}

function scheduleAutoRefresh(delay = 600) {
  clearTimeout(scheduleAutoRefresh.timer);
  scheduleAutoRefresh.timer = setTimeout(() => {
    if (state.loadingPricing || state.loadingUsage || hasRemoteResultOrError()) return;
    if (!isCustomChatCompletion() || !getCustomBaseUrl()) return;
    refresh();
  }, delay);
}

scheduleAutoRefresh.timer = null;

function maybeAutoRefresh() {
  if (state.loadingPricing || state.loadingUsage || hasRemoteResultOrError()) return;
  if (!isCustomChatCompletion() || !getCustomBaseUrl()) return;
  scheduleAutoRefresh();
}

function waitForModel(timeoutMs = MODEL_WAIT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tick = () => {
      if (getCurrentModelName()) return resolve(true);
      if (Date.now() >= deadline) return resolve(false);
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

function matchesAny(target, selectorList) {
  return target instanceof Element && target.matches(selectorList.join(','));
}

function bindLiveRefresh() {
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const clickedConnect = selectors.connect.some((selector) => target.closest(selector));
    const textLooksLikeConnect = /^(connect|连接|連接)$/i.test(String(target.textContent || '').trim());
    if (clickedConnect || textLooksLikeConnect) setTimeout(refreshAfterConnect, 500);
  });

  document.addEventListener('change', (event) => {
    const target = event.target;
    if (matchesAny(target, selectors.model)) {
      scheduleRender();
      if (!state.pricing) scheduleDataReset();
    }
    if (matchesAny(target, [...selectors.source, ...selectors.baseUrl, ...selectors.profile])) scheduleDataReset();
    if (matchesAny(target, selectors.apiKey)) scheduleRender();
  });

  document.addEventListener('input', (event) => {
    const target = event.target;
    if (matchesAny(target, selectors.model)) {
      scheduleRender();
      if (!state.pricing) scheduleDataReset();
    }
    if (matchesAny(target, selectors.baseUrl)) scheduleDataReset();
    if (matchesAny(target, selectors.apiKey)) scheduleRender();
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
