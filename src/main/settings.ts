import { EventEmitter } from 'node:events';
import { defaultSettings, BUILT_IN_ENGINES, PRESETS } from '../shared/defaults';
import type { Settings } from '../shared/types';
import { JsonStore } from './store';

const ENUMS: Record<string, readonly string[]> = {
  'appearance.theme': ['system', 'light', 'dark'],
  'appearance.tint': ['warm', 'neutral', 'cool'],
  'appearance.density': ['compact', 'comfortable', 'spacious'],
  'appearance.tabShape': ['soft', 'pill', 'quiet'],
  'appearance.tabLayout': ['horizontal', 'vertical'],
  'appearance.font': ['inter', 'system', 'rounded'],
  'appearance.fontScale': ['small', 'medium', 'large'],
  'appearance.motion': ['full', 'reduced', 'off'],
  'appearance.bookmarksBar': ['always', 'newtab', 'never'],
  'general.startup': ['newtab', 'restore', 'homepage'],
};
const RANGES: Record<string, [number, number]> = {
  'appearance.roundness': [0, 100],
  'appearance.tabSpacing': [0, 100],
  'tabs.sleepInactiveMinutes': [0, 1440],
};
const TOOLBAR_BUTTONS = ['home', 'bookmarks', 'history', 'downloads', 'private'];
const HEX = /^#[0-9a-f]{6}$/i;

/** Deep-merges stored values over defaults, keeping only known keys with matching types. */
function merge(defaults: any, stored: any, prefix = ''): any {
  if (Array.isArray(defaults)) return Array.isArray(stored) ? stored : defaults;
  if (defaults === null || typeof defaults !== 'object') {
    const key = prefix.slice(0, -1);
    if (typeof stored !== typeof defaults) return defaults;
    if (ENUMS[key] && !ENUMS[key].includes(stored)) return defaults;
    if (RANGES[key]) return Math.min(RANGES[key][1], Math.max(RANGES[key][0], Number(stored) || 0));
    return stored;
  }
  const out: any = {};
  for (const k of Object.keys(defaults)) {
    out[k] = merge(defaults[k], stored && typeof stored === 'object' ? stored[k] : undefined, `${prefix}${k}.`);
  }
  // Objects with free-form shapes.
  if (prefix === 'newTab.' && stored?.background && typeof stored.background === 'object') out.background = stored.background;
  return out;
}

function sanitize(s: Settings): Settings {
  if (!HEX.test(s.appearance.accent)) s.appearance.accent = defaultSettings().appearance.accent;
  s.appearance.toolbarButtons = s.appearance.toolbarButtons.filter((b) => TOOLBAR_BUTTONS.includes(b));
  if (s.appearance.preset && !PRESETS.some((p) => p.id === s.appearance.preset)) s.appearance.preset = null;
  const bg = s.newTab.background as any;
  if (!bg || !['theme', 'color', 'gradient', 'image'].includes(bg.kind)) s.newTab.background = { kind: 'theme' };
  s.newTab.shortcuts = s.newTab.shortcuts
    .filter((x: any) => x && typeof x.url === 'string' && typeof x.title === 'string')
    .slice(0, 40)
    .map((x: any) => ({ id: String(x.id ?? Math.random()), title: x.title.slice(0, 120), url: x.url.slice(0, 2048), icon: typeof x.icon === 'string' ? x.icon : undefined }));
  // Engines: keep built-ins up to date, keep valid custom ones.
  const custom = s.search.engines.filter((e: any) => e && !e.builtIn && typeof e.url === 'string' && e.url.includes('%s'));
  s.search.engines = [...BUILT_IN_ENGINES.map((e) => ({ ...e })), ...custom];
  if (!s.search.engines.some((e) => e.id === s.search.engine)) s.search.engine = 'duckduckgo';
  return s;
}

class SettingsService extends EventEmitter {
  private store = new JsonStore<Settings>('settings', defaultSettings, (raw) => sanitize(merge(defaultSettings(), raw)));

  get(): Settings {
    return this.store.data;
  }

  /** Sets a value by dotted path, validating it against the defaults' shape. */
  set(path: string, value: unknown): boolean {
    if (typeof path !== 'string' || !/^[a-zA-Z.]+$/.test(path)) return false;
    const keys = path.split('.');
    const defaults: any = defaultSettings();
    let d = defaults;
    for (const k of keys) {
      if (d == null || typeof d !== 'object' || !(k in d)) return false;
      d = d[k];
    }
    const draft: any = structuredClone(this.store.data);
    let t = draft;
    for (const k of keys.slice(0, -1)) t = t[k];
    t[keys[keys.length - 1]] = value;
    const next = sanitize(merge(defaults, draft));
    // A manual visual change detaches the appearance from its preset.
    if (path.startsWith('appearance.') && path !== 'appearance.preset' && this.isPresetKey(keys[1])) next.appearance.preset = null;
    this.store.data = next;
    this.store.save();
    this.emit('change', next, path);
    return true;
  }

  applyPreset(id: string) {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    const next = structuredClone(this.store.data);
    next.appearance = { ...next.appearance, ...preset.values, preset: id };
    this.store.data = sanitize(merge(defaultSettings(), next));
    this.store.save();
    this.emit('change', this.store.data, 'appearance.preset');
  }

  reset(section: keyof Settings | 'all') {
    const d = defaultSettings();
    if (section === 'all') this.store.data = d;
    else if (section in d && section !== 'version') (this.store.data as any)[section] = (d as any)[section];
    this.store.save();
    this.emit('change', this.store.data, String(section));
  }

  private isPresetKey(key: string) {
    return PRESETS.some((p) => key in p.values);
  }

  flush() {
    this.store.flush();
  }
}

export const settings = new SettingsService();
