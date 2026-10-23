// Keyboard shortcuts are handled in the main process from every WebContents'
// before-input-event, so they work identically whether a page, the address bar
// or a menu has focus.
import type { Input } from 'electron';

const mac = process.platform === 'darwin';

export interface ShortcutDoc {
  keys: string;
  label: string;
  group: 'Tabs' | 'Navigation' | 'Page' | 'Window' | 'Browser';
}

function combo(input: Input): string {
  const primary = mac ? input.meta : input.control;
  const parts: string[] = [];
  if (primary) parts.push('Mod');
  if (mac && input.control) parts.push('Ctrl');
  if (input.alt) parts.push('Alt');
  if (input.shift) parts.push('Shift');
  let key = input.key;
  if (key.length === 1) key = key.toUpperCase();
  if (key === '+') key = '=';
  if (key === '_') key = '-';
  if (input.code === 'Equal') key = '=';
  if (input.code === 'Minus') key = '-';
  if (input.code === 'NumpadAdd') key = '=';
  if (input.code === 'NumpadSubtract') key = '-';
  if (/^Digit\d$/.test(input.code)) key = input.code.slice(5);
  if (/^Key[A-Z]$/.test(input.code) && (primary || input.alt)) key = input.code.slice(3);
  parts.push(key);
  return parts.join('+');
}

const MAP: Record<string, string> = {
  'Mod+T': 'new-tab',
  'Mod+N': 'new-window',
  'Mod+Shift+N': 'new-private',
  'Mod+W': 'close-tab',
  'Mod+F4': 'close-tab',
  'Mod+Shift+W': 'close-window',
  'Mod+Shift+T': 'reopen',
  'Mod+Tab': 'next-tab',
  'Mod+PageDown': 'next-tab',
  'Mod+Shift+Tab': 'prev-tab',
  'Mod+PageUp': 'prev-tab',
  'Mod+Alt+ArrowRight': 'next-tab',
  'Mod+Alt+ArrowLeft': 'prev-tab',
  'Mod+L': 'focus-address',
  'Alt+D': 'focus-address',
  F6: 'focus-address',
  'Mod+K': 'focus-search',
  'Mod+E': 'focus-search',
  'Mod+R': 'reload',
  F5: 'reload',
  'Mod+Shift+R': 'hard-reload',
  'Shift+F5': 'hard-reload',
  'Mod+F5': 'hard-reload',
  'Alt+ArrowLeft': 'back',
  'Alt+ArrowRight': 'forward',
  'Mod+[': 'back',
  'Mod+]': 'forward',
  'Alt+Home': 'home',
  'Mod+Shift+H': 'home',
  'Mod+F': 'find',
  'Mod+G': 'find-next',
  F3: 'find-next',
  'Mod+Shift+G': 'find-prev',
  'Shift+F3': 'find-prev',
  'Mod+D': 'bookmark',
  'Mod+Shift+B': 'toggle-bookmarks-bar',
  'Mod+Shift+O': 'bookmarks',
  'Mod+Y': mac ? 'history' : '',
  'Mod+H': mac ? '' : 'history',
  'Mod+J': 'downloads',
  'Mod+Shift+J': 'downloads',
  'Mod+,': 'settings',
  'Mod+=': 'zoom-in',
  'Mod+Shift+=': 'zoom-in',
  'Mod+-': 'zoom-out',
  'Mod+Shift+-': 'zoom-out',
  'Mod+0': 'zoom-reset',
  F11: 'fullscreen',
  'Mod+Ctrl+F': 'fullscreen',
  'Mod+P': 'print',
  'Mod+S': 'save-page',
  'Mod+U': 'view-source',
  F12: 'devtools',
  'Mod+Shift+I': 'devtools',
  'Mod+Alt+I': 'devtools',
  'Mod+Shift+E': 'toggle-sidebar',
  'Mod+Shift+Delete': 'clear-data',
  'Mod+Shift+Backspace': 'clear-data',
  'Mod+Shift+M': 'mute-tab',
  'Mod+Shift+Q': 'quit',
  'Mod+Q': mac ? 'quit' : '',
  'Mod+9': 'last-tab',
};

export function matchShortcut(input: Input): string | null {
  if (input.type !== 'keyDown') return null;
  const c = combo(input);
  if (/^Mod\+[1-8]$/.test(c)) return `tab:${Number(c.slice(-1)) - 1}`;
  return MAP[c] || null;
}

const M = mac ? '⌘' : 'Ctrl';
const S = mac ? '⇧' : 'Shift';
const A = mac ? '⌥' : 'Alt';
const j = (...k: string[]) => k.join(mac ? '' : '+');

export const SHORTCUT_DOCS: ShortcutDoc[] = [
  { group: 'Tabs', keys: j(M, 'T'), label: 'New tab' },
  { group: 'Tabs', keys: j(M, 'W'), label: 'Close tab' },
  { group: 'Tabs', keys: j(M, S, 'T'), label: 'Reopen closed tab' },
  { group: 'Tabs', keys: j(M, 'Tab'), label: 'Next tab' },
  { group: 'Tabs', keys: j(M, S, 'Tab'), label: 'Previous tab' },
  { group: 'Tabs', keys: j(M, '1–8'), label: 'Go to tab 1–8' },
  { group: 'Tabs', keys: j(M, '9'), label: 'Go to last tab' },
  { group: 'Tabs', keys: j(M, S, 'M'), label: 'Mute or unmute tab' },
  { group: 'Tabs', keys: 'Middle click', label: 'Close tab' },
  { group: 'Navigation', keys: j(M, 'L'), label: 'Focus address bar' },
  { group: 'Navigation', keys: j(M, 'K'), label: 'Search from address bar' },
  { group: 'Navigation', keys: j(A, '←'), label: 'Back' },
  { group: 'Navigation', keys: j(A, '→'), label: 'Forward' },
  { group: 'Navigation', keys: j(M, 'R'), label: 'Reload' },
  { group: 'Navigation', keys: j(M, S, 'R'), label: 'Reload without cache' },
  { group: 'Navigation', keys: 'Esc', label: 'Stop loading' },
  { group: 'Navigation', keys: j(A, 'Home'), label: 'Home page' },
  { group: 'Page', keys: j(M, 'F'), label: 'Find in page' },
  { group: 'Page', keys: j(M, 'G'), label: 'Find next' },
  { group: 'Page', keys: j(M, '+'), label: 'Zoom in' },
  { group: 'Page', keys: j(M, '−'), label: 'Zoom out' },
  { group: 'Page', keys: j(M, '0'), label: 'Reset zoom' },
  { group: 'Page', keys: j(M, 'P'), label: 'Print' },
  { group: 'Page', keys: j(M, 'S'), label: 'Save page' },
  { group: 'Page', keys: j(M, 'D'), label: 'Bookmark page' },
  { group: 'Page', keys: j(M, 'U'), label: 'View source' },
  { group: 'Page', keys: mac ? '⌥⌘I' : 'F12', label: 'Developer tools' },
  { group: 'Window', keys: j(M, 'N'), label: 'New window' },
  { group: 'Window', keys: j(M, S, 'N'), label: 'New private window' },
  { group: 'Window', keys: j(M, S, 'W'), label: 'Close window' },
  { group: 'Window', keys: mac ? '⌃⌘F' : 'F11', label: 'Full screen' },
  { group: 'Window', keys: j(M, S, 'E'), label: 'Collapse or expand sidebar' },
  { group: 'Window', keys: j(M, S, 'B'), label: 'Show or hide bookmarks bar' },
  { group: 'Browser', keys: mac ? '⌘Y' : j(M, 'H'), label: 'History' },
  { group: 'Browser', keys: j(M, 'J'), label: 'Downloads' },
  { group: 'Browser', keys: j(M, S, 'O'), label: 'Bookmark manager' },
  { group: 'Browser', keys: j(M, ','), label: 'Settings' },
  { group: 'Browser', keys: j(M, S, 'Del'), label: 'Clear browsing data' },
  { group: 'Browser', keys: mac ? '⌘Q' : j(M, S, 'Q'), label: 'Quit Rye' },
];
