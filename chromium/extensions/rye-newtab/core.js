// Rye's shared personalization core: one source of truth for every Rye page.
//
// State lives in chrome.storage.local under "rye.v1" (localStorage when the
// page is opened outside Rye, for development). Browser-wide settings (accent,
// light/dark, surface tint, corner style, bookmarks bar, vertical tabs) are
// mirrored into Chromium's own prefs through chrome.settingsPrivate, which
// Rye's built-in pages are allowed to use; Rye's color code reads them.
'use strict';

(() => {
  const ext = typeof chrome !== 'undefined' && chrome.storage?.local ? chrome : null;
  const STATE_KEY = 'rye.v1';
  const bgKey = (profileId) => `rye.bg.${profileId}`;

  // ─── Catalogs ─────────────────────────────────────────────────────────────

  // surface: the tint Rye's surfaces are built from (null = warm neutrals).
  // accent: the default accent.
  const PRESETS = {
    rye: { name: 'Rye', note: 'Warm neutrals, quiet blue', surface: null, accent: null, accent2: '#9db48a', scheme: 'system' },
    midnight: { name: 'Midnight', note: 'Deep charcoal, muted blue', surface: '#1f2532', accent: '#86a3d0', accent2: '#9b8fd6', scheme: 'dark' },
    lavender: { name: 'Lavender', note: 'Soft purple, cool surfaces', surface: '#2b2536', accent: '#b8a1e8', accent2: '#e39cc4', scheme: 'dark' },
    ocean: { name: 'Ocean', note: 'Deep navy, bright cyan', surface: '#0f2542', accent: '#2fc6e0', accent2: '#5b8cf0', scheme: 'dark' },
    forest: { name: 'Forest', note: 'Dark green, natural highlights', surface: '#1b2c20', accent: '#8fc27e', accent2: '#d6c46a', scheme: 'dark' },
    sunset: { name: 'Sunset', note: 'Coral over plum', surface: '#33202f', accent: '#f2895f', accent2: '#f5b84a', scheme: 'dark' },
    softlight: { name: 'Soft Light', note: 'Warm white, gentle color', surface: '#f2e8dc', accent: '#d4694f', accent2: '#c9789f', scheme: 'light' },
  };

  const ACCENTS = [
    { name: 'Blue', value: '#6f93c9' },
    { name: 'Violet', value: '#a487e0' },
    { name: 'Cyan', value: '#2fb9d4' },
    { name: 'Green', value: '#7cb873' },
    { name: 'Coral', value: '#ef8a68' },
    { name: 'Amber', value: '#e3a43f' },
    { name: 'Rose', value: '#e07a9b' },
  ];

  const ENGINES = {
    default: { name: 'Address bar default', url: null },
    google: { name: 'Google', url: 'https://www.google.com/search?q=%s' },
    duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
    bing: { name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
    brave: { name: 'Brave Search', url: 'https://search.brave.com/search?q=%s' },
    startpage: { name: 'Startpage', url: 'https://www.startpage.com/do/search?q=%s' },
    ecosia: { name: 'Ecosia', url: 'https://www.ecosia.org/search?q=%s' },
  };

  // Local, generated backgrounds: no downloads.
  const svg = (body, w = 1600, h = 1000) =>
    `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' preserveAspectRatio='xMidYMid slice'>${body}</svg>`)}")`;
  const GALLERY = [
    { id: 'paper', name: 'Paper', tone: 'light', css: '#f1ece3' },
    { id: 'ink', name: 'Ink', tone: 'dark', css: '#15171b' },
    {
      id: 'ridgeline', name: 'Ridgeline', tone: 'dark',
      css: svg(`<rect width='1600' height='1000' fill='#d9a77f'/><rect y='330' width='1600' height='670' fill='#b98a83'/><circle cx='1290' cy='250' r='38' fill='#f3d6ab'/><path d='M0 640 L220 520 L390 600 L610 450 L820 580 L1010 470 L1240 590 L1430 500 L1600 560 V1000 H0Z' fill='#6d5a72'/><path d='M0 760 L180 650 L420 730 L640 610 L900 720 L1120 640 L1360 740 L1600 660 V1000 H0Z' fill='#4a3f57'/><path d='M0 880 L260 790 L520 860 L780 780 L1060 870 L1340 800 L1600 860 V1000 H0Z' fill='#2e2839'/>`),
    },
    {
      id: 'dunes', name: 'Dunes', tone: 'light',
      css: svg(`<rect width='1600' height='1000' fill='#f3e3cf'/><path d='M0 560 C300 470 520 620 820 540 S1350 460 1600 540 V1000 H0Z' fill='#e9cfae'/><path d='M0 700 C260 640 560 760 860 690 S1380 620 1600 700 V1000 H0Z' fill='#ddb98f'/><path d='M0 840 C320 790 600 890 920 830 S1400 790 1600 840 V1000 H0Z' fill='#cfa173'/>`),
    },
    {
      id: 'contours', name: 'Contours', tone: 'dark',
      css: svg(`<rect width='1600' height='1000' fill='#1d2228'/>${Array.from({ length: 14 }, (_, i) => `<ellipse cx='${1150 - i * 18}' cy='${360 + i * 10}' rx='${90 + i * 70}' ry='${60 + i * 46}' fill='none' stroke='#8fb6c9' stroke-opacity='${0.22 - i * 0.012}' stroke-width='2'/>`).join('')}`),
    },
    {
      id: 'dots', name: 'Dot grid', tone: 'light',
      css: `radial-gradient(circle at 1px 1px, rgba(60,50,40,.18) 1px, transparent 1.4px) 0 0 / 22px 22px, #f6f3ee`,
    },
    {
      id: 'ruled', name: 'Ruled', tone: 'light',
      css: `repeating-linear-gradient(transparent 0 31px, rgba(70,90,120,.13) 31px 32px), #f7f4ec`,
    },
  ];

  // Recognizable icons for common sites, shipped with Rye.
  const KNOWN_SITES = {
    'wikipedia.org': { icon: 'icons/sites/wikipedia.svg', color: '#d9d4cc' },
    'github.com': { icon: 'icons/sites/github.svg', color: '#9aa4b2' },
    'youtube.com': { icon: 'icons/sites/youtube.svg', color: '#ff3d3d' },
    'news.ycombinator.com': { icon: 'icons/sites/hackernews.svg', color: '#ff7a1a' },
  };
  const LETTER_COLORS = ['#e07a5f', '#81b29a', '#e3b55b', '#7aa2d6', '#b48ead', '#e5906b', '#5fb3ad', '#c77c9a'];

  // ─── Defaults ─────────────────────────────────────────────────────────────

  const uid = (p = 'x') => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  function defaultProfile(name = 'Personal') {
    return {
      id: uid('p'),
      label: name,
      identity: { name: '', greeting: 'rotating', custom: 'Hello, {name}.' },
      look: { preset: 'rye', scheme: 'system', accentMode: 'preset', accent: '#6f93c9', gradient: false, shape: 'rounded' },
      layout: {
        style: 'minimal', placement: 'center', searchWidth: 'regular', searchPosition: 'upper',
        shortcutStyle: 'tiles', spacing: 'normal', iconShape: 'auto', bookmarksBar: false, sidebar: false,
      },
      show: { greeting: true, search: true, shortcuts: true, clock: false, date: false, frequent: false, recent: false, bookmarks: false, note: false },
      search: { engine: 'default' },
      background: { kind: 'theme', value: '', dim: 25 },
      motion: 'full',
      note: '',
      shortcuts: [
        { id: 's1', title: 'Wikipedia', url: 'https://www.wikipedia.org/', icon: '', color: '', group: '' },
        { id: 's2', title: 'GitHub', url: 'https://github.com/', icon: '', color: '', group: '' },
        { id: 's3', title: 'YouTube', url: 'https://www.youtube.com/', icon: '', color: '', group: '' },
        { id: 's4', title: 'Hacker News', url: 'https://news.ycombinator.com/', icon: '', color: '', group: '' },
      ],
      groups: [],
    };
  }

  function defaultState() {
    const p = defaultProfile();
    return { version: 2, onboarded: false, active: p.id, profiles: [p] };
  }

  // ─── Validation ───────────────────────────────────────────────────────────
  // Everything read from storage or an imported file passes through here:
  // unknown keys are dropped, bad values fall back to defaults.

  const HEX = /^#[0-9a-f]{6}$/i;
  const oneOf = (v, list, d) => (list.includes(v) ? v : d);
  const bool = (v, d) => (typeof v === 'boolean' ? v : d);
  const str = (v, d, max = 200) => (typeof v === 'string' ? v.slice(0, max) : d);
  const hex = (v, d) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : d);
  const num = (v, d, min, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d);
  const IMAGE_DATA = /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i;

  function safeUrl(v) {
    if (typeof v !== 'string' || v.length > 2048) return null;
    try {
      const u = new URL(v);
      return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
    } catch {
      return null;
    }
  }

  function sanitizeProfile(raw, { keepId = true } = {}) {
    const d = defaultProfile();
    const r = raw && typeof raw === 'object' ? raw : {};
    const id = keepId && typeof r.id === 'string' && /^[a-z0-9]{1,40}$/i.test(r.id) ? r.id : d.id;
    const i = r.identity || {}, l = r.look || {}, y = r.layout || {}, s = r.show || {}, b = r.background || {};
    const groups = (Array.isArray(r.groups) ? r.groups : [])
      .filter((g) => g && typeof g.id === 'string' && /^[a-z0-9]{1,40}$/i.test(g.id))
      .slice(0, 12)
      .map((g) => ({ id: g.id, name: str(g.name, 'Collection', 40).trim() || 'Collection' }));
    const groupIds = new Set(groups.map((g) => g.id));
    const shortcuts = (Array.isArray(r.shortcuts) ? r.shortcuts : d.shortcuts)
      .map((x) => {
        const url = safeUrl(x?.url);
        if (!url) return null;
        return {
          id: typeof x.id === 'string' && /^[a-z0-9]{1,40}$/i.test(x.id) ? x.id : uid('s'),
          title: str(x.title, '', 60).trim() || hostOf(url),
          url,
          icon: typeof x.icon === 'string' && x.icon.length < 200_000 && IMAGE_DATA.test(x.icon) ? x.icon : '',
          color: hex(x.color, ''),
          group: groupIds.has(x.group) ? x.group : '',
        };
      })
      .filter(Boolean)
      .slice(0, 40);
    return {
      id,
      label: str(r.label, d.label, 40).trim() || d.label,
      identity: {
        name: str(i.name, '', 40).trim(),
        greeting: oneOf(i.greeting, ['rotating', 'time', 'hello', 'welcome', 'custom', 'none'], d.identity.greeting),
        custom: str(i.custom, d.identity.custom, 80),
      },
      look: {
        preset: oneOf(l.preset, Object.keys(PRESETS), d.look.preset),
        scheme: oneOf(l.scheme, ['system', 'light', 'dark'], d.look.scheme),
        accentMode: oneOf(l.accentMode, ['preset', 'custom', 'mono'], d.look.accentMode),
        accent: hex(l.accent, d.look.accent),
        gradient: false, // gradient accents were retired
        shape: oneOf(l.shape, ['soft', 'rounded', 'extra'], d.look.shape),
      },
      layout: {
        style: oneOf(y.style, ['minimal', 'expressive'], d.layout.style),
        placement: oneOf(y.placement, ['center', 'left'], d.layout.placement),
        searchWidth: oneOf(y.searchWidth, ['narrow', 'regular', 'wide'], d.layout.searchWidth),
        searchPosition: oneOf(y.searchPosition, ['upper', 'middle'], d.layout.searchPosition),
        shortcutStyle: oneOf(y.shortcutStyle, ['icons', 'compact', 'tiles'], d.layout.shortcutStyle),
        spacing: oneOf(y.spacing, ['tight', 'normal', 'airy'], d.layout.spacing),
        iconShape: oneOf(y.iconShape, ['auto', 'square', 'squircle', 'circle'], d.layout.iconShape),
        bookmarksBar: bool(y.bookmarksBar, d.layout.bookmarksBar),
        sidebar: bool(y.sidebar, d.layout.sidebar),
      },
      show: Object.fromEntries(Object.keys(d.show).map((k) => [k, bool(s[k], d.show[k])])),
      search: { engine: oneOf(r.search?.engine, Object.keys(ENGINES), d.search.engine) },
      background: {
        kind: oneOf(b.kind, ['theme', 'color', 'gallery', 'image'], d.background.kind),
        value: b.kind === 'color' ? hex(b.value, '#22201e') : b.kind === 'gallery' && GALLERY.some((g) => g.id === b.value) ? b.value : '',
        dim: num(b.dim, d.background.dim, 0, 70),
      },
      motion: oneOf(r.motion, ['full', 'reduced', 'none'], d.motion),
      note: str(r.note, '', 140),
      shortcuts,
      groups,
    };
  }

  function sanitizeState(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const profiles = (Array.isArray(r.profiles) ? r.profiles : []).slice(0, 8).map((p) => sanitizeProfile(p));
    const unique = profiles.filter((p, i) => profiles.findIndex((q) => q.id === p.id) === i);
    if (!unique.length) return defaultState();
    if (r.version === 1) {
      for (const p of unique) if (p.identity.greeting === 'time') p.identity.greeting = 'rotating';
    }
    return {
      version: 2,
      onboarded: bool(r.onboarded, false),
      active: unique.some((p) => p.id === r.active) ? r.active : unique[0].id,
      profiles: unique,
    };
  }

  // ─── Storage ──────────────────────────────────────────────────────────────

  async function rawGet(keys) {
    if (ext) return ext.storage.local.get(keys);
    const out = {};
    for (const k of keys) {
      const v = localStorage.getItem(k);
      if (v !== null) out[k] = JSON.parse(v);
    }
    return out;
  }

  async function rawSet(obj) {
    if (ext) return ext.storage.local.set(obj);
    for (const [k, v] of Object.entries(obj)) localStorage.setItem(k, JSON.stringify(v));
  }

  async function rawRemove(keys) {
    if (ext) return ext.storage.local.remove(keys);
    for (const k of keys) localStorage.removeItem(k);
  }

  // Preferences from Rye's first new tab page (v0.2) carry over.
  function migrateLegacy(legacy, legacyImage) {
    const state = defaultState();
    const p = state.profiles[0];
    if (Array.isArray(legacy.shortcuts)) p.shortcuts = legacy.shortcuts;
    p.show.clock = !!legacy.showClock;
    p.show.date = !!legacy.showDate;
    p.show.frequent = !!legacy.showFrequent;
    if (legacy.showSearch === false) p.show.search = false;
    if (legacy.showShortcuts === false) p.show.shortcuts = false;
    if (legacy.background?.kind === 'image' && legacyImage) p.background = { kind: 'image', value: '', dim: legacy.background.dim ?? 25 };
    state.onboarded = true; // they already used Rye; offer setup from Personalize instead
    return sanitizeState(state);
  }

  async function load() {
    try {
      const got = await rawGet([STATE_KEY, 'prefs', 'bgImage']);
      if (got[STATE_KEY]) return sanitizeState(got[STATE_KEY]);
      if (got.prefs) {
        const state = migrateLegacy(got.prefs, got.bgImage);
        if (got.bgImage) await rawSet({ [bgKey(state.active)]: got.bgImage });
        await rawSet({ [STATE_KEY]: state });
        await rawRemove(['prefs', 'bgImage']);
        return state;
      }
    } catch (e) {
      console.warn('Rye: settings could not be read, using defaults.', e);
    }
    return defaultState();
  }

  async function save(state) {
    await rawSet({ [STATE_KEY]: sanitizeState(state) });
  }

  const activeProfile = (state) => state.profiles.find((p) => p.id === state.active) || state.profiles[0];

  async function getImage(profileId) {
    const got = await rawGet([bgKey(profileId)]);
    const v = got[bgKey(profileId)];
    return typeof v === 'string' && IMAGE_DATA.test(v) ? v : null;
  }

  async function setImage(profileId, dataUrl) {
    if (dataUrl) await rawSet({ [bgKey(profileId)]: dataUrl });
    else await rawRemove([bgKey(profileId)]);
  }

  function onChange(callback) {
    if (ext) {
      ext.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && Object.keys(changes).some((k) => k === STATE_KEY || k.startsWith('rye.bg.'))) callback();
      });
    } else {
      addEventListener('storage', (e) => (e.key === STATE_KEY || e.key?.startsWith('rye.bg.')) && callback());
    }
  }

  // Resizes a picked photo to the screen and re-encodes it.
  async function encodeImage(file, maxSide, type = 'image/jpeg', quality = 0.86) {
    if (!file || !/^image\/(png|jpeg|webp|gif|avif|bmp)$/.test(file.type)) throw new Error('Choose a PNG, JPEG, WebP or GIF image.');
    if (file.size > 40 * 1024 * 1024) throw new Error('That image is larger than 40 MB.');
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL(type, quality);
  }

  // ─── Color ────────────────────────────────────────────────────────────────
  // Mirrors AddRyeColorMixer in chrome_color_mixers.cc so pages match the
  // browser around them.

  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

  function hexToHsl(h) {
    const n = parseInt(h.slice(1), 16);
    const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let hue = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: hue / 6, s, l };
  }

  function hslToHex({ h, s, l }) {
    const f = (n) => {
      const k = (n + h * 12) % 12;
      const a = s * Math.min(l, 1 - l);
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return `#${[f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
  }

  const rgba = (hexColor, a) => {
    const n = parseInt(hexColor.slice(1), 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  };

  function luminance(hexColor) {
    const n = parseInt(hexColor.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function accentOf(look, dark) {
    const preset = PRESETS[look.preset] || PRESETS.rye;
    if (look.accentMode === 'custom') return look.accent;
    return preset.accent || (dark ? '#7593b4' : '#5b7fa6');
  }

  function systemDark() {
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function isDark(look) {
    return look.scheme === 'dark' || (look.scheme === 'system' && systemDark());
  }

  function palette(look, dark = isDark(look)) {
    const preset = PRESETS[look.preset] || PRESETS.rye;
    const mono = look.accentMode === 'mono';
    const surface = preset.surface ? hexToHsl(preset.surface) : { h: 40 / 360, s: 0.07, l: 0.5 };
    if (mono) surface.s = 0;
    const tint = dark ? Math.min(surface.s, 0.6) : Math.min(surface.s * 0.55, 0.35);
    const tone = (l, k = 1) => hslToHex({ h: surface.h, s: clamp(tint * k), l });

    const a = hexToHsl(accentOf(look, dark));
    if (mono) a.s = 0;
    a.l = dark ? clamp(a.l, 0.62, 0.82) : clamp(a.l, 0.3, 0.5);
    const accent = hslToHex(a);
    const a2src = hexToHsl(look.accentMode === 'custom' ? hslToHex({ ...hexToHsl(look.accent), h: (hexToHsl(look.accent).h + 0.09) % 1 }) : preset.accent2 || accent);
    if (mono) a2src.s = 0;
    a2src.l = dark ? clamp(a2src.l, 0.6, 0.82) : clamp(a2src.l, 0.32, 0.52);
    const accent2 = hslToHex(a2src);
    const text = tone(dark ? 0.93 : 0.12, 0.3);
    return {
      dark,
      frame: tone(dark ? 0.105 : 0.925),
      sheet: tone(dark ? 0.125 : 0.995),
      base: tone(dark ? 0.14 : 0.975),
      raised: tone(dark ? 0.17 : 1.0),
      raised2: tone(dark ? 0.2 : 0.965),
      sunken: tone(dark ? 0.105 : 0.93),
      text,
      text2: tone(dark ? 0.72 : 0.38, 0.35),
      text3: tone(dark ? 0.55 : 0.55, 0.35),
      hairline: rgba(text, dark ? 0.09 : 0.1),
      hover: rgba(text, dark ? 0.065 : 0.055),
      press: rgba(text, dark ? 0.11 : 0.09),
      accent,
      accent2,
      onAccent: luminance(accent) > 0.35 ? '#141210' : '#ffffff',
      accentSoft: rgba(accent, dark ? 0.2 : 0.14),
      accentText: dark ? hslToHex({ ...a, l: clamp(a.l + 0.06, 0, 0.88) }) : hslToHex({ ...a, l: clamp(a.l - 0.06, 0.2, 1) }),
      scrim: dark ? 'rgba(0,0,0,.5)' : rgba(tone(0.12), 0.24),
    };
  }

  const SHAPES = {
    soft: { xs: 4, sm: 6, md: 8, lg: 11, xl: 14, ctl: 7, icon: 10 },
    rounded: { xs: 6, sm: 8, md: 11, lg: 15, xl: 20, ctl: 10, icon: 14 },
    extra: { xs: 8, sm: 12, md: 16, lg: 22, xl: 28, ctl: 999, icon: 19 },
  };

  // Writes the design tokens for a profile onto an element (usually <html>).
  function applyTokens(el, profile, { dark = isDark(profile.look) } = {}) {
    const p = palette(profile.look, dark);
    const shape = SHAPES[profile.look.shape] || SHAPES.rounded;
    const st = el.style;
    const set = (k, v) => st.setProperty(k, v);
    set('--frame', p.frame); set('--sheet', p.sheet); set('--base', p.base);
    set('--raised', p.raised); set('--raised-2', p.raised2); set('--sunken', p.sunken);
    set('--text', p.text); set('--text-2', p.text2); set('--text-3', p.text3);
    set('--hairline', p.hairline); set('--hover', p.hover); set('--press', p.press);
    set('--accent', p.accent); set('--accent-2', p.accent2); set('--on-accent', p.onAccent);
    set('--accent-soft', p.accentSoft); set('--accent-text', p.accentText); set('--scrim', p.scrim);
    set('--accent-fill', p.accent);
    for (const [k, v] of Object.entries(shape)) set(`--r-${k}`, `${v}px`);
    const iconR = { auto: `${shape.icon}px`, square: `${Math.max(4, shape.sm - 2)}px`, squircle: '32%', circle: '50%' }[profile.layout.iconShape];
    set('--r-tile', iconR);
    el.dataset.scheme = dark ? 'dark' : 'light';
    el.dataset.shape = profile.look.shape;
    el.dataset.motion = effectiveMotion(profile);
    return p;
  }

  function effectiveMotion(profile) {
    const osReduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (profile.motion === 'none') return 'none';
    return osReduced || profile.motion === 'reduced' ? 'reduced' : 'full';
  }

  // ─── Browser bridge ───────────────────────────────────────────────────────

  const settings = ext?.settingsPrivate?.setPref ? ext.settingsPrivate : null;
  const BROWSER_PREFS = {
    scheme: 'browser.theme.color_scheme2',
    accent: 'browser.theme.user_color2',
    mono: 'browser.theme.is_grayscale2',
    surface: 'rye.surface_color',
    shape: 'rye.shape',
    bookmarksBar: 'bookmark_bar.show_on_all_tabs',
    sidebar: 'vertical_tabs.enabled',
  };

  function browserValues(profile) {
    const look = profile.look;
    const preset = PRESETS[look.preset] || PRESETS.rye;
    const accentHex = look.accentMode === 'custom' ? look.accent : preset.accent;
    return {
      [BROWSER_PREFS.scheme]: { system: 0, light: 1, dark: 2 }[look.scheme],
      // Chromium stores the accent as a signed 32-bit ARGB color; 0 means
      // none, which gives Rye's default blue.
      [BROWSER_PREFS.accent]: look.accentMode !== 'mono' && accentHex ? (0xff000000 | parseInt(accentHex.slice(1), 16)) | 0 : 0,
      [BROWSER_PREFS.mono]: look.accentMode === 'mono',
      [BROWSER_PREFS.surface]: preset.surface ? parseInt(preset.surface.slice(1), 16) : 0,
      [BROWSER_PREFS.shape]: { soft: 0, rounded: 1, extra: 2 }[look.shape],
      [BROWSER_PREFS.bookmarksBar]: profile.layout.bookmarksBar,
      [BROWSER_PREFS.sidebar]: profile.layout.sidebar,
    };
  }

  function callSettings(fn, ...args) {
    return new Promise((resolve) => {
      try {
        const maybe = settings[fn](...args, (result) => {
          void chrome.runtime?.lastError;
          resolve(result);
        });
        if (maybe && typeof maybe.then === 'function') maybe.then(resolve, () => resolve(undefined));
      } catch {
        resolve(undefined);
      }
    });
  }

  // Returns the names of browser settings that changed.
  let applyChain = Promise.resolve();
  function applyToBrowser(profile) {
    if (!settings) return Promise.resolve(null);
    const wanted = browserValues(profile);
    applyChain = applyChain.then(async () => {
      const changed = [];
      for (const [name, value] of Object.entries(wanted)) {
        const current = await callSettings('getPref', name);
        if (current && current.value === value) continue;
        const ok = await callSettings('setPref', name, value, '');
        if (ok !== false) changed.push(name);
      }
      return changed;
    });
    return applyChain;
  }

  const browserBridgeAvailable = () => !!settings;

  // ─── Words ────────────────────────────────────────────────────────────────

  function partOfDay(date = new Date()) {
    const h = date.getHours();
    if (h >= 5 && h < 12) return 'Good morning';
    if (h >= 12 && h < 17) return 'Good afternoon';
    if (h >= 17 && h < 22) return 'Good evening';
    return 'Hello';
  }

  // Short lines for the "Changes each time" greeting. {name} is where the
  // name goes; without a name, ", {name}" is dropped.
  const LINES = {
    morning: ['Good morning, {name}.', 'Morning, {name}.', 'Up early, {name}?', 'A fresh start, {name}.', 'Coffee first, {name}?'],
    afternoon: ['Good afternoon, {name}.', 'Afternoon, {name}.', 'Back at it, {name}.', 'Hope it’s a good one, {name}.'],
    evening: ['Good evening, {name}.', 'Evening, {name}.', 'Winding down, {name}?', 'An easy evening, {name}?'],
    night: ['Still up, {name}?', 'A late one, {name}?', 'Quiet hours, {name}.', 'Burning the midnight oil, {name}?'],
    any: ['Welcome back, {name}.', 'Where to, {name}?', 'What’s next, {name}?', 'Hello again, {name}.', 'Nice to see you, {name}.'],
  };
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function linesFor(date) {
    const h = date.getHours();
    const part = h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 22 ? 'evening' : 'night';
    const day = date.getDay();
    const special = [];
    if (day === 1 && h < 17) special.push('A new week, {name}.');
    if (day === 5) special.push('Happy Friday, {name}.');
    if (day === 0 || day === 6) special.push(`Happy ${DAYS[day]}, {name}.`, `A slow ${DAYS[day]}, {name}?`);
    // Time of day weighs most; a few general lines keep it from repeating.
    return [...LINES[part], ...LINES[part], ...special, ...LINES.any];
  }

  // Names typed all in lowercase are shown with capitals ("jackson" → "Jackson").
  function displayName(name) {
    if (!name || name !== name.toLowerCase()) return name;
    return name.replace(/(^|[\s'-])(\p{Ll})/gu, (m, sep, ch) => sep + ch.toUpperCase());
  }

  // Splits a line into parts so pages can set the name on its own.
  function partsOf(line, name) {
    const text = name ? line : line.replace(/,?\s*\{name\}/g, '');
    if (!name) return [{ text }];
    return text.split(/(\{name\})/).filter(Boolean).map((t) => (t === '{name}' ? { text: name, name: true } : { text: t }));
  }

  // Returns the greeting as [{ text, name? }] parts, or null when hidden.
  // `random` picks a line for the rotating style; the same line isn't shown
  // twice in a row.
  function greeting(profile, { date = new Date(), random = Math.random, remember = false } = {}) {
    const { greeting: style, custom } = profile.identity;
    const name = displayName(profile.identity.name);
    if (!profile.show.greeting || style === 'none') return null;
    if (style === 'custom') {
      const text = (custom || '').trim();
      return text ? partsOf(text, name) : null;
    }
    if (style === 'hello') return partsOf('Hello, {name}.', name);
    if (style === 'welcome') return partsOf('Welcome back, {name}.', name);
    if (style === 'time') return partsOf(`${partOfDay(date)}, {name}.`, name);
    const lines = linesFor(date);
    let last = null;
    try {
      last = localStorage.getItem('rye.lastLine');
    } catch {
      /* no memory of the last line */
    }
    const choices = lines.filter((l) => l !== last);
    const line = choices[Math.floor(random() * choices.length)] || lines[0];
    if (remember) {
      try {
        localStorage.setItem('rye.lastLine', line);
      } catch {
        /* fine */
      }
    }
    return partsOf(line, name);
  }

  const greetingText = (parts) => (parts ? parts.map((p) => p.text).join('') : '');

  // ─── Sites ────────────────────────────────────────────────────────────────

  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  function knownSite(url) {
    const host = hostOf(url);
    for (const [domain, info] of Object.entries(KNOWN_SITES)) {
      if (host === domain || host.endsWith(`.${domain}`)) return info;
    }
    return null;
  }

  function letterColor(text) {
    let h = 0;
    for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return LETTER_COLORS[h % LETTER_COLORS.length];
  }

  // Icon sources to try in order; the page falls back to a letter.
  function iconSources(shortcut) {
    if (shortcut.icon) return [shortcut.icon];
    const known = knownSite(shortcut.url);
    if (known) return [known.icon];
    const out = [];
    try {
      const { origin } = new URL(shortcut.url);
      out.push(`${origin}/apple-touch-icon.png`, `${origin}/favicon.ico`);
    } catch {
      /* no network icon */
    }
    if (ext?.runtime?.getURL) out.push(ext.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(shortcut.url)}&size=64`));
    return out;
  }

  const siteColor = (shortcut) => shortcut.color || knownSite(shortcut.url)?.color || letterColor(hostOf(shortcut.url) || shortcut.title);

  // ─── Export / import ──────────────────────────────────────────────────────

  function exportProfile(profile) {
    const { id, note, ...rest } = profile;
    return JSON.stringify({ format: 'rye-appearance', version: 1, exported: new Date().toISOString(), profile: rest }, null, 2);
  }

  function importProfile(text, intoProfile) {
    if (typeof text !== 'string' || text.length > 2_000_000) throw new Error('That file is too large to be a Rye appearance file.');
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('That file isn’t valid JSON.');
    }
    if (!data || data.format !== 'rye-appearance' || data.version !== 1 || typeof data.profile !== 'object') {
      throw new Error('That isn’t a Rye appearance file.');
    }
    const merged = sanitizeProfile({ ...data.profile, id: intoProfile.id, note: intoProfile.note }, { keepId: true });
    // An imported image background can't come along; fall back to the theme.
    if (merged.background.kind === 'image') merged.background = { kind: 'theme', value: '', dim: merged.background.dim };
    return merged;
  }

  window.Rye = {
    PRESETS, ACCENTS, ENGINES, GALLERY, SHAPES,
    uid, defaultProfile, defaultState, sanitizeProfile, sanitizeState,
    load, save, activeProfile, getImage, setImage, onChange, encodeImage,
    palette, applyTokens, isDark, accentOf, hexToHsl, hslToHex, effectiveMotion,
    applyToBrowser, browserBridgeAvailable, browserValues,
    greeting, greetingText, displayName, partOfDay, hostOf, knownSite, iconSources, siteColor, safeUrl,
    exportProfile, importProfile,
  };
})();
