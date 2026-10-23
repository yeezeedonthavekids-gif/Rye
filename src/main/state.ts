// App-wide browsing state: session restoration and recently closed tabs.
import type { SavedEntry } from './tab';
import { JsonStore } from './store';

export interface SavedTab {
  url: string;
  title: string;
  pinned: boolean;
  favicon?: string | null;
  entries: SavedEntry[];
  index: number;
}

export interface SavedWindow {
  tabs: SavedTab[];
  active: number;
  bounds?: { x: number; y: number; width: number; height: number };
  maximized?: boolean;
}

export interface ClosedTab extends SavedTab {
  windowId: number;
  position: number;
  closedAt: number;
}

const sessionStore = new JsonStore<{ windows: SavedWindow[] }>('session', () => ({ windows: [] }), (raw) => ({
  windows: Array.isArray(raw?.windows)
    ? raw.windows
        .filter((w: any) => w && Array.isArray(w.tabs))
        .map((w: any) => ({ ...w, tabs: w.tabs.filter((t: any) => t && typeof t.url === 'string') }))
    : [],
}));

export function savedSession(): SavedWindow[] {
  return sessionStore.data.windows.filter((w) => w.tabs.length);
}

export function writeSession(windows: SavedWindow[], immediate = false) {
  sessionStore.data.windows = windows;
  if (immediate) sessionStore.flush();
  else sessionStore.save(1200);
}

const MAX_CLOSED = 25;
const closed: ClosedTab[] = [];

export function pushClosed(tab: ClosedTab) {
  if (tab.url.startsWith('rye://newtab') && tab.entries.length <= 1) return;
  closed.push(tab);
  if (closed.length > MAX_CLOSED) closed.shift();
}

export function popClosed(): ClosedTab | undefined {
  return closed.pop();
}

export function recentlyClosed(): ClosedTab[] {
  return [...closed].reverse();
}

export function takeClosed(index: number): ClosedTab | undefined {
  const i = closed.length - 1 - index;
  if (i < 0 || i >= closed.length) return undefined;
  return closed.splice(i, 1)[0];
}

export function hasClosed() {
  return closed.length > 0;
}

export function clearClosed() {
  closed.length = 0;
}
