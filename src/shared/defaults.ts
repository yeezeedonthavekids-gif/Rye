import type { AppearanceSettings, SearchEngine, Settings } from './types';

export const SETTINGS_VERSION = 1;

export const BUILT_IN_ENGINES: SearchEngine[] = [
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    keyword: 'ddg',
    url: 'https://duckduckgo.com/?q=%s',
    suggestUrl: 'https://duckduckgo.com/ac/?q=%s&type=list',
    builtIn: true,
  },
  {
    id: 'google',
    name: 'Google',
    keyword: 'g',
    url: 'https://www.google.com/search?q=%s',
    suggestUrl: 'https://suggestqueries.google.com/complete/search?client=firefox&q=%s',
    builtIn: true,
  },
  {
    id: 'bing',
    name: 'Bing',
    keyword: 'b',
    url: 'https://www.bing.com/search?q=%s',
    suggestUrl: 'https://api.bing.com/osjson.aspx?query=%s',
    builtIn: true,
  },
  {
    id: 'brave',
    name: 'Brave Search',
    keyword: 'br',
    url: 'https://search.brave.com/search?q=%s',
    suggestUrl: 'https://search.brave.com/api/suggest?q=%s',
    builtIn: true,
  },
  {
    id: 'startpage',
    name: 'Startpage',
    keyword: 'sp',
    url: 'https://www.startpage.com/do/search?q=%s',
    builtIn: true,
  },
  {
    id: 'ecosia',
    name: 'Ecosia',
    keyword: 'eco',
    url: 'https://www.ecosia.org/search?q=%s',
    suggestUrl: 'https://ac.ecosia.org/autocomplete?q=%s&type=list',
    builtIn: true,
  },
  {
    id: 'wikipedia',
    name: 'Wikipedia',
    keyword: 'w',
    url: 'https://en.wikipedia.org/wiki/Special:Search?search=%s',
    builtIn: true,
  },
];

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  preset: 'minimal',
  theme: 'system',
  accent: '#5b7fa6',
  tint: 'warm',
  density: 'comfortable',
  roundness: 60,
  tabShape: 'soft',
  tabSpacing: 40,
  tabLayout: 'horizontal',
  sidebarCollapsed: false,
  floatingPage: true,
  font: 'inter',
  fontScale: 'medium',
  motion: 'full',
  bookmarksBar: 'newtab',
  toolbarButtons: ['downloads'],
};

export interface Preset {
  id: string;
  name: string;
  description: string;
  values: Partial<AppearanceSettings>;
}

/** Presets only touch visual tokens; they never change layout choices the user made. */
export const PRESETS: Preset[] = [
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Warm neutrals, follows your system',
    values: { theme: 'system', accent: '#5b7fa6', tint: 'warm', roundness: 60, density: 'comfortable', tabShape: 'soft' },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep, quiet and compact',
    values: { theme: 'dark', accent: '#8b90e0', tint: 'cool', roundness: 50, density: 'compact', tabShape: 'quiet' },
  },
  {
    id: 'soft-light',
    name: 'Soft Light',
    description: 'Airy oat tones with a clay accent',
    values: { theme: 'light', accent: '#b9785b', tint: 'warm', roundness: 85, density: 'spacious', tabShape: 'pill' },
  },
  {
    id: 'frost',
    name: 'Frost',
    description: 'Cool, crisp and precise',
    values: { theme: 'light', accent: '#3f8fa6', tint: 'cool', roundness: 40, density: 'comfortable', tabShape: 'soft' },
  },
];

export const ACCENTS = ['#5b7fa6', '#3f8fa6', '#5f9a7a', '#a39250', '#b9785b', '#b5677a', '#8b72b8', '#8b90e0', '#6f7781'];

export const NTP_GRADIENTS = [
  'linear-gradient(160deg, #e9e1d6 0%, #d9dde3 100%)',
  'linear-gradient(160deg, #1d2230 0%, #2d2a3a 100%)',
  'linear-gradient(160deg, #dfe8ea 0%, #e9e4f0 100%)',
  'linear-gradient(160deg, #2a2420 0%, #3a3128 100%)',
  'linear-gradient(160deg, #e6ece4 0%, #f1e9dc 100%)',
  'linear-gradient(160deg, #182226 0%, #24343a 100%)',
];

export const NTP_COLORS = ['#efe9e1', '#e4e8ec', '#e8ece6', '#1b1c1f', '#1d222b', '#26211d'];

export function defaultSettings(): Settings {
  return {
    version: SETTINGS_VERSION,
    appearance: { ...DEFAULT_APPEARANCE, toolbarButtons: [...DEFAULT_APPEARANCE.toolbarButtons] },
    newTab: {
      background: { kind: 'theme' },
      showSearch: true,
      showShortcuts: true,
      showClock: false,
      showDate: false,
      showRecent: false,
      showBookmarks: false,
      shortcuts: [
        { id: 's1', title: 'Wikipedia', url: 'https://www.wikipedia.org' },
        { id: 's2', title: 'GitHub', url: 'https://github.com' },
        { id: 's3', title: 'YouTube', url: 'https://www.youtube.com' },
        { id: 's4', title: 'Hacker News', url: 'https://news.ycombinator.com' },
      ],
    },
    general: { startup: 'restore', homepage: 'rye://newtab', confirmQuitWithManyTabs: true },
    tabs: { openLinksInBackground: true, closeWindowWithLastTab: true, showHoverPreviewTitles: true, sleepInactiveMinutes: 0 },
    search: {
      engine: 'duckduckgo',
      engines: BUILT_IN_ENGINES.map((e) => ({ ...e })),
      suggestions: false,
      showHistorySuggestions: true,
      showBookmarkSuggestions: true,
      showTabSuggestions: true,
    },
    privacy: { sendGpc: true, clearOnExit: false, httpsFirst: true, saveHistory: true },
    downloads: { askWhere: false, directory: '', openPanelOnStart: true },
  };
}

export const INTERNAL_PAGES = ['newtab', 'settings', 'history', 'bookmarks', 'downloads', 'error', 'about'] as const;
export type InternalPage = (typeof INTERNAL_PAGES)[number];

export const INTERNAL_TITLES: Record<string, string> = {
  newtab: 'New Tab',
  settings: 'Settings',
  history: 'History',
  bookmarks: 'Bookmarks',
  downloads: 'Downloads',
  error: 'Page unavailable',
  about: 'About Rye',
};
