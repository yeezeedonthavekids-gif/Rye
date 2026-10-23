import { EventEmitter } from 'node:events';
import type { HistoryVisit } from '../shared/types';
import { JsonStore, uid } from './store';

const MAX_VISITS = 25000;

export interface UrlStat {
  url: string;
  title: string;
  favicon?: string;
  visits: number;
  last: number;
}

class HistoryService extends EventEmitter {
  private store = new JsonStore<{ visits: HistoryVisit[] }>('history', () => ({ visits: [] }), (raw) => ({
    visits: Array.isArray(raw?.visits) ? raw.visits.filter((v: any) => v && typeof v.url === 'string') : [],
  }));
  private stats: Map<string, UrlStat> | null = null;

  add(url: string, title: string, favicon?: string) {
    if (!/^https?:|^file:/.test(url)) return;
    const visits = this.store.data.visits;
    const last = visits[visits.length - 1];
    const now = Date.now();
    // A reload or redirect to the same URL within a short window is not a new visit.
    if (last && last.url === url && now - last.time < 30_000) {
      last.title = title || last.title;
      last.time = now;
    } else {
      visits.push({ id: uid('v'), url, title: title || url, favicon, time: now });
      if (visits.length > MAX_VISITS) visits.splice(0, visits.length - MAX_VISITS);
    }
    this.stats = null;
    this.store.save(1500);
    this.emit('change');
  }

  updateTitle(url: string, title: string, favicon?: string) {
    const visits = this.store.data.visits;
    for (let i = visits.length - 1; i >= Math.max(0, visits.length - 20); i--) {
      if (visits[i].url === url) {
        if (title) visits[i].title = title;
        if (favicon) visits[i].favicon = favicon;
        this.stats = null;
        this.store.save(1500);
        return;
      }
    }
  }

  /** Aggregated per-URL statistics, rebuilt lazily after changes. */
  getStats(): Map<string, UrlStat> {
    if (this.stats) return this.stats;
    const map = new Map<string, UrlStat>();
    for (const v of this.store.data.visits) {
      const s = map.get(v.url);
      if (s) {
        s.visits++;
        s.last = v.time;
        if (v.title) s.title = v.title;
        if (v.favicon) s.favicon = v.favicon;
      } else map.set(v.url, { url: v.url, title: v.title, favicon: v.favicon, visits: 1, last: v.time });
    }
    this.stats = map;
    return map;
  }

  query(text: string, limit = 300, before?: number): HistoryVisit[] {
    const q = text.trim().toLowerCase();
    const out: HistoryVisit[] = [];
    const visits = this.store.data.visits;
    for (let i = visits.length - 1; i >= 0 && out.length < limit; i--) {
      const v = visits[i];
      if (before && v.time >= before) continue;
      if (!q || v.url.toLowerCase().includes(q) || v.title.toLowerCase().includes(q)) out.push(v);
    }
    return out;
  }

  recent(limit: number): UrlStat[] {
    const seen = new Set<string>();
    const out: UrlStat[] = [];
    const stats = this.getStats();
    const visits = this.store.data.visits;
    for (let i = visits.length - 1; i >= 0 && out.length < limit; i--) {
      const v = visits[i];
      if (seen.has(v.url)) continue;
      seen.add(v.url);
      out.push(stats.get(v.url)!);
    }
    return out;
  }

  frequent(limit: number): UrlStat[] {
    const now = Date.now();
    return [...this.getStats().values()]
      .map((s) => ({ s, score: s.visits / (1 + (now - s.last) / 86_400_000 / 7) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.s);
  }

  remove(ids: string[]) {
    const set = new Set(ids);
    this.store.data.visits = this.store.data.visits.filter((v) => !set.has(v.id));
    this.stats = null;
    this.store.save();
    this.emit('change');
  }

  removeUrl(url: string) {
    this.store.data.visits = this.store.data.visits.filter((v) => v.url !== url);
    this.stats = null;
    this.store.save();
    this.emit('change');
  }

  clear(since = 0) {
    this.store.data.visits = since ? this.store.data.visits.filter((v) => v.time < since) : [];
    this.stats = null;
    this.store.save(0);
    this.emit('change');
  }

  flush() {
    this.store.flush();
  }
}

export const history = new HistoryService();
