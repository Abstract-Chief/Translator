// ===== STATE =====
const state = {
  srcLang: 'auto',
  tgtLang: 'ru',
  srcText: '',
  tgtText: '',
  aiMode: false,
  translateTimer: null,
};

const LANGS = [
  { code: 'auto', name: 'Определить язык' },
  { code: 'sk',   name: 'Словацкий' },
  { code: 'ru',   name: 'Русский' },
  { code: 'uk',   name: 'Украинский' },
  { code: 'en',   name: 'Английский' },
  { code: 'de',   name: 'Немецкий' },
  { code: 'fr',   name: 'Французский' },
  { code: 'es',   name: 'Испанский' },
  { code: 'it',   name: 'Итальянский' },
  { code: 'pl',   name: 'Польский' },
  { code: 'cs',   name: 'Чешский' },
  { code: 'hu',   name: 'Венгерский' },
  { code: 'ro',   name: 'Румынский' },
  { code: 'bg',   name: 'Болгарский' },
  { code: 'hr',   name: 'Хорватский' },
  { code: 'nl',   name: 'Нидерландский' },
  { code: 'pt',   name: 'Португальский' },
  { code: 'ja',   name: 'Японский' },
  { code: 'zh',   name: 'Китайский' },
  { code: 'ko',   name: 'Корейский' },
  { code: 'ar',   name: 'Арабский' },
  { code: 'tr',   name: 'Турецкий' },
  { code: 'fi',   name: 'Финский' },
  { code: 'sv',   name: 'Шведский' },
  { code: 'no',   name: 'Норвежский' },
  { code: 'da',   name: 'Датский' },
  { code: 'el',   name: 'Греческий' },
  { code: 'he',   name: 'Иврит' },
  { code: 'hi',   name: 'Хинди' },
];

// Langs for quick buttons (no 'auto' on target side)
const SRC_QUICK = ['auto', 'sk', 'ru', 'uk'];
const TGT_QUICK = ['ru', 'sk', 'uk'];

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  buildDropdown('src-lang-list', true);
  buildDropdown('tgt-lang-list', false);

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.lang-selector')) {
      closeAllDropdowns();
    }
  });
});

function buildDropdown(listId, isSrc) {
  const ul = document.getElementById(listId);
  ul.innerHTML = '';
  const langs = isSrc ? LANGS : LANGS.filter(l => l.code !== 'auto');
  langs.forEach(lang => {
    const li = document.createElement('li');
    li.textContent = lang.name;
    li.dataset.code = lang.code;
    li.addEventListener('click', () => {
      if (isSrc) selectSrcLangByCode(lang.code);
      else selectTgtLangByCode(lang.code);
      closeAllDropdowns();
    });
    ul.appendChild(li);
  });
}

function filterLangs(dropdownId, query) {
  const dropdown = document.getElementById(dropdownId);
  const items = dropdown.querySelectorAll('.lang-list li');
  const q = query.toLowerCase();
  items.forEach(li => {
    li.style.display = li.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

// ===== LANGUAGE SELECT =====
function selectSrcLang(btn, code) {
  state.srcLang = code;
  document.querySelectorAll('.src-selector .lang-btn').forEach(b => b.classList.remove('lang-active'));
  btn.classList.add('lang-active');
  // swap btn disabled if auto
  document.getElementById('swap-btn').classList.toggle('disabled', code === 'auto');
  translateIfReady();
}

function selectSrcLangByCode(code) {
  state.srcLang = code;
  const btns = document.querySelectorAll('.src-selector .lang-btn[data-lang]');
  btns.forEach(b => b.classList.remove('lang-active'));
  const match = [...btns].find(b => b.dataset.lang === code);
  if (match) match.classList.add('lang-active');
  document.getElementById('swap-btn').classList.toggle('disabled', code === 'auto');
  translateIfReady();
}

function selectTgtLang(btn, code) {
  state.tgtLang = code;
  document.querySelectorAll('.tgt-selector .lang-btn').forEach(b => b.classList.remove('lang-active'));
  btn.classList.add('lang-active');
  translateIfReady();
}

function selectTgtLangByCode(code) {
  state.tgtLang = code;
  const btns = document.querySelectorAll('.tgt-selector .lang-btn[data-lang]');
  btns.forEach(b => b.classList.remove('lang-active'));
  const match = [...btns].find(b => b.dataset.lang === code);
  if (match) match.classList.add('lang-active');
  translateIfReady();
}

// ===== DROPDOWNS =====
function toggleSrcDropdown(e) {
  e.stopPropagation();
  const dd = document.getElementById('src-dropdown');
  const isOpen = dd.classList.contains('open');
  closeAllDropdowns();
  if (!isOpen) dd.classList.add('open');
}

function toggleTgtDropdown(e) {
  e.stopPropagation();
  const dd = document.getElementById('tgt-dropdown');
  const isOpen = dd.classList.contains('open');
  closeAllDropdowns();
  if (!isOpen) dd.classList.add('open');
}

function closeAllDropdowns() {
  document.querySelectorAll('.lang-dropdown').forEach(d => d.classList.remove('open'));
}

// ===== SWAP =====
function swapLanguages() {
  if (state.srcLang === 'auto') return;
  const tmp = state.srcLang;
  state.srcLang = state.tgtLang;
  state.tgtLang = tmp;

  // swap textarea content
  const srcEl = document.getElementById('src-text');
  const tgtEl = document.getElementById('tgt-text');
  const tgtTextContent = tgtEl.textContent;
  srcEl.value = tgtTextContent;
  tgtEl.textContent = '';

  selectSrcLangByCode(state.srcLang);
  selectTgtLangByCode(state.tgtLang);
  onInput();
}

// ===== INPUT =====
function onInput() {
  const srcEl = document.getElementById('src-text');
  const text = srcEl.value;
  state.srcText = text;

  const count = text.length;
  document.getElementById('char-count').textContent = `${count} / 5000`;
  document.getElementById('clear-btn').style.display = count > 0 ? 'flex' : 'none';

  if (!text.trim()) {
    document.getElementById('tgt-text').textContent = '';
    setLoading(false);
    return;
  }

  // debounce
  clearTimeout(state.translateTimer);
  state.translateTimer = setTimeout(() => {
    doTranslate();
  }, 500);
}

function clearInput() {
  document.getElementById('src-text').value = '';
  document.getElementById('tgt-text').textContent = '';
  document.getElementById('char-count').textContent = '0 / 5000';
  document.getElementById('clear-btn').style.display = 'none';
  state.srcText = '';
  state.tgtText = '';
  state.aiMode = false;
  updateAiBtn();
  setLoading(false);
}

// ===== TRANSLATE =====
function translateIfReady() {
  if (state.srcText.trim()) doTranslate();
}

async function doTranslate() {
  const text = document.getElementById('src-text').value.trim();
  if (!text) return;

  setLoading(true);
  try {
    const resp = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, src: state.srcLang, tgt: state.tgtLang }),
    });
    const data = await resp.json();
    state.tgtText = data.translation || '';
    document.getElementById('tgt-text').textContent = state.tgtText;
    state.aiMode = false;
    updateAiBtn();
  } catch (err) {
    document.getElementById('tgt-text').textContent = 'Ошибка перевода';
  } finally {
    setLoading(false);
  }
}

// ===== AI =====
async function askAI() {
  const text = document.getElementById('src-text').value.trim();
  if (!text) return;

  const btn = document.getElementById('ai-btn');
  btn.classList.add('loading');
  btn.disabled = true;
  setLoading(true);

  try {
    const resp = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, src: state.srcLang, tgt: state.tgtLang }),
    });
    const data = await resp.json();
    state.tgtText = data.answer || '';
    document.getElementById('tgt-text').textContent = state.tgtText;
    state.aiMode = true;
    updateAiBtn();
  } catch (err) {
    document.getElementById('tgt-text').textContent = 'Ошибка AI';
  } finally {
    setLoading(false);
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

function updateAiBtn() {
  const btn = document.getElementById('ai-btn');
  if (state.aiMode) {
    btn.classList.add('ai-active');
  } else {
    btn.classList.remove('ai-active');
  }
}

// ===== HELPERS =====
function setLoading(on) {
  document.getElementById('tgt-loading').style.display = on ? 'block' : 'none';
  if (on) document.getElementById('tgt-text').textContent = '';
}

/*function speakSrc() {
  const text = document.getElementById('src-text').value;
  if (!text) return;
  const lang = state.srcLang === 'auto' ? 'ru' : state.srcLang;
  speak(text, lang);
}*/

/*function speakTgt() {
  if (!state.tgtText) return;
  speak(state.tgtText, state.tgtLang);
}*/



function speak(text, lang) {
  if (!window.speechSynthesis) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  speechSynthesis.speak(utter);
}

function copySrc() {
  const text = document.getElementById('src-text').value;
  copyToClipboard(text, document.querySelector('.src-footer .copy-btn'));
}

function copyTgt() {
  copyToClipboard(state.tgtText, document.querySelector('.tgt-footer .copy-btn'));
}

function copyToClipboard(text, btn) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    if (btn) {
      btn.classList.add('copy-success');
      setTimeout(() => btn.classList.remove('copy-success'), 2000);
    }
  });
}

// ===== SETTINGS =====
async function openSettings() {
  try {
    const resp = await fetch('/api/settings');
    if (resp.status === 401) { window.location.href = '/login'; return; }
    const data = await resp.json();
    const statusEl = document.getElementById('api-key-status');
    statusEl.textContent = data.has_key
      ? `Текущий ключ: ${data.key_preview}`
      : 'Ключ не задан';
  } catch {
    document.getElementById('api-key-status').textContent = '';
  }
  document.getElementById('api-key-input').value = '';
  document.getElementById('settings-overlay').classList.add('active');
  document.getElementById('settings-modal').classList.add('active');
}

function closeSettings() {
  document.getElementById('settings-overlay').classList.remove('active');
  document.getElementById('settings-modal').classList.remove('active');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSettings();
});

async function saveSettings() {
  const key = document.getElementById('api-key-input').value.trim();
  if (!key) return;
  const btn = document.querySelector('.settings-save-btn');
  btn.disabled = true;
  btn.textContent = 'Сохраняем...';
  try {
    const resp = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key }),
    });
    const data = await resp.json();
    if (data.ok) {
      closeSettings();
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Сохранить';
  }
}

// ===== LOGOUT =====
async function doLogout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login';
}
