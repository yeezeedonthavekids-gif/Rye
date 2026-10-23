import { app, shell, type DownloadItem, type Session } from 'electron';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type { DownloadEntry, DownloadSummary } from '../shared/types';
import { settings } from './settings';
import { JsonStore, uid } from './store';

const MAX_ENTRIES = 300;

function uniquePath(dir: string, filename: string): string {
  const safe = filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 200) || 'download';
  const ext = path.extname(safe);
  const base = safe.slice(0, safe.length - ext.length);
  let candidate = path.join(dir, safe);
  for (let i = 1; fs.existsSync(candidate) && i < 1000; i++) candidate = path.join(dir, `${base} (${i})${ext}`);
  return candidate;
}

class DownloadService extends EventEmitter {
  private store = new JsonStore<{ entries: DownloadEntry[] }>('downloads', () => ({ entries: [] }), (raw) => ({
    entries: Array.isArray(raw?.entries)
      ? raw.entries.map((e: DownloadEntry) => (e.state === 'progressing' || e.state === 'paused' ? { ...e, state: 'interrupted' as const } : e))
      : [],
  }));
  private items = new Map<string, DownloadItem>();
  private persistent = new WeakSet<Session>();
  private emitTimer: NodeJS.Timeout | null = null;
  unseen = 0;

  /** Attach to a session. Private sessions keep their downloads list in memory only. */
  attach(ses: Session, persist: boolean) {
    if (persist) this.persistent.add(ses);
    ses.on('will-download', (_event, item, wc) => this.track(ses, item, wc));
  }

  private track(ses: Session, item: DownloadItem, wc: Electron.WebContents) {
    const s = settings.get().downloads;
    if (!s.askWhere) {
      const dir = s.directory && fs.existsSync(s.directory) ? s.directory : app.getPath('downloads');
      item.setSavePath(uniquePath(dir, item.getFilename()));
    }
    const entry: DownloadEntry = {
      id: uid('d'),
      url: item.getURL(),
      filename: item.getFilename(),
      path: item.getSavePath(),
      state: 'progressing',
      received: 0,
      total: item.getTotalBytes(),
      started: Date.now(),
      mime: item.getMimeType(),
    };
    const persist = this.persistent.has(ses);
    this.items.set(entry.id, item);
    if (persist) this.store.data.entries.unshift(entry);
    else this.memoryOnly.unshift(entry);
    this.trim();

    item.on('updated', (_e, state) => {
      entry.path = item.getSavePath() || entry.path;
      entry.filename = entry.path ? path.basename(entry.path) : entry.filename;
      entry.received = item.getReceivedBytes();
      entry.total = item.getTotalBytes();
      entry.state = state === 'interrupted' ? 'interrupted' : item.isPaused() ? 'paused' : 'progressing';
      this.changed(false);
    });
    item.once('done', (_e, state) => {
      entry.received = item.getReceivedBytes();
      entry.path = item.getSavePath() || entry.path;
      entry.filename = entry.path ? path.basename(entry.path) : entry.filename;
      entry.state = state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'interrupted';
      this.items.delete(entry.id);
      if (state === 'completed') this.unseen++;
      if (persist) this.store.save();
      this.changed(true);
    });
    this.emit('started', entry, wc);
    this.changed(true);
  }

  /** Downloads started from private windows — never written to disk. */
  private memoryOnly: DownloadEntry[] = [];

  private trim() {
    if (this.store.data.entries.length > MAX_ENTRIES) this.store.data.entries.length = MAX_ENTRIES;
    this.store.save();
  }

  private changed(immediate: boolean) {
    if (immediate) {
      if (this.emitTimer) clearTimeout(this.emitTimer);
      this.emitTimer = null;
      this.emit('change');
      return;
    }
    // Progress updates are throttled so a fast download doesn't flood the UI.
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      this.emit('change');
    }, 250);
  }

  list(includePrivate: boolean): DownloadEntry[] {
    return includePrivate ? [...this.memoryOnly, ...this.store.data.entries].sort((a, b) => b.started - a.started) : this.store.data.entries;
  }

  summary(includePrivate: boolean): DownloadSummary {
    const active = this.list(includePrivate).filter((e) => e.state === 'progressing' || e.state === 'paused');
    const total = active.reduce((a, e) => a + (e.total || 0), 0);
    const received = active.reduce((a, e) => a + e.received, 0);
    return { active: active.length, progress: active.length && total ? received / total : active.length ? -1 : 0, recent: this.unseen };
  }

  hasAny(includePrivate: boolean) {
    return this.list(includePrivate).length > 0;
  }

  action(id: string, action: string) {
    const entry = [...this.memoryOnly, ...this.store.data.entries].find((e) => e.id === id);
    const item = this.items.get(id);
    switch (action) {
      case 'pause':
        item?.pause();
        break;
      case 'resume':
        if (item?.canResume()) item.resume();
        break;
      case 'cancel':
        item?.cancel();
        break;
      case 'open':
        if (entry?.state === 'completed' && entry.path && fs.existsSync(entry.path)) shell.openPath(entry.path);
        break;
      case 'show':
        if (entry?.path && fs.existsSync(entry.path)) shell.showItemInFolder(entry.path);
        else shell.openPath(path.dirname(entry?.path || app.getPath('downloads')));
        break;
      case 'remove':
        item?.cancel();
        this.store.data.entries = this.store.data.entries.filter((e) => e.id !== id);
        this.memoryOnly = this.memoryOnly.filter((e) => e.id !== id);
        this.store.save();
        break;
    }
    this.changed(true);
  }

  exists(entry: DownloadEntry) {
    return !!entry.path && fs.existsSync(entry.path);
  }

  clearFinished() {
    const keep = (e: DownloadEntry) => e.state === 'progressing' || e.state === 'paused';
    this.store.data.entries = this.store.data.entries.filter(keep);
    this.memoryOnly = this.memoryOnly.filter(keep);
    this.store.save();
    this.changed(true);
  }

  clearPrivate() {
    this.memoryOnly = this.memoryOnly.filter((e) => this.items.has(e.id));
  }

  markSeen() {
    if (!this.unseen) return;
    this.unseen = 0;
    this.changed(true);
  }

  flush() {
    this.store.flush();
  }
}

export const downloads = new DownloadService();
