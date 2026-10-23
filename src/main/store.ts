// Small JSON persistence layer: atomic writes, debounced saves, corrupt-file recovery.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const pending = new Set<JsonStore<unknown>>();

export class JsonStore<T> {
  readonly file: string;
  data: T;
  private timer: NodeJS.Timeout | null = null;

  constructor(name: string, fallback: () => T, migrate?: (raw: any) => T) {
    this.file = path.join(app.getPath('userData'), `${name}.json`);
    this.data = this.load(fallback, migrate);
  }

  private load(fallback: () => T, migrate?: (raw: any) => T): T {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return migrate ? migrate(raw) : raw;
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        // Keep the unreadable file for inspection instead of silently overwriting it.
        try {
          fs.renameSync(this.file, `${this.file}.corrupt-${Date.now()}`);
        } catch {
          /* ignore */
        }
      }
      return fallback();
    }
  }

  /** Schedules a write. Rapid changes are coalesced. */
  save(delay = 400) {
    pending.add(this as JsonStore<unknown>);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), delay);
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    pending.delete(this as JsonStore<unknown>);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error(`[store] failed to write ${this.file}`, err);
    }
  }

  delete() {
    if (this.timer) clearTimeout(this.timer);
    pending.delete(this as JsonStore<unknown>);
    try {
      fs.rmSync(this.file, { force: true });
    } catch {
      /* ignore */
    }
  }
}

export function flushAllStores() {
  for (const s of [...pending]) s.flush();
}

export function uid(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
