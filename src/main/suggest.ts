// Address bar suggestions. Local sources (tabs, bookmarks, history, internal pages)
// never leave the device; remote engine suggestions are opt-in.
import { net } from 'electron';
import { INTERNAL_TITLES } from '../shared/defaults';
import type { Suggestion } from '../shared/types';
import { buildSearchUrl, displayUrl, looksLikeUrl, resolveInput } from '../shared/url';
import { bookmarks } from './bookmarks';
import { history } from './history';
import { settings } from './settings';

const MAX = 7;

function score(text: string, url: string, title: string): number {
  const q = text.toLowerCase();
  const u = url.toLowerCase().replace(/^https?:\/\/(www\.)?/, '');
  const t = title.toLowerCase();
  if (u.startsWith(q)) return 3;
  const host = u.split('/')[0];
  if (host.split('.').some((part) => part.startsWith(q))) return 2.4;
  if (t.startsWith(q)) return 2;
  const words = q.split(/\s+/).filter(Boolean);
  if (words.every((w) => t.includes(w) || u.includes(w))) return 1;
  return 0;
}

export interface SuggestResult {
  items: Suggestion[];
  inline: string | null;
}

export function localSuggestions(text: string, openTabs: { id: number; title: string; url: string; favicon: string | null }[], isPrivate: boolean): SuggestResult {
  const s = settings.get().search;
  const input = text.trim();
  if (!input) return { items: [], inline: null };
  const engine = s.engines.find((e) => e.id === s.engine) ?? s.engines[0];
  const items: Suggestion[] = [];
  const seen = new Set<string>();
  const push = (x: Suggestion) => {
    const key = x.url.replace(/\/$/, '');
    if (seen.has(key)) return;
    seen.add(key);
    items.push(x);
  };

  // "@" shows engine keywords.
  if (/^@\S*$/.test(input)) {
    const kw = input.slice(1).toLowerCase();
    for (const e of s.engines.filter((e) => e.keyword.toLowerCase().startsWith(kw) || e.name.toLowerCase().startsWith(kw)).slice(0, MAX)) {
      push({ kind: 'engine', title: e.name, url: `@${e.keyword} `, detail: `@${e.keyword}`, engineId: e.id });
    }
    return { items, inline: null };
  }

  const resolved = resolveInput(input, s.engines, s.engine, settings.get().privacy.httpsFirst);
  if (resolved.isSearch) {
    const target = s.engines.find((e) => e.id === resolved.engineId) ?? engine;
    const query = input.startsWith('@') ? input.replace(/^@\S+\s+/, '') : input;
    push({ kind: 'search', title: query, url: resolved.url, detail: `${target.name}`, engineId: target.id });
  } else {
    push({ kind: 'url', title: displayUrl(resolved.url), url: resolved.url, detail: 'Open' });
  }

  type Cand = Suggestion & { score: number };
  const cands: Cand[] = [];
  if (s.showTabSuggestions) {
    for (const t of openTabs) {
      const sc = score(input, t.url, t.title);
      if (sc > 0 && !t.url.startsWith('rye://newtab')) cands.push({ kind: 'tab', title: t.title, url: t.url, detail: 'Switch to tab', favicon: t.favicon ?? undefined, tabId: t.id, score: sc + 0.6 });
    }
  }
  if (s.showBookmarkSuggestions) {
    for (const b of bookmarks.tree().items) {
      if (b.type !== 'bookmark' || !b.url) continue;
      const sc = score(input, b.url, b.title);
      if (sc > 0) cands.push({ kind: 'bookmark', title: b.title, url: b.url, detail: displayUrl(b.url), score: sc + 0.5 });
    }
  }
  let inline: string | null = null;
  if (s.showHistorySuggestions && !isPrivate) {
    const now = Date.now();
    const stats = [...history.getStats().values()];
    for (const h of stats) {
      const sc = score(input, h.url, h.title);
      if (sc <= 0) continue;
      const frecency = Math.log2(1 + h.visits) / (1 + (now - h.last) / 86_400_000 / 14);
      cands.push({ kind: 'history', title: h.title, url: h.url, detail: displayUrl(h.url), favicon: h.favicon, score: sc + Math.min(1.5, frecency) });
    }
    // Inline-complete hosts the user visits, e.g. "git" → "github.com".
    if (!/\s|\//.test(input) && input.length >= 2) {
      const q = input.toLowerCase();
      let best: { host: string; visits: number } | null = null;
      const hosts = new Map<string, number>();
      for (const h of stats) {
        const host = h.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0].toLowerCase();
        if (host.startsWith(q)) hosts.set(host, (hosts.get(host) ?? 0) + h.visits);
      }
      for (const [host, visits] of hosts) if (!best || visits > best.visits) best = { host, visits };
      if (best && best.host !== q) inline = best.host;
    }
  }
  for (const [page, title] of Object.entries(INTERNAL_TITLES)) {
    if (page === 'error' || page === 'newtab') continue;
    if (page.startsWith(input.toLowerCase()) || title.toLowerCase().startsWith(input.toLowerCase()) || `rye://${page}`.startsWith(input.toLowerCase())) {
      cands.push({ kind: 'internal', title, url: `rye://${page}`, detail: `rye://${page}`, score: input.length >= 3 ? 2.2 : 0.9 });
    }
  }
  // An open tab replaces history or bookmark entries for the same page.
  const tabUrls = new Set(cands.filter((c) => c.kind === 'tab').map((c) => c.url));
  for (let i = cands.length - 1; i >= 0; i--) if (cands[i].kind !== 'tab' && tabUrls.has(cands[i].url)) cands.splice(i, 1);
  cands.sort((a, b) => b.score - a.score);
  for (const c of cands) {
    if (items.length >= MAX) break;
    const { score: _s, ...rest } = c;
    push(rest);
  }
  return { items, inline };
}

let controller: AbortController | null = null;

/** Fetches engine suggestions. Only called when the user enabled them in Settings. */
export async function remoteSuggestions(text: string, isPrivate: boolean): Promise<Suggestion[]> {
  const s = settings.get().search;
  if (!s.suggestions || isPrivate) return [];
  const input = text.trim();
  if (!input || input.length > 200 || looksLikeUrl(input) || input.startsWith('@')) return [];
  const engine = s.engines.find((e) => e.id === s.engine);
  if (!engine?.suggestUrl) return [];
  controller?.abort();
  const ctrl = new AbortController();
  controller = ctrl;
  const timeout = setTimeout(() => ctrl.abort(), 1500);
  try {
    const res = await net.fetch(engine.suggestUrl.replace('%s', encodeURIComponent(input)), { signal: ctrl.signal, credentials: 'omit' } as RequestInit);
    if (!res.ok) return [];
    const data = await res.json();
    const list: string[] = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
    return list
      .filter((x) => typeof x === 'string' && x.toLowerCase() !== input.toLowerCase())
      .slice(0, 4)
      .map((q) => ({ kind: 'search' as const, title: q, url: buildSearchUrl(engine, q), detail: engine.name, engineId: engine.id }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
