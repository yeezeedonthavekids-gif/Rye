// Rye's new tab page for the Chromium build. Plain JavaScript, no frameworks,
// so it opens instantly. Preferences live in chrome.storage and follow the
// same defaults as the original Rye: search and shortcuts on, everything else off.
'use strict';

const ext = typeof chrome !== 'undefined' && chrome.storage ? chrome : null;

const DEFAULTS = {
  background: { kind: 'theme' },
  showSearch: true,
  showShortcuts: true,
  showClock: false,
  showDate: false,
  showFrequent: false,
  shortcuts: [
    { id: 's1', title: 'Wikipedia', url: 'https://www.wikipedia.org' },
    { id: 's2', title: 'GitHub', url: 'https://github.com' },
    { id: 's3', title: 'YouTube', url: 'https://www.youtube.com' },
    { id: 's4', title: 'Hacker News', url: 'https://news.ycombinator.com' },
  ],
};

const COLORS = ['#1b1c1f', '#1d222b', '#26211d', '#efe9e1', '#e4e8ec'];
const GRADIENTS = [
  'linear-gradient(160deg, #e9e1d6 0%, #d9dde3 100%)',
  'linear-gradient(160deg, #1d2230 0%, #2d2a3a 100%)',
  'linear-gradient(160deg, #dfe8ea 0%, #e9e4f0 100%)',
  'linear-gradient(160deg, #2a2420 0%, #3a3128 100%)',
  'linear-gradient(160deg, #e6ece4 0%, #f1e9dc 100%)',
];

const $ = (id) => document.getElementById(id);
let prefs = structuredClone(DEFAULTS);
// The uploaded photo is kept apart from prefs so small pref writes stay cheap.
let bgImage = null;

async function load() {
  try {
    if (ext) {
      const got = await ext.storage.local.get(['prefs', 'bgImage']);
      if (got.prefs) prefs = { ...DEFAULTS, ...got.prefs };
      bgImage = got.bgImage || null;
    } else {
      const raw = localStorage.getItem('rye-prefs');
      if (raw) prefs = { ...DEFAULTS, ...JSON.parse(raw) };
      bgImage = localStorage.getItem('rye-bg');
    }
  } catch {
    prefs = structuredClone(DEFAULTS);
  }
}

function save() {
  try {
    if (ext) ext.storage.local.set({ prefs });
    else localStorage.setItem('rye-prefs', JSON.stringify(prefs));
  } catch {
    /* preferences are a convenience; never block the page */
  }
}

function update(patch) {
  prefs = { ...prefs, ...patch };
  save();
  render();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function faviconUrl(url) {
  if (ext && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`);
  }
  try {
    return `${new URL(url).origin}/favicon.ico`;
  } catch {
    return '';
  }
}

function looksLikeUrl(text) {
  const t = text.trim();
  if (!t || /\s/.test(t)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return true;
  if (/^localhost(:\d+)?(\/|$)/i.test(t)) return true;
  return /^[^/?#\s]+\.[a-z][a-z0-9-]{1,62}(:\d+)?([/?#].*)?$/i.test(t);
}

function normalizeUrl(text) {
  const t = text.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
}

function isDark(color) {
  const hex = (color.match(/#[0-9a-f]{6}/i) || ['#ffffff'])[0];
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

// ─── Rendering ──────────────────────────────────────────────────────────────

function renderBackground() {
  const bg = prefs.background || { kind: 'theme' };
  document.body.style.background = '';
  delete document.body.dataset.tone;
  if (bg.kind === 'color' || bg.kind === 'gradient') {
    document.body.style.background = bg.value;
    document.body.dataset.tone = isDark(bg.value) ? 'dark' : 'light';
  } else if (bg.kind === 'image' && bgImage) {
    const dim = (bg.dim ?? 25) / 100;
    document.body.style.background = `linear-gradient(rgba(0,0,0,${dim}), rgba(0,0,0,${dim})), url("${bgImage}") center / cover fixed`;
    document.body.dataset.tone = 'image';
  }
}

// Photos are resized to the screen and re-encoded, so a 20 MB camera file
// becomes a few hundred KB and the page still opens instantly.
async function chooseImage(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const bitmap = await createImageBitmap(file);
  const max = Math.min(3840, Math.round(Math.max(screen.width, screen.height) * devicePixelRatio));
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  bgImage = canvas.toDataURL('image/jpeg', 0.86);
  try {
    if (ext) await ext.storage.local.set({ bgImage });
    else localStorage.setItem('rye-bg', bgImage);
  } catch {
    /* too large for storage: still show it for this tab */
  }
  update({ background: { kind: 'image', dim: prefs.background?.dim ?? 25 } });
}

function renderClock() {
  const show = prefs.showClock || prefs.showDate;
  $('time').hidden = !show;
  if (!show) return;
  const now = new Date();
  $('clock').hidden = !prefs.showClock;
  $('date').hidden = !prefs.showDate;
  $('clock').textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  $('date').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

let dragId = null;

function renderShortcuts() {
  const grid = $('grid');
  grid.hidden = !prefs.showShortcuts;
  grid.replaceChildren();
  if (!prefs.showShortcuts) return;
  prefs.shortcuts.forEach((s, i) => {
    const img = el('img', { src: faviconUrl(s.url), alt: '' });
    const tile = el(
      'div',
      { class: 'tile', draggable: 'true', style: `animation-delay:${60 + i * 22}ms` },
      el('a', { href: s.url, title: s.url }, el('span', { class: 'tile-icon' }, img), el('span', { class: 'tile-title' }, s.title)),
      el('button', { class: 'tile-edit', type: 'button', 'aria-label': `Edit ${s.title}`, onclick: () => openEditor(s) }, '✎'),
    );
    tile.addEventListener('dragstart', (e) => {
      dragId = s.id;
      tile.dataset.dragging = 'true';
      e.dataTransfer.setData('text/uri-list', s.url);
    });
    tile.addEventListener('dragend', () => {
      dragId = null;
      tile.dataset.dragging = 'false';
    });
    tile.addEventListener('dragover', (e) => {
      if (!dragId || dragId === s.id) return;
      e.preventDefault();
      const list = [...prefs.shortcuts];
      const from = list.findIndex((x) => x.id === dragId);
      const to = list.findIndex((x) => x.id === s.id);
      list.splice(to, 0, list.splice(from, 1)[0]);
      update({ shortcuts: list });
    });
    grid.append(tile);
  });
  if (prefs.shortcuts.length < 24) {
    grid.append(
      el(
        'div',
        { class: 'tile' },
        el('button', { class: 'tile-add', type: 'button', onclick: () => openEditor(null) }, el('span', { class: 'tile-icon' }, '+'), el('span', { class: 'tile-title' }, 'Add')),
      ),
    );
  }
}

async function renderFrequent() {
  $('frequent').hidden = !prefs.showFrequent;
  if (!prefs.showFrequent || !ext?.topSites) return;
  const sites = (await chrome.topSites.get()).slice(0, 8);
  $('frequent-chips').replaceChildren(
    ...sites.map((s) => el('a', { class: 'chip', href: s.url, title: s.url }, el('img', { src: faviconUrl(s.url), alt: '' }), el('span', {}, s.title || s.url))),
  );
  $('frequent').hidden = sites.length === 0;
}

function renderPanel() {
  const bg = prefs.background || { kind: 'theme' };
  const swatches = [
    { kind: 'theme', style: 'background: linear-gradient(135deg, #22201e 50%, #2d2a28 50%)', title: 'Rye' },
    ...COLORS.map((c) => ({ kind: 'color', value: c, style: `background:${c}` })),
    ...GRADIENTS.map((g) => ({ kind: 'gradient', value: g, style: `background:${g}` })),
  ];
  const upload = el(
    'button',
    {
      class: 'swatch upload',
      type: 'button',
      title: 'Upload image',
      'aria-label': 'Upload image',
      'aria-pressed': String(bg.kind === 'image'),
      style: bgImage ? `background-image:url("${bgImage}")` : undefined,
      onclick: () => (bgImage && bg.kind !== 'image' ? update({ background: { kind: 'image', dim: bg.dim ?? 25 } }) : $('file').click()),
    },
    bgImage ? '' : '+',
  );
  $('swatches').replaceChildren(
    upload,
    ...swatches.map((s) =>
      el('button', {
        class: 'swatch',
        type: 'button',
        style: s.style,
        title: s.title || '',
        'aria-pressed': String(bg.kind === s.kind && (s.kind === 'theme' || bg.value === s.value)),
        onclick: () => update({ background: s.kind === 'theme' ? { kind: 'theme' } : { kind: s.kind, value: s.value } }),
      }),
    ),
  );
  $('image-row').hidden = bg.kind !== 'image';
  $('dim').value = String(bg.dim ?? 25);
  const toggles = [
    ['showSearch', 'Search box'],
    ['showShortcuts', 'Shortcuts'],
    ['showClock', 'Clock'],
    ['showDate', 'Date'],
    ['showFrequent', 'Most visited'],
  ];
  $('toggles').replaceChildren(
    ...toggles.map(([key, label]) =>
      el('div', { class: 'row' }, el('span', {}, label), el('button', { class: 'toggle', type: 'button', role: 'switch', 'aria-label': label, 'aria-checked': String(!!prefs[key]), onclick: () => update({ [key]: !prefs[key] }) })),
    ),
  );
}

function render() {
  renderBackground();
  renderClock();
  $('search').hidden = !prefs.showSearch;
  renderShortcuts();
  renderFrequent();
  if (!$('panel').hidden) renderPanel();
}

// ─── Shortcut editor ────────────────────────────────────────────────────────

let editing = null;

function openEditor(shortcut) {
  editing = shortcut;
  $('editor-title').textContent = shortcut ? 'Edit shortcut' : 'Add shortcut';
  $('ed-title').value = shortcut?.title ?? '';
  $('ed-url').value = shortcut?.url ?? '';
  $('ed-remove').hidden = !shortcut;
  $('editor').hidden = false;
  $(shortcut ? 'ed-title' : 'ed-url').focus();
}

function closeEditor() {
  $('editor').hidden = true;
  editing = null;
}

$('editor-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const raw = $('ed-url').value.trim();
  if (!raw) return;
  let url;
  try {
    url = new URL(normalizeUrl(raw)).toString();
  } catch {
    return;
  }
  const title = $('ed-title').value.trim() || new URL(url).hostname.replace(/^www\./, '');
  const item = { id: editing?.id ?? `s${Date.now().toString(36)}`, title, url };
  update({ shortcuts: editing ? prefs.shortcuts.map((s) => (s.id === editing.id ? item : s)) : [...prefs.shortcuts, item] });
  closeEditor();
});
$('ed-remove').addEventListener('click', () => {
  if (editing) update({ shortcuts: prefs.shortcuts.filter((s) => s.id !== editing.id) });
  closeEditor();
});
$('ed-cancel').addEventListener('click', closeEditor);
$('editor-close').addEventListener('click', closeEditor);
$('editor').addEventListener('mousedown', (e) => e.target === $('editor') && closeEditor());

// ─── Search, panel, keyboard ────────────────────────────────────────────────

$('search').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('q').value.trim();
  if (!text) return;
  if (looksLikeUrl(text)) {
    location.href = normalizeUrl(text);
  } else if (ext?.search) {
    chrome.search.query({ text, disposition: 'CURRENT_TAB' });
  } else {
    location.href = `https://duckduckgo.com/?q=${encodeURIComponent(text)}`;
  }
});

$('file').addEventListener('change', (e) => {
  chooseImage(e.target.files[0]);
  e.target.value = '';
});
$('change-image').addEventListener('click', () => $('file').click());
$('dim').addEventListener('input', (e) => update({ background: { kind: 'image', dim: Number(e.target.value) } }));
// Dropping a photo anywhere on the page sets it as the background.
document.addEventListener('dragover', (e) => {
  if ([...e.dataTransfer.items].some((i) => i.kind === 'file')) e.preventDefault();
});
document.addEventListener('drop', (e) => {
  const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
  if (!file) return;
  e.preventDefault();
  chooseImage(file);
});

$('customize').addEventListener('click', () => {
  const open = $('panel').hidden;
  $('panel').hidden = !open;
  $('customize').setAttribute('aria-expanded', String(open));
  if (open) renderPanel();
});
$('panel-close').addEventListener('click', () => {
  $('panel').hidden = true;
  $('customize').setAttribute('aria-expanded', 'false');
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('editor').hidden) closeEditor();
  else if (!$('panel').hidden) $('panel-close').click();
});

// Fall back to the site's first letter when a favicon can't load.
document.addEventListener(
  'error',
  (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    const href = img.closest('a')?.href || '';
    let letter = '•';
    try {
      letter = new URL(href).hostname.replace(/^www\./, '')[0] || '•';
    } catch {
      /* keep the dot */
    }
    img.replaceWith(el('span', { style: 'font-weight:650;color:var(--accent-text);text-transform:uppercase' }, letter));
  },
  true,
);

// The clock updates once a minute, on the minute — not every second.
function tick() {
  renderClock();
  setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
}

if (ext) {
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.bgImage) bgImage = changes.bgImage.newValue || null;
    if (changes.prefs) prefs = { ...DEFAULTS, ...changes.prefs.newValue };
    if (changes.prefs || changes.bgImage) render();
  });
}

load().then(() => {
  render();
  tick();
});
