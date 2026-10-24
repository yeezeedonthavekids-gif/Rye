// Rye's new tab page. All settings come from core.js (window.Rye).
'use strict';

(() => {
  const R = window.Rye;
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const preview = new URLSearchParams(location.search).has('preview');
  if (preview) root.dataset.preview = 'true';

  let state = R.defaultState();
  let profile = R.activeProfile(state);
  let bgImage = null;
  let activeGroup = 'all';
  const undoStack = [];

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'style') node.style.cssText = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
    return node;
  }

  const clone = (v) => JSON.parse(JSON.stringify(v));

  // ─── State changes ────────────────────────────────────────────────────────

  // Applies a change, saves it, and updates the browser. `undo` shows a toast
  // that restores the previous state.
  async function commit(mutate, { undo = null } = {}) {
    const before = clone(state);
    const next = clone(state);
    mutate(next, R.activeProfile(next));
    state = R.sanitizeState(next);
    profile = R.activeProfile(state);
    if (undo) {
      undoStack.push(before);
      if (undoStack.length > 30) undoStack.shift();
      toast(undo, 'Undo', undoLast);
    }
    render();
    await R.save(state);
    R.applyToBrowser(profile);
  }

  async function undoLast() {
    const prev = undoStack.pop();
    if (!prev) return;
    state = R.sanitizeState(prev);
    profile = R.activeProfile(state);
    bgImage = await R.getImage(profile.id);
    render();
    await R.save(state);
    R.applyToBrowser(profile);
    hideToast();
  }

  let toastTimer = 0;
  function toast(text, action, onAction) {
    const t = $('toast');
    t.replaceChildren(el('span', {}, text), action ? el('button', { class: 'btn', type: 'button', onclick: onAction }, action) : null);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 5000);
  }
  function hideToast() {
    $('toast').hidden = true;
  }

  // ─── Rendering ────────────────────────────────────────────────────────────

  function render() {
    R.applyTokens(root, profile);
    renderBackground();
    renderTextColor();
    const stage = $('stage');
    stage.dataset.placement = profile.layout.placement;
    stage.dataset.position = profile.layout.searchPosition;
    stage.dataset.width = profile.layout.searchWidth;
    stage.dataset.spacing = profile.layout.spacing;
    stage.dataset.style = profile.layout.style;
    renderGreeting();
    renderTime();
    renderSearch();
    renderNote();
    renderGroups();
    renderShortcuts();
    renderLists();
    renderProfileChip();
    if (!$('panel').hidden) renderPanel();
  }

  function renderBackground() {
    const body = document.body;
    const bg = profile.background;
    body.style.background = '';
    delete body.dataset.tone;
    if (bg.kind === 'color') {
      body.style.background = bg.value;
      body.dataset.tone = luminanceOf(bg.value) < 0.3 ? 'dark' : 'light';
    } else if (bg.kind === 'gallery') {
      const item = R.GALLERY.find((g) => g.id === bg.value);
      if (item) {
        body.style.background = `${item.css} center / cover fixed`;
        body.dataset.tone = item.tone;
      }
    } else if (bg.kind === 'image' && bgImage) {
      const dim = bg.dim / 100;
      body.style.background = `linear-gradient(rgba(0,0,0,${dim}), rgba(0,0,0,${dim})), url("${bgImage}") center / cover fixed`;
      body.dataset.tone = 'image';
    }
  }

  function renderTextColor() {
    const color = profile.look.text;
    for (const node of [$('stage'), $('corner-actions')]) {
      if (color) {
        node.dataset.customText = '';
        node.style.setProperty('--custom-text', color);
      } else {
        delete node.dataset.customText;
        node.style.removeProperty('--custom-text');
      }
    }
  }

  // Text color swatches, shared by the Customize panel.
  function textSwatches() {
    const current = profile.look.text;
    const set = (value, label) => commit((st, pr) => (pr.look.text = value), { undo: `Text color: ${label}` });
    const picker = el('input', { type: 'color', value: current || '#f4efe6', 'aria-label': 'Custom text color' });
    picker.addEventListener('change', () => set(picker.value, 'custom'));
    return el(
      'div',
      { class: 'swatch-row' },
      el('button', { class: 'swatch text-swatch auto', type: 'button', title: 'Automatic: follows your look and background', 'aria-label': 'Automatic text color', 'aria-pressed': String(!current), onclick: () => set('', 'automatic') }, 'A'),
      ...R.TEXT_COLORS.map((c) =>
        el('button', { class: 'swatch', type: 'button', title: c.name, 'aria-label': c.name, style: `background:${c.value}`, 'aria-pressed': String(current === c.value), onclick: () => set(c.value, c.name.toLowerCase()) }),
      ),
      el('span', { class: 'swatch custom color-input', title: 'Custom text color', 'aria-pressed': String(!!current && !R.TEXT_COLORS.some((c) => c.value === current)) }, picker),
    );
  }

  function luminanceOf(hex) {
    const n = parseInt(hex.slice(1), 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  }

  // A greeting is picked once per new tab, so redraws don't change it.
  let greetingParts;
  let greetingKey = '';
  function renderGreeting() {
    const key = JSON.stringify([profile.id, profile.identity, profile.show.greeting]);
    if (key !== greetingKey) {
      greetingKey = key;
      greetingParts = R.greeting(profile, { remember: !preview });
    }
    $('hello').hidden = !greetingParts;
    if (!greetingParts) return;
    $('hello-line').replaceChildren(...greetingParts.map((p) => (p.name ? el('span', { class: 'hello-name' }, p.text) : p.text)));
  }

  function renderTime() {
    const { clock, date } = profile.show;
    $('time').hidden = !(clock || date);
    if (!(clock || date)) return;
    const now = new Date();
    const parts = [];
    if (date) parts.push(now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }));
    if (clock) parts.push(now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    $('time').textContent = parts.join('   ·   ');
  }

  function renderSearch() {
    $('search').hidden = !profile.show.search;
    const engine = R.ENGINES[profile.search.engine];
    $('q').placeholder = engine.url ? `Search ${engine.name} or enter an address` : 'Search or enter an address';
    $('search-engine').textContent = engine.url ? engine.name : '';
  }

  function renderNote() {
    $('note').hidden = !profile.show.note;
    const input = $('note-input');
    if (document.activeElement !== input) input.value = profile.note;
  }

  function renderGroups() {
    const groups = profile.groups;
    if (!groups.some((g) => g.id === activeGroup)) activeGroup = 'all';
    $('groups').hidden = !profile.show.shortcuts || groups.length === 0;
    const chip = (id, name) =>
      el('button', { class: 'group-chip', type: 'button', 'aria-pressed': String(activeGroup === id), onclick: () => ((activeGroup = id), renderGroups(), renderShortcuts()) }, name);
    $('groups').replaceChildren(chip('all', 'All'), ...groups.map((g) => chip(g.id, g.name)));
  }

  // An icon container that tries each source in turn, then falls back to a
  // colored letter. Every site gets something recognizable.
  // Which icon address worked for each site, remembered between new tabs so
  // each one doesn't repeat requests that failed before.
  const ICON_MEMO = 'rye.iconMemo';
  let iconMemo = {};
  try {
    iconMemo = JSON.parse(localStorage.getItem(ICON_MEMO) || '{}');
  } catch {
    iconMemo = {};
  }
  function rememberIcon(url, value) {
    if (iconMemo[url] === value) return;
    iconMemo[url] = value;
    const keys = Object.keys(iconMemo);
    if (keys.length > 200) delete iconMemo[keys[0]];
    try {
      localStorage.setItem(ICON_MEMO, JSON.stringify(iconMemo));
    } catch {
      /* a convenience only */
    }
  }

  function iconNode(shortcut) {
    const box = el('span', { class: 'tile-icon', style: `--site:${R.siteColor(shortcut)}` });
    let sources = R.iconSources(shortcut);
    const memo = shortcut.icon ? undefined : iconMemo[shortcut.url];
    // A site with no icon is retried after a few days, in case it was offline.
    if (typeof memo === 'string' && memo.startsWith('letter:') && Date.now() - Number(memo.slice(7)) < 3 * 864e5) sources = [];
    else if (typeof memo === 'string' && sources.includes(memo)) sources = [memo, ...sources.filter((x) => x !== memo)];
    const letter = () => {
      if (!shortcut.icon && !preview && sources.length) rememberIcon(shortcut.url, `letter:${Date.now()}`);
      box.classList.add('lettered');
      const name = shortcut.title || R.hostOf(shortcut.url) || '?';
      box.replaceChildren(el('span', { class: 'letter' }, name.trim()[0]?.toUpperCase() || '•'));
    };
    const tryNext = (i) => {
      if (i >= sources.length) return letter();
      const img = el('img', { alt: '', decoding: 'async', referrerpolicy: 'no-referrer' });
      img.addEventListener('load', () => {
        // Large bitmaps (custom images, touch icons) fill the container;
        // vector marks and small favicons sit inside it.
        const vector = /\.svg$/i.test(sources[i]) || sources[i].startsWith('data:image/svg');
        if (!vector && (shortcut.icon || img.naturalWidth >= 96)) img.classList.add('full');
        if (img.naturalWidth <= 1) return tryNext(i + 1);
        if (!shortcut.icon && !preview) rememberIcon(shortcut.url, sources[i]);
      });
      img.addEventListener('error', () => tryNext(i + 1), { once: true });
      img.src = sources[i];
      box.replaceChildren(img);
    };
    tryNext(0);
    return box;
  }

  let dragId = null;

  function renderShortcuts() {
    const grid = $('shortcuts');
    grid.hidden = !profile.show.shortcuts;
    grid.dataset.style = profile.layout.shortcutStyle;
    if (!profile.show.shortcuts) return;
    const visible = profile.shortcuts.filter((s) => activeGroup === 'all' || s.group === activeGroup);
    grid.replaceChildren(
      ...visible.map((s) => {
        const tile = el(
          'div',
          { class: 'tile', draggable: preview ? null : 'true', 'data-id': s.id },
          el('a', { class: 'tile-link', href: s.url, title: `${s.title}\n${s.url}` }, iconNode(s), el('span', { class: 'tile-title' }, s.title)),
          el(
            'button',
            { class: 'tile-edit', type: 'button', 'aria-label': `Edit ${s.title}`, onclick: () => openEditor(s) },
            el('span', { 'aria-hidden': 'true', style: 'font-size:11px' }, '✎'),
          ),
        );
        tile.addEventListener('dragstart', (e) => {
          dragId = s.id;
          tile.dataset.dragging = 'true';
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/uri-list', s.url);
        });
        tile.addEventListener('dragend', () => {
          if (dragId) commit((st, p) => (p.shortcuts = profile.shortcuts));
          dragId = null;
        });
        tile.addEventListener('dragover', (e) => {
          if (!dragId || dragId === s.id) return;
          e.preventDefault();
          // Reorder live while dragging; saved on drop.
          const list = profile.shortcuts;
          const from = list.findIndex((x) => x.id === dragId);
          const to = list.findIndex((x) => x.id === s.id);
          list.splice(to, 0, list.splice(from, 1)[0]);
          renderShortcuts();
        });
        return tile;
      }),
    );
    if (profile.shortcuts.length < 40 && !preview) {
      grid.append(
        el(
          'div',
          { class: 'tile' },
          el(
            'button',
            { class: 'tile-link tile-add', type: 'button', onclick: () => openEditor(null) },
            el(
              'span',
              { class: 'tile-icon' },
              el('svg', {}),
            ),
            el('span', { class: 'tile-title' }, 'Add'),
          ),
        ),
      );
      grid.lastChild.querySelector('.tile-icon').innerHTML =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
    }
  }

  // Arrow keys move between shortcuts.
  $('shortcuts').addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    const links = [...$('shortcuts').querySelectorAll('.tile-link')];
    const i = links.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const next = { ArrowLeft: i - 1, ArrowUp: i - 1, ArrowRight: i + 1, ArrowDown: i + 1, Home: 0, End: links.length - 1 }[e.key];
    links[Math.max(0, Math.min(links.length - 1, next))].focus();
  });

  const favicon = (url) =>
    typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`)
      : '';

  async function renderLists() {
    const { bookmarks, recent, frequent } = profile.show;
    $('lists').hidden = !(bookmarks || recent || frequent);
    const fill = async (id, show, fetch) => {
      const box = $(id);
      box.hidden = !show;
      if (!show) return;
      let items = [];
      try {
        items = (await fetch()) || [];
      } catch {
        items = null;
      }
      const ul = box.querySelector('ul');
      if (!items) {
        ul.replaceChildren(el('li', { class: 'empty' }, 'Not available here.'));
        return;
      }
      if (!items.length) {
        ul.replaceChildren(el('li', { class: 'empty' }, 'Nothing yet.'));
        return;
      }
      ul.replaceChildren(
        ...items.map((it) =>
          el('li', {}, el('a', { href: it.url, title: it.url }, favicon(it.url) ? el('img', { src: favicon(it.url), alt: '' }) : el('i', { class: 'dot', style: `background:${R.siteColor({ url: it.url, title: it.title || '' })}` }), el('span', {}, it.title || R.hostOf(it.url)))),
        ),
      );
    };
    const api = typeof chrome !== 'undefined' ? chrome : {};
    await Promise.all([
      fill('list-bookmarks', bookmarks, async () => {
        if (!api.bookmarks) return null;
        const bar = await api.bookmarks.getChildren('1');
        return bar.filter((b) => b.url && R.safeUrl(b.url)).slice(0, 7);
      }),
      fill('list-recent', recent, async () => {
        if (!api.history) return null;
        const seen = new Set();
        const items = await api.history.search({ text: '', maxResults: 40, startTime: Date.now() - 14 * 864e5 });
        return items
          .filter((h) => R.safeUrl(h.url) && !seen.has(R.hostOf(h.url)) && seen.add(R.hostOf(h.url)))
          .slice(0, 7);
      }),
      fill('list-frequent', frequent, async () => {
        if (!api.topSites) return null;
        return (await api.topSites.get()).filter((t) => R.safeUrl(t.url)).slice(0, 7);
      }),
    ]);
  }

  function renderProfileChip() {
    const multiple = state.profiles.length > 1;
    $('profile-btn').hidden = !multiple;
    $('profile-avatar').textContent = (profile.identity.name || profile.label).trim()[0]?.toUpperCase() || '·';
    $('profile-label').textContent = profile.label;
  }

  // ─── Mini previews ────────────────────────────────────────────────────────

  function mini(look, dark) {
    const p = R.palette(look, dark);
    return el(
      'span',
      { class: 'mini', style: `--m-frame:${p.frame};--m-base:${p.base};--m-sheet:${p.sheet};--m-omni:${p.sunken};--m-accent:${p.accent};--m-text:${p.text}` },
      el('span', { class: 'mini-tabs' }, el('i', { class: 'mini-tab' }), el('i', { class: 'mini-tab off' })),
      el('span', { class: 'mini-wrap' }, el('span', { class: 'mini-bar' }, el('i', { class: 'mini-omni' })), el('span', { class: 'mini-page' }, el('i', { class: 'mini-hello' }), el('i', { class: 'mini-search' }), el('span', { class: 'mini-dots' }, el('i'), el('i'), el('i')))),
    );
  }

  const presetDark = (id) => {
    const scheme = R.PRESETS[id].scheme;
    return scheme === 'system' ? R.isDark(profile.look) : scheme === 'dark';
  };

  // ─── Customize panel ──────────────────────────────────────────────────────

  function section(title, ...content) {
    return el('div', { class: 'panel-section' }, el('h3', {}, title), ...content);
  }

  function segmented(options, value, onPick, label) {
    return el(
      'div',
      { class: 'segmented', role: 'group', 'aria-label': label },
      ...options.map(([v, text]) => el('button', { type: 'button', 'aria-pressed': String(value === v), onclick: () => onPick(v) }, text)),
    );
  }

  function toggleRow(label, checked, onToggle) {
    return el(
      'div',
      { class: 'row' },
      el('span', {}, label),
      el('button', { class: 'toggle', type: 'button', role: 'switch', 'aria-label': label, 'aria-checked': String(checked), onclick: onToggle }),
    );
  }

  function renderPanel() {
    const look = profile.look;
    const bg = profile.background;
    const presetName = R.PRESETS[look.preset].name;

    const presets = el(
      'div',
      { class: 'preset-row' },
      ...Object.entries(R.PRESETS).map(([id, p]) =>
        el(
          'button',
          {
            class: 'preset-chip',
            type: 'button',
            'aria-pressed': String(look.preset === id),
            title: p.note,
            onclick: () =>
              commit(
                (st, pr) => {
                  pr.look.preset = id;
                  pr.look.scheme = p.scheme;
                  if (pr.look.accentMode === 'mono') pr.look.accentMode = 'preset';
                },
                { undo: `${p.name} look applied` },
              ),
          },
          mini({ ...look, preset: id, accentMode: look.accentMode === 'custom' ? 'custom' : 'preset', scheme: p.scheme }, presetDark(id)),
          el('span', {}, p.name),
        ),
      ),
    );

    const accentSwatches = el(
      'div',
      { class: 'swatch-row' },
      el('button', {
        class: 'swatch',
        type: 'button',
        title: `${presetName} accent`,
        'aria-label': `${presetName} accent`,
        style: `background:${R.palette({ ...look, accentMode: 'preset' }).accent}`,
        'aria-pressed': String(look.accentMode === 'preset'),
        onclick: () => commit((st, pr) => (pr.look.accentMode = 'preset'), { undo: 'Accent changed' }),
      }),
      ...R.ACCENTS.map((a) =>
        el('button', {
          class: 'swatch',
          type: 'button',
          title: a.name,
          'aria-label': a.name,
          style: `background:${a.value}`,
          'aria-pressed': String(look.accentMode === 'custom' && look.accent === a.value),
          onclick: () => commit((st, pr) => Object.assign(pr.look, { accentMode: 'custom', accent: a.value }), { undo: `${a.name} accent` }),
        }),
      ),
      (() => {
        const custom = look.accentMode === 'custom' && !R.ACCENTS.some((a) => a.value === look.accent);
        const input = el('input', { type: 'color', value: look.accent, 'aria-label': 'Custom accent color' });
        input.addEventListener('change', () => commit((st, pr) => Object.assign(pr.look, { accentMode: 'custom', accent: input.value }), { undo: 'Custom accent' }));
        return el('span', { class: 'swatch custom color-input', title: 'Custom color', 'aria-pressed': String(custom) }, input);
      })(),
      el('button', {
        class: 'swatch mono',
        type: 'button',
        title: 'Monochrome',
        'aria-label': 'Monochrome',
        'aria-pressed': String(look.accentMode === 'mono'),
        onclick: () => commit((st, pr) => (pr.look.accentMode = 'mono'), { undo: 'Monochrome' }),
      }),
    );

    const bgTiles = el(
      'div',
      { class: 'bg-grid' },
      el('button', { class: 'bg-tile', type: 'button', title: 'Match the theme', 'aria-label': 'Match the theme', style: `background:linear-gradient(135deg, var(--sheet) 50%, var(--raised) 50%)`, 'aria-pressed': String(bg.kind === 'theme'), onclick: () => commit((st, pr) => (pr.background.kind = 'theme')) }),
      ...R.GALLERY.map((g) =>
        el('button', {
          class: 'bg-tile',
          type: 'button',
          title: g.name,
          'aria-label': g.name,
          style: `background:${g.css};background-size:cover;background-position:center`,
          'aria-pressed': String(bg.kind === 'gallery' && bg.value === g.id),
          onclick: () => commit((st, pr) => Object.assign(pr.background, { kind: 'gallery', value: g.id }), { undo: `${g.name} background` }),
        }),
      ),
      el(
        'button',
        {
          class: 'bg-tile upload',
          type: 'button',
          title: 'Your photo',
          'aria-label': bgImage ? 'Use your photo' : 'Upload a photo',
          style: bgImage ? `background-image:url("${bgImage}")` : '',
          'aria-pressed': String(bg.kind === 'image'),
          onclick: () => (bgImage && bg.kind !== 'image' ? commit((st, pr) => (pr.background.kind = 'image')) : $('bg-file').click()),
        },
        bgImage ? '' : '+',
      ),
    );

    const dim = el('input', { class: 'slider', type: 'range', min: '0', max: '70', value: String(bg.dim), 'aria-label': 'Dim photo' });
    dim.addEventListener('input', () => commit((st, pr) => (pr.background.dim = Number(dim.value))));

    const show = profile.show;
    $('panel-body').replaceChildren(
      section('Look', presets),
      section('Mode', segmented([['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], look.scheme, (v) => commit((st, pr) => (pr.look.scheme = v)), 'Light or dark')),
      section('Accent', accentSwatches),
      section('Text', textSwatches()),
      section('Corners', segmented([['soft', 'Soft'], ['rounded', 'Rounded'], ['extra', 'Extra round']], look.shape, (v) => commit((st, pr) => (pr.look.shape = v), { undo: 'Corner style changed' }), 'Corner style')),
      section(
        'Background',
        bgTiles,
        bg.kind === 'image' ? el('div', { class: 'row' }, el('span', {}, 'Dim photo'), dim) : null,
      ),
      section(
        'Show',
        toggleRow('Greeting', show.greeting, () => commit((st, pr) => (pr.show.greeting = !pr.show.greeting))),
        toggleRow('Clock and date', show.clock || show.date, () => commit((st, pr) => {
          const on = !(pr.show.clock || pr.show.date);
          pr.show.clock = on;
          pr.show.date = on;
        })),
        toggleRow('Shortcuts', show.shortcuts, () => commit((st, pr) => (pr.show.shortcuts = !pr.show.shortcuts))),
        toggleRow('Note for today', show.note, () => commit((st, pr) => (pr.show.note = !pr.show.note))),
        toggleRow('Bookmarks', show.bookmarks, () => commit((st, pr) => (pr.show.bookmarks = !pr.show.bookmarks))),
        toggleRow('Recently visited', show.recent, () => commit((st, pr) => (pr.show.recent = !pr.show.recent))),
        toggleRow('Most visited', show.frequent, () => commit((st, pr) => (pr.show.frequent = !pr.show.frequent))),
      ),
    );
  }

  function setPanel(open) {
    $('panel').hidden = !open;
    $('customize').setAttribute('aria-expanded', String(open));
    if (open) {
      renderPanel();
      $('panel-close').focus();
    }
  }

  $('customize').addEventListener('click', () => setPanel($('panel').hidden));
  $('panel-close').addEventListener('click', () => {
    setPanel(false);
    $('customize').focus();
  });

  $('bg-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    await usePhoto(file);
  });

  async function usePhoto(file) {
    if (!file) return;
    try {
      const max = Math.min(3840, Math.round(Math.max(screen.width, screen.height) * devicePixelRatio));
      bgImage = await R.encodeImage(file, max);
      await R.setImage(profile.id, bgImage);
      await commit((st, pr) => (pr.background.kind = 'image'), { undo: 'Photo background' });
    } catch (err) {
      toast(err.message || 'That image couldn’t be used.');
    }
  }

  // Drop a photo anywhere on the page.
  document.addEventListener('dragover', (e) => {
    if (!dragId && [...e.dataTransfer.items].some((i) => i.kind === 'file')) e.preventDefault();
  });
  document.addEventListener('drop', (e) => {
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    usePhoto(file);
  });

  // ─── Shortcut editor ──────────────────────────────────────────────────────

  let editing = null;
  let draft = null;

  function openEditor(shortcut) {
    editing = shortcut;
    draft = shortcut ? { ...shortcut } : { id: R.uid('s'), title: '', url: '', icon: '', color: '', group: activeGroup === 'all' ? '' : activeGroup };
    $('editor-title').textContent = shortcut ? 'Edit shortcut' : 'Add shortcut';
    $('ed-url').value = draft.url;
    $('ed-title').value = draft.title;
    $('ed-url').removeAttribute('aria-invalid');
    $('ed-error').hidden = true;
    $('ed-remove').hidden = !shortcut;
    $('ed-group').replaceChildren(el('option', { value: '' }, 'None'), ...profile.groups.map((g) => el('option', { value: g.id }, g.name)), el('option', { value: '__new' }, 'New collection…'));
    $('ed-group').value = draft.group;
    renderEditorIcon();
    renderEditorColors();
    $('editor').hidden = false;
    $(shortcut ? 'ed-title' : 'ed-url').focus();
  }

  function normalizedUrl(text) {
    const t = text.trim();
    if (!t) return null;
    return R.safeUrl(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`);
  }

  function renderEditorIcon() {
    const url = normalizedUrl($('ed-url').value) || 'https://example.com/';
    const node = iconNode({ ...draft, url, title: $('ed-title').value || R.hostOf(url) });
    node.id = 'ed-icon-preview';
    $('ed-icon-preview').replaceWith(node);
    $('ed-icon-reset').hidden = !draft.icon;
  }

  function renderEditorColors() {
    const colors = ['', '#e07a5f', '#e3b55b', '#81b29a', '#5fb3ad', '#7aa2d6', '#b48ead', '#c77c9a'];
    $('ed-colors').replaceChildren(
      ...colors.map((c) =>
        el('button', {
          class: 'swatch',
          type: 'button',
          title: c ? c : 'Automatic',
          'aria-label': c ? `Color ${c}` : 'Automatic color',
          'aria-pressed': String(draft.color === c),
          style: c ? `background:${c}` : 'background:conic-gradient(var(--raised) 0 50%, var(--text-3) 0)',
          onclick: () => {
            draft.color = c;
            renderEditorColors();
            renderEditorIcon();
          },
        }),
      ),
    );
  }

  let iconTimer = 0;
  $('ed-url').addEventListener('input', () => {
    clearTimeout(iconTimer);
    iconTimer = setTimeout(renderEditorIcon, 350);
  });
  $('ed-icon-btn').addEventListener('click', () => $('ed-icon-file').click());
  $('ed-icon-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      draft.icon = await R.encodeImage(file, 128, 'image/png');
      renderEditorIcon();
    } catch (err) {
      showEditorError(err.message);
    }
  });
  $('ed-icon-reset').addEventListener('click', () => {
    draft.icon = '';
    renderEditorIcon();
  });
  $('ed-group').addEventListener('change', () => {
    if ($('ed-group').value !== '__new') return;
    const name = (prompt('Name the new collection') || '').trim().slice(0, 40);
    if (!name) {
      $('ed-group').value = draft.group;
      return;
    }
    const id = R.uid('g');
    profile.groups.push({ id, name });
    $('ed-group').insertBefore(el('option', { value: id }, name), $('ed-group').lastChild);
    $('ed-group').value = id;
  });

  function showEditorError(message) {
    $('ed-error').textContent = message;
    $('ed-error').hidden = false;
  }

  function closeEditor() {
    $('editor').hidden = true;
    editing = null;
  }

  $('editor-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const url = normalizedUrl($('ed-url').value);
    if (!url) {
      $('ed-url').setAttribute('aria-invalid', 'true');
      showEditorError('Enter a web address, like example.com.');
      $('ed-url').focus();
      return;
    }
    const group = $('ed-group').value === '__new' ? '' : $('ed-group').value;
    const item = { ...draft, url, title: $('ed-title').value.trim() || R.hostOf(url), group };
    if (editing && editing.url !== url) delete iconMemo[editing.url];
    const groups = profile.groups;
    commit((st, pr) => {
      pr.groups = groups;
      pr.shortcuts = editing ? pr.shortcuts.map((s) => (s.id === editing.id ? item : s)) : [...pr.shortcuts, item];
    });
    closeEditor();
  });
  $('ed-remove').addEventListener('click', () => {
    const gone = editing;
    if (gone) commit((st, pr) => (pr.shortcuts = pr.shortcuts.filter((s) => s.id !== gone.id)), { undo: `Removed ${gone.title}` });
    closeEditor();
  });
  $('ed-cancel').addEventListener('click', closeEditor);
  $('editor-close').addEventListener('click', closeEditor);
  $('editor').addEventListener('mousedown', (e) => e.target === $('editor') && closeEditor());

  // ─── Profiles menu ────────────────────────────────────────────────────────

  function setProfileMenu(open) {
    const menu = $('profile-menu');
    menu.hidden = !open;
    $('profile-btn').setAttribute('aria-expanded', String(open));
    if (!open) return;
    menu.replaceChildren(
      ...state.profiles.map((p) =>
        el(
          'button',
          {
            type: 'button',
            role: 'menuitemradio',
            'aria-checked': String(p.id === state.active),
            onclick: async () => {
              setProfileMenu(false);
              if (p.id === state.active) return;
              bgImage = await R.getImage(p.id);
              commit((st) => (st.active = p.id), { undo: `Switched to ${p.label}` });
            },
          },
          el('span', { class: 'menu-swatch', style: `background:${R.palette(p.look).accent}` }),
          p.label,
        ),
      ),
      el('hr'),
      el('a', { href: 'personalize.html#profiles', role: 'menuitem' }, 'Manage profiles…'),
    );
    menu.querySelector('button')?.focus();
  }
  $('profile-btn').addEventListener('click', () => setProfileMenu($('profile-menu').hidden));
  document.addEventListener('mousedown', (e) => {
    if (!$('profile-menu').hidden && !e.target.closest('#profile-menu, #profile-btn')) setProfileMenu(false);
  });

  // ─── Search, note, keyboard ───────────────────────────────────────────────

  function looksLikeUrl(text) {
    if (/\s/.test(text)) return false;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return true;
    if (/^localhost(:\d+)?(\/|$)/i.test(text)) return true;
    return /^[^/?#\s]+\.[a-z][a-z0-9-]{1,62}(:\d+)?([/?#].*)?$/i.test(text);
  }

  $('search').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('q').value.trim();
    if (!text) return;
    if (looksLikeUrl(text)) {
      location.href = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
      return;
    }
    const engine = R.ENGINES[profile.search.engine];
    if (engine.url) location.href = engine.url.replace('%s', encodeURIComponent(text));
    else if (typeof chrome !== 'undefined' && chrome.search?.query) chrome.search.query({ text, disposition: 'CURRENT_TAB' });
    else location.href = R.ENGINES.duckduckgo.url.replace('%s', encodeURIComponent(text));
  });

  let noteTimer = 0;
  $('note-input').addEventListener('input', () => {
    clearTimeout(noteTimer);
    const value = $('note-input').value;
    noteTimer = setTimeout(() => commit((st, pr) => (pr.note = value)), 400);
  });
  $('note-input').addEventListener('keydown', (e) => e.key === 'Enter' && e.target.blur());

  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if (e.key === '/' && !typing && !$('search').hidden && $('onboarding').hidden) {
      e.preventDefault();
      $('q').focus();
    } else if (e.key === 'Escape') {
      if (!$('editor').hidden) closeEditor();
      else if (!$('profile-menu').hidden) setProfileMenu(false);
      else if (!$('panel').hidden) setPanel(false);
      else if (document.activeElement === $('q')) $('q').blur();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing && undoStack.length) {
      e.preventDefault();
      undoLast();
    }
  });

  // ─── Live updates ─────────────────────────────────────────────────────────

  let rendered = false;
  async function reload() {
    const next = await R.load();
    const nextProfile = R.activeProfile(next);
    const nextImage = await R.getImage(nextProfile.id);
    // Our own saves come back as change events; skip the redraw when nothing
    // actually changed, so icons don't reload.
    if (rendered && JSON.stringify(next) === JSON.stringify(state) && nextImage === bgImage) return;
    state = next;
    profile = nextProfile;
    bgImage = nextImage;
    render();
    rendered = true;
  }
  R.onChange(reload);
  // Personalize's live preview asks the page to refresh after each change.
  addEventListener('message', (e) => {
    if (e.data === 'rye-refresh' && (e.origin === location.origin || location.protocol === 'file:')) reload();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', render);

  function tick() {
    renderTime();
    setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
  }

  // Shared with onboarding.js.
  window.RyeNTP = {
    get state() {
      return state;
    },
    get profile() {
      return profile;
    },
    ready: false,
    commit,
    mini,
    el,
    render,
    preview,
  };

  reload().then(() => {
    tick();
    if (!preview) R.applyToBrowser(profile);
    window.RyeNTP.ready = true;
    document.dispatchEvent(new Event('rye-ready'));
  });
})();
