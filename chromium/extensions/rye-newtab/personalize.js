// Rye's Personalize page: every appearance and personalization setting, with
// a live preview of the real new tab page. Uses core.js (window.Rye).
'use strict';

(() => {
  const R = window.Rye;
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const api = typeof chrome !== 'undefined' ? chrome : {};

  let state = R.defaultState();
  let profile = R.activeProfile(state);
  let bgImage = null;
  const history = [];
  const clone = (v) => JSON.parse(JSON.stringify(v));

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'style') node.style.cssText = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
    return node;
  }
  const svgIcon = (d) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('width', '16');
    s.setAttribute('height', '16');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.9');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.innerHTML = d;
    return s;
  };

  // ─── Saving, undo ─────────────────────────────────────────────────────────

  let savedTimer = 0;
  async function commit(mutate, { message = null, keepHistory = true } = {}) {
    if (keepHistory) {
      history.push(clone(state));
      if (history.length > 50) history.shift();
    }
    const next = clone(state);
    mutate(next, R.activeProfile(next));
    state = R.sanitizeState(next);
    profile = R.activeProfile(state);
    renderAll();
    await R.save(state);
    const changed = await R.applyToBrowser(profile);
    refreshPreview();
    $('saved').textContent = 'Saved';
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => ($('saved').textContent = ''), 1600);
    if (message) toast(message, 'Undo', undo);
    return changed;
  }

  async function undo() {
    const prev = history.pop();
    if (!prev) return;
    state = R.sanitizeState(prev);
    profile = R.activeProfile(state);
    bgImage = await R.getImage(profile.id);
    renderAll();
    await R.save(state);
    R.applyToBrowser(profile);
    refreshPreview();
    toast('Undone');
  }

  let toastTimer = 0;
  function toast(text, action, onAction) {
    const t = $('toast');
    t.replaceChildren(el('span', {}, text), action ? el('button', { class: 'btn', type: 'button', onclick: () => (onAction(), (t.hidden = true)) }, action) : null);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 5000);
  }

  // ─── Building blocks ──────────────────────────────────────────────────────

  function section(id, title, sub, onReset, ...groups) {
    return el(
      'section',
      { class: 'section', id, 'aria-labelledby': `${id}-title` },
      el(
        'div',
        { class: 'section-head' },
        el('div', {}, el('h2', { id: `${id}-title` }, title), sub ? el('p', {}, sub) : null),
        onReset ? el('button', { class: 'btn ghost', type: 'button', onclick: onReset }, 'Reset') : null,
      ),
      ...groups,
    );
  }
  const group = (title, ...children) => el('div', { class: 'group' }, title ? el('h3', { class: 'group-title' }, title) : null, ...children);
  const row = (title, sub, control) =>
    el('div', { class: 'row' }, el('span', { class: 'row-text' }, el('span', { class: 'row-title' }, title), sub ? el('span', { class: 'row-sub' }, sub) : null), control);

  function segmented(label, options, value, onPick) {
    return el(
      'div',
      { class: 'segmented', role: 'group', 'aria-label': label },
      ...options.map(([v, text]) => el('button', { type: 'button', 'aria-pressed': String(value === v), onclick: () => value !== v && onPick(v) }, text)),
    );
  }

  function toggle(label, on, flip) {
    return el('button', { class: 'toggle', type: 'button', role: 'switch', 'aria-label': label, 'aria-checked': String(on), onclick: flip });
  }

  function mini(look, dark) {
    const p = R.palette(look, dark);
    return el(
      'span',
      { class: 'mini', style: `--m-frame:${p.frame};--m-base:${p.base};--m-sheet:${p.sheet};--m-omni:${p.sunken};--m-accent:${p.accent};--m-text:${p.text}` },
      el('span', { class: 'mini-tabs' }, el('i', { class: 'mini-tab' }), el('i', { class: 'mini-tab off' })),
      el('span', { class: 'mini-wrap' }, el('span', { class: 'mini-bar' }, el('i', { class: 'mini-omni' })), el('span', { class: 'mini-page' }, el('i', { class: 'mini-hello' }), el('i', { class: 'mini-search' }), el('span', { class: 'mini-dots' }, el('i'), el('i'), el('i')))),
    );
  }

  // Per-category resets restore Rye's defaults for just that category.
  const defaults = () => R.defaultProfile();
  const resetPart = (name, apply) => () => commit((st, p) => apply(p, defaults()), { message: `${name} reset` });

  // ─── Sections ─────────────────────────────────────────────────────────────

  function identitySection() {
    const id = profile.identity;
    const name = el('input', { class: 'field', value: id.name, maxlength: '40', placeholder: 'Your name', 'aria-label': 'Preferred name' });
    const nameError = el('p', { class: 'error', hidden: true });
    const saveName = () => {
      const raw = name.value;
      const clean = raw.replace(/[\u0000-\u001f\u007f<>{}]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
      nameError.hidden = !/[<>{}]/.test(raw);
      nameError.textContent = 'Rye leaves out < > { } in names.';
      if (clean !== profile.identity.name) commit((st, p) => (p.identity.name = clean), { message: clean ? 'Name saved' : 'Name removed' });
    };
    name.addEventListener('change', saveName);
    name.addEventListener('keydown', (e) => e.key === 'Enter' && name.blur());

    const custom = el('input', { class: 'field', value: id.custom, maxlength: '80', placeholder: 'Hello, {name}.', 'aria-label': 'Custom greeting' });
    custom.addEventListener('change', () => commit((st, p) => (p.identity.custom = custom.value)));
    const sampleProfile = { ...profile, identity: { ...id, greeting: id.greeting === 'rotating' ? 'time' : id.greeting }, show: { ...profile.show, greeting: true } };
    const sampleText = R.greetingText(R.greeting(sampleProfile)) || 'No greeting';

    return section(
      'identity', 'Identity', 'How Rye greets you on new tabs.',
      resetPart('Identity', (p, d) => (p.identity = d.identity)),
      group(null,
        row('Preferred name', 'Stored only on this computer. Leave empty for a greeting without a name.', el('div', {}, name, nameError)),
        row('Show greeting', id.greeting === 'rotating' ? `A different line on each new tab, like “${sampleText}”` : `Now: “${sampleText}”`, toggle('Show greeting', profile.show.greeting, () => commit((st, p) => (p.show.greeting = !p.show.greeting)))),
        row('Greeting style', null, segmented('Greeting style', [['rotating', 'Changes each time'], ['time', 'Time of day'], ['hello', 'Hello'], ['custom', 'Custom']], id.greeting, (v) => commit((st, p) => (p.identity.greeting = v)))),
        id.greeting === 'custom' ? row('Your greeting', 'Write {name} where your name goes.', custom) : null,
      ),
    );
  }

  function colorsSection() {
    const look = profile.look;
    const dark = (presetId) => {
      const s = R.PRESETS[presetId].scheme;
      return look.preset === presetId || s === 'system' ? R.isDark(look) : s === 'dark';
    };
    const presets = el(
      'div',
      { class: 'presets', role: 'radiogroup', 'aria-label': 'Theme' },
      ...Object.entries(R.PRESETS).map(([pid, preset]) =>
        el(
          'button',
          {
            class: 'preset',
            type: 'button',
            role: 'radio',
            'aria-checked': String(look.preset === pid),
            onclick: () =>
              commit(
                (st, p) => {
                  p.look.preset = pid;
                  p.look.scheme = preset.scheme;
                  if (p.look.accentMode === 'mono') p.look.accentMode = 'preset';
                },
                { message: `${preset.name} applied` },
              ),
          },
          mini({ ...look, preset: pid, accentMode: look.accentMode === 'custom' ? 'custom' : 'preset' }, dark(pid)),
          el('b', {}, preset.name),
          el('small', {}, preset.note),
        ),
      ),
    );

    const presetAccent = R.palette({ ...look, accentMode: 'preset' }).accent;
    const hex = el('input', { class: 'field hex', value: look.accentMode === 'custom' ? look.accent : presetAccent, maxlength: '7', 'aria-label': 'Accent color hex code', spellcheck: 'false' });
    const hexError = el('p', { class: 'error', hidden: true }, 'Use a color code like #6f93c9.');
    hex.addEventListener('change', () => {
      const v = hex.value.trim().replace(/^([0-9a-f]{6})$/i, '#$1');
      const ok = /^#[0-9a-f]{6}$/i.test(v);
      hexError.hidden = ok;
      hex.setAttribute('aria-invalid', String(!ok));
      if (ok) commit((st, p) => Object.assign(p.look, { accentMode: 'custom', accent: v.toLowerCase() }), { message: 'Accent changed' });
    });
    const picker = el('input', { type: 'color', value: look.accent, 'aria-label': 'Pick a custom accent color' });
    picker.addEventListener('change', () => commit((st, p) => Object.assign(p.look, { accentMode: 'custom', accent: picker.value }), { message: 'Accent changed' }));

    const accents = el(
      'div',
      { class: 'swatches' },
      el('button', { class: 'swatch', type: 'button', title: `${R.PRESETS[look.preset].name} accent`, 'aria-label': 'Theme accent', style: `background:${presetAccent}`, 'aria-pressed': String(look.accentMode === 'preset'), onclick: () => commit((st, p) => (p.look.accentMode = 'preset')) }),
      ...R.ACCENTS.map((a) =>
        el('button', { class: 'swatch', type: 'button', title: a.name, 'aria-label': a.name, style: `background:${a.value}`, 'aria-pressed': String(look.accentMode === 'custom' && look.accent === a.value), onclick: () => commit((st, p) => Object.assign(p.look, { accentMode: 'custom', accent: a.value })) }),
      ),
      el('span', { class: 'swatch custom color-input', title: 'Custom color', 'aria-pressed': String(look.accentMode === 'custom' && !R.ACCENTS.some((a) => a.value === look.accent)) }, picker),
      el('button', { class: 'swatch mono', type: 'button', title: 'Monochrome', 'aria-label': 'Monochrome', 'aria-pressed': String(look.accentMode === 'mono'), onclick: () => commit((st, p) => (p.look.accentMode = 'mono'), { message: 'Monochrome' }) }),
      hex,
    );

    return section(
      'colors', 'Colors', 'Recolors the whole browser: frame, tabs, toolbar, address bar, menus, dialogs and Rye’s pages.',
      resetPart('Colors', (p, d) => (p.look = { ...p.look, preset: d.look.preset, scheme: d.look.scheme, accentMode: d.look.accentMode, accent: d.look.accent})),
      group('Theme', presets),
      group(null,
        row('Mode', null, segmented('Light or dark', [['system', 'Match Windows'], ['light', 'Light'], ['dark', 'Dark']], look.scheme, (v) => commit((st, p) => (p.look.scheme = v)))),
        row('Accent', 'Used for focus rings, toggles, selection and highlights. Rye keeps it readable in light and dark.', el('div', {}, accents, hexError)),
      ),
    );
  }

  function layoutSection() {
    const y = profile.layout;
    const s = profile.show;
    const flip = (key) => () => commit((st, p) => (p.show[key] = !p.show[key]));
    const engine = el('select', { class: 'field', 'aria-label': 'New tab search engine' }, ...Object.entries(R.ENGINES).map(([eid, e]) => el('option', { value: eid }, e.name)));
    engine.value = profile.search.engine;
    engine.addEventListener('change', () => commit((st, p) => (p.search.engine = engine.value)));

    const groupsList = el(
      'div',
      { class: 'collections' },
      ...profile.groups.map((g) => {
        const input = el('input', { class: 'field', value: g.name, maxlength: '40', 'aria-label': `Collection name: ${g.name}` });
        input.addEventListener('change', () => commit((st, p) => (p.groups.find((x) => x.id === g.id).name = input.value)));
        return el('div', { class: 'collection' }, input, el('button', { class: 'btn ghost danger', type: 'button', onclick: () => commit((st, p) => (p.groups = p.groups.filter((x) => x.id !== g.id)), { message: `Removed ${g.name}` }) }, 'Remove'));
      }),
      el('div', { class: 'actions' }, el('button', { class: 'btn', type: 'button', onclick: () => commit((st, p) => p.groups.push({ id: R.uid('g'), name: `Collection ${p.groups.length + 1}` })) }, 'Add collection')),
    );

    return section(
      'layout', 'Layout', 'What the new tab page shows, and where.',
      resetPart('Layout', (p, d) => {
        p.layout = d.layout;
        p.show = d.show;
        p.search = d.search;
      }),
      group('New tab',
        row('Style', 'Expressive sets the greeting larger and gives shortcuts more room.', segmented('New tab style', [['minimal', 'Minimal'], ['expressive', 'Expressive']], y.style, (v) => commit((st, p) => (p.layout.style = v)))),
        row('Placement', null, segmented('Content placement', [['center', 'Centered'], ['left', 'Left']], y.placement, (v) => commit((st, p) => (p.layout.placement = v)))),
        row('Search position', null, segmented('Search position', [['upper', 'Upper'], ['middle', 'Middle']], y.searchPosition, (v) => commit((st, p) => (p.layout.searchPosition = v)))),
        row('Search width', null, segmented('Search width', [['narrow', 'Narrow'], ['regular', 'Regular'], ['wide', 'Wide']], y.searchWidth, (v) => commit((st, p) => (p.layout.searchWidth = v)))),
        row('Search engine', 'For the new tab search box. The address bar has its own setting.', el('div', { class: 'actions' }, engine, el('button', { class: 'btn ghost', type: 'button', onclick: () => api.tabs?.create({ url: 'chrome://settings/search' }) }, 'Address bar…'))),
      ),
      group('Shortcuts',
        row('Shortcut style', null, segmented('Shortcut style', [['icons', 'Icons only'], ['compact', 'Compact'], ['tiles', 'Large']], y.shortcutStyle, (v) => commit((st, p) => (p.layout.shortcutStyle = v)))),
        row('Spacing', null, segmented('Shortcut spacing', [['tight', 'Tight'], ['normal', 'Normal'], ['airy', 'Airy']], y.spacing, (v) => commit((st, p) => (p.layout.spacing = v)))),
        row('Collections', 'Group shortcuts into named sets; they appear as tabs above your shortcuts.', groupsList),
      ),
      group('Show on new tabs',
        row('Search box', null, toggle('Search box', s.search, flip('search'))),
        row('Clock', null, toggle('Clock', s.clock, flip('clock'))),
        row('Date', null, toggle('Date', s.date, flip('date'))),
        row('Shortcuts', null, toggle('Shortcuts', s.shortcuts, flip('shortcuts'))),
        row('Note for today', 'A small personal reminder under the search box.', toggle('Note for today', s.note, flip('note'))),
        row('Bookmarks', 'From your bookmarks bar.', toggle('Bookmarks', s.bookmarks, flip('bookmarks'))),
        row('Recently visited', null, toggle('Recently visited', s.recent, flip('recent'))),
        row('Most visited', null, toggle('Most visited', s.frequent, flip('frequent'))),
      ),
      group('Browser',
        row('Bookmarks bar', 'Below the address bar on every tab.', toggle('Bookmarks bar', y.bookmarksBar, () => commit((st, p) => (p.layout.bookmarksBar = !p.layout.bookmarksBar)))),
        row('Tabs in a sidebar', 'Vertical tabs down the side of the window.', toggle('Tabs in a sidebar', y.sidebar, () => commit((st, p) => (p.layout.sidebar = !p.layout.sidebar)))),
      ),
    );
  }

  function shapeSection() {
    const look = profile.look;
    const card = (id, name, sub) => {
      const r = R.SHAPES[id];
      return el(
        'button',
        { class: 'shape-card', type: 'button', role: 'radio', 'aria-checked': String(look.shape === id), onclick: () => commit((st, p) => (p.look.shape = id), { message: `${name} corners` }) },
        el(
          'span',
          { class: 'specimen', style: `border-radius:${r.lg}px` },
          el('span', { class: 'specimen-tabs' }, el('i', { style: `border-radius:${r.sm}px ${r.sm}px ${r.xs}px ${r.xs}px` }), el('i', { style: `border-radius:${r.sm}px` })),
          el('span', { class: 'specimen-field', style: `border-radius:${Math.min(r.ctl, 8)}px` }),
          el('span', { class: 'specimen-row' }, el('i', { class: 'specimen-btn', style: `border-radius:${Math.min(r.ctl, 7)}px` }), el('i', { class: 'specimen-icon', style: `border-radius:${id === 'soft' ? 4 : 7}px` })),
        ),
        el('b', {}, name),
        el('small', { style: 'color:var(--text-3)' }, sub),
      );
    };
    return section(
      'shape', 'Shape', 'One corner style for tabs, the address bar, toolbar buttons, menus, dialogs, the page and Rye’s pages.',
      resetPart('Shape', (p, d) => {
        p.look.shape = d.look.shape;
        p.layout.iconShape = d.layout.iconShape;
      }),
      group(null, el('div', { class: 'shapes', role: 'radiogroup', 'aria-label': 'Corner style' }, card('soft', 'Soft', 'Moderate, restrained'), card('rounded', 'Rounded', 'Softer, circular icon buttons'), card('extra', 'Extra round', 'Generous curves, pill controls'))),
      group(null,
        row('Shortcut icons', null, segmented('Shortcut icon shape', [['auto', 'Match style'], ['square', 'Square'], ['squircle', 'Squircle'], ['circle', 'Circle']], profile.layout.iconShape, (v) => commit((st, p) => (p.layout.iconShape = v)))),
      ),
      el('p', { class: 'hint' }, 'Rye’s pages and new windows change right away. Some parts of windows that are already open update when you next restart Rye.'),
    );
  }

  function backgroundSection() {
    const bg = profile.background;
    const solid = el('input', { type: 'color', value: bg.kind === 'color' ? bg.value : '#22201e', 'aria-label': 'Solid background color' });
    solid.addEventListener('change', () => commit((st, p) => Object.assign(p.background, { kind: 'color', value: solid.value })));
    const dim = el('input', { class: 'slider', type: 'range', min: '0', max: '70', value: String(bg.dim), 'aria-label': 'Dim photo', style: 'accent-color:var(--accent);width:180px' });
    dim.addEventListener('change', () => commit((st, p) => (p.background.dim = Number(dim.value))));
    const tile = (label, style, checked, onclick, extra = '') =>
      el('button', { class: `bg ${extra}`, type: 'button', role: 'radio', 'aria-checked': String(checked), 'aria-label': label, style, onclick }, extra === 'add' ? label : el('span', {}, label));
    return section(
      'background', 'Background', 'Behind the new tab page. Everything here is stored on this computer; nothing is downloaded.',
      resetPart('Background', (p, d) => (p.background = d.background)),
      group(null,
        el(
          'div',
          { class: 'bgs', role: 'radiogroup', 'aria-label': 'Background' },
          tile('Theme', 'background:linear-gradient(135deg, var(--sheet) 50%, var(--raised) 50%)', bg.kind === 'theme', () => commit((st, p) => (p.background.kind = 'theme'))),
          ...R.GALLERY.map((g) => tile(g.name, `background:${g.css};background-size:cover;background-position:center`, bg.kind === 'gallery' && bg.value === g.id, () => commit((st, p) => Object.assign(p.background, { kind: 'gallery', value: g.id }), { message: `${g.name} background` }))),
          bgImage
            ? tile('Your photo', `background-image:url("${bgImage}")`, bg.kind === 'image', () => commit((st, p) => (p.background.kind = 'image')))
            : tile('Add a photo', '', false, () => $('bg-file').click(), 'add'),
        ),
      ),
      group(null,
        row('Solid color', null, el('span', { class: 'swatch color-input', style: `background:${bg.kind === 'color' ? bg.value : 'var(--sheet)'}`, 'aria-pressed': String(bg.kind === 'color') }, solid)),
        row('Your photo', bgImage ? 'Stored on this computer only.' : 'PNG, JPEG or WebP. Resized to your screen.', el('div', { class: 'actions' }, el('button', { class: 'btn', type: 'button', onclick: () => $('bg-file').click() }, bgImage ? 'Replace…' : 'Choose…'), bgImage ? el('button', { class: 'btn ghost danger', type: 'button', onclick: removePhoto }, 'Remove') : null)),
        bg.kind === 'image' ? row('Dim photo', 'Keeps text readable over bright photos.', dim) : null,
      ),
    );
  }

  async function removePhoto() {
    await R.setImage(profile.id, null);
    bgImage = null;
    commit((st, p) => p.background.kind === 'image' && (p.background.kind = 'theme'), { message: 'Photo removed' });
  }

  function motionSection() {
    const osReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    return section(
      'motion', 'Motion', null,
      resetPart('Motion', (p, d) => (p.motion = d.motion)),
      group(null,
        row('Animation', osReduced ? 'Windows asks apps to reduce motion, so Rye keeps animation subtle.' : 'Reduced keeps only short fades.', segmented('Animation', [['full', 'Full'], ['reduced', 'Reduced'], ['none', 'Off']], profile.motion, (v) => commit((st, p) => (p.motion = v)))),
      ),
    );
  }

  function profilesSection() {
    const list = el(
      'div',
      { class: 'profiles' },
      ...state.profiles.map((p) => {
        const active = p.id === state.active;
        const pal = R.palette(p.look);
        const label = el('input', { class: 'field', value: p.label, maxlength: '40', 'aria-label': `Profile name: ${p.label}`, style: 'max-width:220px' });
        label.addEventListener('change', () => commit((st) => (st.profiles.find((x) => x.id === p.id).label = label.value)));
        return el(
          'div',
          { class: 'profile', 'data-active': String(active) },
          el('span', { class: 'profile-avatar', style: `background:${pal.accent};color:${pal.onAccent}` }, (p.identity.name || p.label)[0]?.toUpperCase() || '·'),
          el('span', { class: 'profile-name' }, label, el('small', {}, `${R.PRESETS[p.look.preset].name}${p.identity.name ? ` · ${p.identity.name}` : ''}`)),
          active ? el('span', { class: 'badge' }, 'In use') : el('button', { class: 'btn', type: 'button', onclick: () => switchTo(p.id) }, 'Use'),
          el('button', { class: 'btn ghost', type: 'button', onclick: () => duplicate(p.id) }, 'Duplicate'),
          state.profiles.length > 1 ? el('button', { class: 'btn ghost danger', type: 'button', onclick: () => remove(p.id) }, 'Delete') : null,
        );
      }),
    );
    return section(
      'profiles', 'Profiles', 'Each Rye profile keeps its own name, look, shortcuts and new tab page. History, passwords and cookies are shared between them.',
      null,
      group(null, list),
      group(null,
        el('div', { class: 'actions' },
          state.profiles.length < 8 ? el('button', { class: 'btn primary', type: 'button', onclick: create }, 'New profile') : null,
          el('button', { class: 'btn ghost', type: 'button', onclick: () => api.tabs?.create({ url: 'chrome://settings/manageProfile' }) }, 'Separate browsing data…'),
        ),
        el('p', { class: 'hint' }, 'For completely separate history, passwords and sign-ins, use a browser profile instead (Separate browsing data…).'),
      ),
    );
  }

  async function switchTo(id) {
    bgImage = await R.getImage(id);
    commit((st) => (st.active = id), { message: `Using ${state.profiles.find((p) => p.id === id).label}` });
  }
  function create() {
    const p = R.defaultProfile(`Profile ${state.profiles.length + 1}`);
    commit((st) => {
      st.profiles.push(p);
      st.active = p.id;
    }, { message: `${p.label} created` }).then(async () => (bgImage = await R.getImage(p.id)));
  }
  function duplicate(id) {
    const src = state.profiles.find((p) => p.id === id);
    const copy = { ...clone(src), id: R.uid('p'), label: `${src.label} copy`.slice(0, 40) };
    commit((st) => st.profiles.push(copy), { message: 'Profile duplicated' });
  }
  function remove(id) {
    const p = state.profiles.find((x) => x.id === id);
    if (!confirm(`Delete the profile “${p.label}”? Its look, shortcuts and new tab settings will be removed.`)) return;
    commit((st) => {
      st.profiles = st.profiles.filter((x) => x.id !== id);
      if (st.active === id) st.active = st.profiles[0].id;
    }, { message: `Deleted ${p.label}` });
  }

  function backupSection() {
    const importError = el('p', { class: 'error', id: 'import-error', hidden: true });
    return section(
      'backup', 'Backup and reset', null, null,
      group('Appearance file',
        row('Export', 'Saves this profile’s look, layout, greeting and shortcuts to a file. No history, passwords or cookies.', el('button', { class: 'btn', type: 'button', onclick: exportFile }, 'Export…')),
        row('Import', 'Applies a Rye appearance file to this profile. You can undo it.', el('div', {}, el('button', { class: 'btn', type: 'button', onclick: () => $('import-file').click() }, 'Import…'), importError)),
      ),
      group('Start over',
        row('Run setup again', 'The five-step setup from your first launch.', el('button', { class: 'btn', type: 'button', onclick: () => (location.href = 'newtab.html?setup=1') }, 'Run setup')),
        row('Restore Rye’s default appearance', 'Colors, shape, layout, background and motion. Keeps your name and shortcuts.', el('button', { class: 'btn', type: 'button', onclick: restoreAppearance }, 'Restore')),
        row('Reset this profile', 'Everything in this profile, including name and shortcuts.', el('button', { class: 'btn danger', type: 'button', onclick: resetProfile }, 'Reset…')),
      ),
    );
  }

  function exportFile() {
    const blob = new Blob([R.exportProfile(profile)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `rye-${profile.label.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'appearance'}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  $('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const box = $('import-error');
    try {
      if (file.size > 2_000_000) throw new Error('That file is too large to be a Rye appearance file.');
      const imported = R.importProfile(await file.text(), profile);
      await commit((st) => (st.profiles = st.profiles.map((p) => (p.id === imported.id ? { ...imported, label: p.label } : p))), { message: 'Appearance imported' });
    } catch (err) {
      box.textContent = err.message;
      box.hidden = false;
    }
  });

  function restoreAppearance() {
    commit((st, p) => {
      const d = defaults();
      p.look = d.look;
      p.layout = d.layout;
      p.background = d.background;
      p.motion = d.motion;
      p.show = d.show;
    }, { message: 'Default appearance restored' });
  }

  function resetProfile() {
    if (!confirm('Reset everything in this profile, including your name and shortcuts?')) return;
    commit((st, p) => {
      const d = defaults();
      Object.assign(p, { ...d, id: p.id, label: p.label });
    }, { message: 'Profile reset' });
  }

  $('bg-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const max = Math.min(3840, Math.round(Math.max(screen.width, screen.height) * devicePixelRatio));
      bgImage = await R.encodeImage(file, max);
      await R.setImage(profile.id, bgImage);
      commit((st, p) => (p.background.kind = 'image'), { message: 'Photo background' });
    } catch (err) {
      toast(err.message || 'That image couldn’t be used.');
    }
  });

  // ─── Page ─────────────────────────────────────────────────────────────────

  const NAV = [
    ['identity', 'Identity', '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'],
    ['colors', 'Colors', '<path d="M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2a2 2 0 0 0-1.5 3.3A1.6 1.6 0 0 1 12 22Z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="10.5" r="1"/>'],
    ['layout', 'Layout', '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/>'],
    ['shape', 'Shape', '<path d="M4 20V10a6 6 0 0 1 6-6h10"/>'],
    ['background', 'Background', '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m3 16 5-5 4 4 3-3 6 6"/>'],
    ['motion', 'Motion', '<path d="M3 12c3-6 6-6 9 0s6 6 9 0"/>'],
    ['profiles', 'Profiles', '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>'],
    ['backup', 'Backup and reset', '<path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'],
  ];

  // Highlight the section in view.
  const observer = new IntersectionObserver(
    (entries) => {
      const top = entries.filter((x) => x.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top) for (const a of $('nav').children) a.setAttribute('aria-current', String(a.getAttribute('href') === `#${top.target.id}`));
    },
    { rootMargin: '-80px 0px -60% 0px' },
  );

  function renderNav() {
    const current = location.hash.slice(1) || 'identity';
    $('nav').replaceChildren(...NAV.map(([id, name, d]) => el('a', { href: `#${id}`, 'aria-current': String(id === current) }, svgIcon(d), name)));
  }

  function renderAll() {
    R.applyTokens(root, profile);
    const scrollY = window.scrollY;
    const focusedLabel = document.activeElement?.getAttribute('aria-label');
    $('content').replaceChildren(identitySection(), colorsSection(), layoutSection(), shapeSection(), backgroundSection(), motionSection(), profilesSection(), backupSection());
    window.scrollTo(0, scrollY);
    if (focusedLabel) $('content').querySelector(`[aria-label="${CSS.escape(focusedLabel)}"]`)?.focus({ preventScroll: true });
    renderNav();
    $('profile-pill').textContent = profile.label;
    $('profile-pill').hidden = state.profiles.length < 2;
    $('undo').disabled = history.length === 0;
    observer.disconnect();
    for (const sec of document.querySelectorAll('.section')) observer.observe(sec);
    $('preview-note').textContent = R.browserBridgeAvailable() ? 'Live preview of your new tab page. The browser itself changes as you go.' : 'Live preview of your new tab page.';
  }

  function refreshPreview() {
    $('preview').contentWindow?.postMessage('rye-refresh', location.origin === 'null' ? '*' : location.origin);
  }

  function scalePreview() {
    const page = $('preview').parentElement;
    const scale = page.clientWidth / 1280;
    $('preview').style.transform = `scale(${scale})`;
    $('preview').style.height = `${page.clientHeight / scale}px`;
  }
  new ResizeObserver(scalePreview).observe(document.querySelector('.pf-page'));

  $('undo').addEventListener('click', undo);
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing && history.length) {
      e.preventDefault();
      undo();
    }
  });
  addEventListener('hashchange', renderNav);
  async function reload() {
    state = await R.load();
    profile = R.activeProfile(state);
    bgImage = await R.getImage(profile.id);
    renderAll();
  }
  R.onChange(() => {
    // Changes from other tabs (or the new tab page) show up here too.
    if (document.activeElement?.tagName !== 'INPUT') reload();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderAll);

  reload().then(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    scalePreview();
  });
})();
