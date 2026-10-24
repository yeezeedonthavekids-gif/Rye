// Rye's first-launch setup. Runs on the new tab page until it's finished or
// skipped, and again whenever "Run setup again" is chosen in Personalize.
// Every choice is applied right away, to the page and to the browser.
'use strict';

(() => {
  const R = window.Rye;
  const N = () => window.RyeNTP;
  const $ = (id) => document.getElementById(id);
  const STEPS = ['Welcome', 'Name', 'Look', 'Preferences', 'Done'];
  let step = 0;
  let nameDraft = '';

  const el = (...args) => N().el(...args);
  const commit = (fn) => N().commit(fn);
  const profile = () => N().profile;

  const RYE_MARK =
    '<svg viewBox="0 0 48 48" width="56" height="56" aria-hidden="true"><rect width="48" height="48" rx="14" fill="var(--accent)"/><path d="M17 36V23.5c0-5.4 3.9-9.3 8.9-9.6" fill="none" stroke="var(--on-accent)" stroke-width="4.2" stroke-linecap="round"/><circle cx="31.5" cy="14.2" r="3.4" fill="var(--on-accent)"/></svg>';

  function open(fromStep = 0) {
    step = fromStep;
    nameDraft = profile().identity.name;
    $('onboarding').hidden = false;
    document.body.classList.add('ob-open');
    render();
  }

  function close() {
    $('onboarding').hidden = true;
    document.body.classList.remove('ob-open');
    $('q')?.focus();
  }

  async function finish() {
    await commit((st) => (st.onboarded = true));
    close();
  }

  function go(next) {
    step = Math.max(0, Math.min(STEPS.length - 1, next));
    render();
  }

  function render() {
    $('ob-progress').replaceChildren(
      ...STEPS.map((name, i) => el('li', { class: i < step ? 'done' : i === step ? 'current' : '', 'aria-current': i === step ? 'step' : null }, el('span', { class: 'sr-only' }, name))),
    );
    const view = [welcome, nameStep, lookStep, prefsStep, doneStep][step]();
    const box = el('div', { class: 'ob-step' }, ...view.body);
    $('ob-steps').replaceChildren(box);
    $('ob-foot').replaceChildren(...view.foot);
    $('ob-card').dataset.step = String(step);
    (box.querySelector('[autofocus]') || $('ob-foot').querySelector('.primary'))?.focus();
  }

  const back = () => el('button', { class: 'btn ghost', type: 'button', onclick: () => go(step - 1) }, 'Back');
  const next = (label = 'Continue', onclick = () => go(step + 1)) => el('button', { class: 'btn primary large', type: 'button', onclick }, label);
  const spacer = () => el('span', { class: 'spacer' });
  const heading = (text, sub) => [el('h1', { id: 'ob-title', class: 'ob-title' }, text), sub ? el('p', { class: 'ob-sub' }, sub) : null];

  // 1 — Welcome
  function welcome() {
    const mark = el('div', { class: 'ob-mark' });
    mark.innerHTML = RYE_MARK;
    return {
      body: [mark, ...heading('Welcome to Rye', 'A calm, quick browser that you shape. A minute of setup makes it yours.')],
      foot: [el('button', { class: 'btn ghost', type: 'button', onclick: finish }, 'Skip setup'), spacer(), next('Get started')],
    };
  }

  // 2 — Name
  function cleanName(text) {
    return text.replace(/[\u0000-\u001f\u007f<>{}]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  }

  function nameStep() {
    const input = el('input', { class: 'field ob-name', id: 'ob-name', value: nameDraft, maxlength: '40', placeholder: 'Your name', autocomplete: 'given-name', autofocus: true, 'aria-describedby': 'ob-name-hint' });
    const hint = el('p', { class: 'ob-hint', id: 'ob-name-hint' }, 'Only stored on this computer. You can change or remove it any time.');
    const previewLine = el('p', { class: 'ob-greeting' });
    const styles = el('div', { class: 'segmented', role: 'group', 'aria-label': 'Greeting style' });

    const update = () => {
      const raw = input.value;
      const clean = cleanName(raw);
      const invalid = /[<>{}]/.test(raw);
      input.setAttribute('aria-invalid', String(invalid));
      hint.textContent = invalid ? 'Rye leaves out < > { } in names.' : 'Only stored on this computer. You can change or remove it any time.';
      nameDraft = clean;
      // A steady preview: the rotating style shows its time-of-day line here.
      const id = { ...profile().identity, name: clean };
      if (id.greeting === 'rotating') id.greeting = 'time';
      const g = R.greeting({ ...profile(), identity: id, show: { ...profile().show, greeting: true } }) || [];
      previewLine.replaceChildren(...g.map((p) => (p.name ? el('span', { class: 'hello-name' }, p.text) : p.text)));
    };
    const renderStyles = () =>
      styles.replaceChildren(
        ...[['rotating', 'Changes each time'], ['time', 'Time of day'], ['hello', 'Hello']].map(([v, t]) =>
          el('button', {
            type: 'button',
            'aria-pressed': String(profile().identity.greeting === v),
            onclick: async () => {
              await commit((st, p) => (p.identity.greeting = v));
              renderStyles();
              update();
            },
          }, t),
        ),
      );
    input.addEventListener('input', update);
    input.addEventListener('keydown', (e) => e.key === 'Enter' && save());
    const save = async () => {
      await commit((st, p) => (p.identity.name = nameDraft));
      go(step + 1);
    };
    renderStyles();
    update();
    return {
      body: [...heading('What should Rye call you?', 'It shows up as a greeting on your new tab page.'), el('div', { class: 'ob-preview-card' }, previewLine), input, hint, el('div', { class: 'ob-row' }, el('span', { class: 'ob-label' }, 'Greeting'), styles)],
      foot: [back(), spacer(), el('button', {
        class: 'btn ghost', type: 'button', onclick: async () => {
          await commit((st, p) => (p.identity.name = ''));
          nameDraft = '';
          go(step + 1);
        },
      }, 'Skip'), next('Continue', save)],
    };
  }

  // 3 — Look
  function lookStep() {
    const p = profile();
    const dark = (id) => {
      const scheme = R.PRESETS[id].scheme;
      if (id === p.look.preset) return R.isDark(p.look);
      return scheme === 'system' ? R.isDark(p.look) : scheme === 'dark';
    };
    const cards = el(
      'div',
      { class: 'ob-presets', role: 'radiogroup', 'aria-label': 'Appearance' },
      ...Object.entries(R.PRESETS).map(([id, preset]) =>
        el(
          'button',
          {
            class: 'ob-preset',
            type: 'button',
            role: 'radio',
            'aria-checked': String(p.look.preset === id),
            onclick: async () => {
              await commit((st, pr) => {
                pr.look.preset = id;
                pr.look.scheme = preset.scheme;
                pr.look.accentMode = 'preset';
              });
              render();
            },
          },
          N().mini({ ...p.look, preset: id, accentMode: 'preset' }, dark(id)),
          el('span', { class: 'ob-preset-name' }, preset.name),
          el('span', { class: 'ob-preset-note' }, preset.note),
        ),
      ),
    );
    const mode = el(
      'div',
      { class: 'segmented', role: 'group', 'aria-label': 'Light or dark' },
      ...[['system', 'Match Windows'], ['light', 'Light'], ['dark', 'Dark']].map(([v, t]) =>
        el('button', {
          type: 'button',
          'aria-pressed': String(p.look.scheme === v),
          onclick: async () => {
            await commit((st, pr) => (pr.look.scheme = v));
            render();
          },
        }, t),
      ),
    );
    const note = R.browserBridgeAvailable() || R.capabilities.phone ? null : el('p', { class: 'ob-hint' }, 'Open this page in Rye to see the browser itself change.');
    return {
      body: [...heading('Choose your look', 'Each one recolors the whole browser: tabs, toolbar, menus and pages. You can fine-tune it later.'), cards, el('div', { class: 'ob-row' }, el('span', { class: 'ob-label' }, 'Mode'), mode), note],
      foot: [back(), spacer(), next()],
    };
  }

  // 4 — Preferences
  function prefsStep() {
    const p = profile();
    const toggle = (label, sub, on, apply) =>
      el(
        'div',
        { class: 'row ob-pref' },
        el('span', { class: 'row-text' }, el('span', { class: 'row-title' }, label), sub ? el('span', { class: 'row-sub' }, sub) : null),
        el('button', {
          class: 'toggle',
          type: 'button',
          role: 'switch',
          'aria-label': label,
          'aria-checked': String(on),
          onclick: async () => {
            await commit(apply);
            render();
          },
        }),
      );
    const engine = el('select', { class: 'field', id: 'ob-engine', 'aria-label': 'Search engine' }, ...Object.entries(R.ENGINES).map(([id, e]) => el('option', { value: id }, e.name)));
    engine.value = p.search.engine;
    engine.addEventListener('change', () => commit((st, pr) => (pr.search.engine = engine.value)));
    const layoutCard = (id, name, sub) =>
      el(
        'button',
        {
          class: 'ob-layout',
          type: 'button',
          role: 'radio',
          'aria-checked': String(p.layout.style === id),
          onclick: async () => {
            await commit((st, pr) => (pr.layout.style = id));
            render();
          },
        },
        el('span', { class: `ob-layout-art ${id}` }, el('i'), el('i'), el('b'), el('b'), el('b')),
        el('span', { class: 'ob-preset-name' }, name),
        el('span', { class: 'ob-preset-note' }, sub),
      );
    return {
      body: [
        ...heading('A few preferences', 'Sensible defaults are already set. Change only what you like.'),
        el('div', { class: 'ob-prefs' },
          el('div', { class: 'row ob-pref' }, el('span', { class: 'row-text' }, el('span', { class: 'row-title' }, 'New tab search'), el('span', { class: 'row-sub' }, 'Where the search box on this page sends you')), engine),
          R.capabilities.browserSettings ? toggle('Bookmarks bar', 'Below the address bar', p.layout.bookmarksBar, (st, pr) => (pr.layout.bookmarksBar = !pr.layout.bookmarksBar)) : null,
          toggle('Clock on new tabs', null, p.show.clock, (st, pr) => {
            pr.show.clock = !pr.show.clock;
            pr.show.date = pr.show.clock;
          }),
          R.capabilities.topSites ? toggle('Frequently visited sites', null, p.show.frequent, (st, pr) => (pr.show.frequent = !pr.show.frequent)) : null,
          R.capabilities.browserSettings ? toggle('Tabs in a sidebar', 'Vertical tabs down the side of the window', p.layout.sidebar, (st, pr) => (pr.layout.sidebar = !pr.layout.sidebar)) : null,
        ),
        el('div', { class: 'ob-layouts', role: 'radiogroup', 'aria-label': 'New tab layout' }, layoutCard('minimal', 'Minimal', 'Quiet and centered'), layoutCard('expressive', 'Expressive', 'A larger greeting, more room')),
      ],
      foot: [back(), spacer(), next()],
    };
  }

  // 5 — Done
  function doneStep() {
    const p = profile();
    const name = p.identity.name;
    const mark = el('div', { class: 'ob-mark done' });
    mark.innerHTML = RYE_MARK;
    const bits = [R.PRESETS[p.look.preset].name, { system: 'Matches Windows', light: 'Light', dark: 'Dark' }[p.look.scheme], R.ENGINES[p.search.engine].name, p.layout.style === 'expressive' ? 'Expressive' : 'Minimal'];
    return {
      body: [mark, ...heading(name ? `You’re all set, ${R.displayName(name)}.` : 'You’re all set.', 'Everything here can be changed later from Customize on any new tab.'), el('ul', { class: 'ob-summary' }, ...bits.map((b) => el('li', {}, b)))],
      foot: [back(), spacer(), next('Open Rye', finish)],
    };
  }

  function start() {
    if (N().preview) return;
    const wantsSetup = new URLSearchParams(location.search).has('setup');
    if (!N().state.onboarded || wantsSetup) open();
    if (wantsSetup) history.replaceState(null, '', location.pathname);
  }
  // The page may already be ready by the time this script runs.
  if (N()?.ready) start();
  else document.addEventListener('rye-ready', start, { once: true });

  document.addEventListener('keydown', (e) => {
    if ($('onboarding').hidden) return;
    if (e.key === 'Escape' && step === 0) finish();
  });

  window.RyeOnboarding = { open };
})();
