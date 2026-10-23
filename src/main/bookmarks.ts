import { EventEmitter } from 'node:events';
import type { Bookmark, BookmarkTree } from '../shared/types';
import { JsonStore, uid } from './store';

const BAR = 'bar';
const OTHER = 'other';

function fallback(): BookmarkTree {
  const now = Date.now();
  return {
    barId: BAR,
    otherId: OTHER,
    items: [
      { id: BAR, type: 'folder', title: 'Bookmarks bar', parentId: null, created: now },
      { id: OTHER, type: 'folder', title: 'Other bookmarks', parentId: null, created: now },
    ],
  };
}

class BookmarkService extends EventEmitter {
  private store = new JsonStore<BookmarkTree>('bookmarks', fallback, (raw) => {
    if (!raw || !Array.isArray(raw.items)) return fallback();
    const t = fallback();
    const items = raw.items.filter((b: any) => b && typeof b.id === 'string' && (b.type === 'folder' || typeof b.url === 'string'));
    for (const root of t.items) if (!items.some((b: Bookmark) => b.id === root.id)) items.unshift(root);
    return { ...t, items };
  });

  tree(): BookmarkTree {
    return this.store.data;
  }

  findByUrl(url: string): Bookmark | undefined {
    return this.store.data.items.find((b) => b.type === 'bookmark' && b.url === url);
  }

  get(id: string) {
    return this.store.data.items.find((b) => b.id === id);
  }

  children(parentId: string) {
    return this.store.data.items.filter((b) => b.parentId === parentId);
  }

  add(input: { title: string; url?: string; parentId?: string; type?: 'bookmark' | 'folder'; favicon?: string; index?: number }): Bookmark {
    const parentId = input.parentId && this.get(input.parentId)?.type === 'folder' ? input.parentId : BAR;
    const b: Bookmark = {
      id: uid('b'),
      type: input.type ?? 'bookmark',
      title: String(input.title ?? '').slice(0, 500) || (input.type === 'folder' ? 'New folder' : input.url ?? ''),
      url: input.type === 'folder' ? undefined : String(input.url ?? '').slice(0, 4096),
      parentId,
      favicon: input.favicon,
      created: Date.now(),
    };
    this.insert(b, input.index);
    this.changed();
    return b;
  }

  private insert(b: Bookmark, index?: number) {
    const items = this.store.data.items;
    if (index === undefined) {
      items.push(b);
      return;
    }
    const siblings = items.filter((x) => x.parentId === b.parentId);
    const target = siblings[index];
    if (!target) items.push(b);
    else items.splice(items.indexOf(target), 0, b);
  }

  update(id: string, patch: { title?: string; url?: string; parentId?: string }) {
    const b = this.get(id);
    if (!b || b.parentId === null) return;
    if (typeof patch.title === 'string') b.title = patch.title.slice(0, 500);
    if (typeof patch.url === 'string' && b.type === 'bookmark') b.url = patch.url.slice(0, 4096);
    if (typeof patch.parentId === 'string' && patch.parentId !== b.id && this.get(patch.parentId)?.type === 'folder' && !this.isDescendant(patch.parentId, b.id)) {
      b.parentId = patch.parentId;
    }
    this.changed();
  }

  move(id: string, parentId: string, index: number) {
    const items = this.store.data.items;
    const b = this.get(id);
    if (!b || b.parentId === null || this.get(parentId)?.type !== 'folder' || this.isDescendant(parentId, id) || parentId === id) return;
    items.splice(items.indexOf(b), 1);
    b.parentId = parentId;
    this.insert(b, index);
    this.changed();
  }

  private isDescendant(nodeId: string, ancestorId: string): boolean {
    let cur = this.get(nodeId);
    while (cur) {
      if (cur.id === ancestorId) return true;
      cur = cur.parentId ? this.get(cur.parentId) : undefined;
    }
    return false;
  }

  remove(id: string) {
    const b = this.get(id);
    if (!b || b.parentId === null) return;
    const doomed = new Set<string>([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const x of this.store.data.items) if (x.parentId && doomed.has(x.parentId) && !doomed.has(x.id)) (doomed.add(x.id), (grew = true));
    }
    this.store.data.items = this.store.data.items.filter((x) => !doomed.has(x.id));
    this.changed();
  }

  /** Imports a Netscape bookmark HTML file (the format every major browser exports). */
  importHtml(html: string): number {
    const root = this.add({ type: 'folder', title: `Imported ${new Date().toLocaleDateString()}`, parentId: OTHER });
    const stack: string[] = [root.id];
    let count = 0;
    let lastFolder: string | null = null;
    const re = /<DT><H3[^>]*>([\s\S]*?)<\/H3>|<DT><A\s([^>]*)>([\s\S]*?)<\/A>|<DL>|<\/DL>/gi;
    const decode = (s: string) =>
      s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
    let m: RegExpExecArray | null;
    let depth = 0;
    while ((m = re.exec(html))) {
      const tok = m[0].toUpperCase();
      if (m[1] !== undefined) {
        const f = this.addSilently({ type: 'folder', title: decode(m[1]), parentId: stack[stack.length - 1] });
        lastFolder = f.id;
      } else if (m[2] !== undefined) {
        const href = /HREF="([^"]*)"/i.exec(m[2])?.[1];
        if (href && /^(https?|file|ftp):/i.test(href)) {
          this.addSilently({ type: 'bookmark', title: decode(m[3]) || href, url: decode(href), parentId: stack[stack.length - 1] });
          count++;
        }
      } else if (tok === '<DL>') {
        depth++;
        // The outermost <DL> belongs to the import root itself.
        if (depth > 1) stack.push(lastFolder ?? stack[stack.length - 1]);
        lastFolder = null;
      } else if (tok === '</DL>') {
        if (depth > 1) stack.pop();
        depth--;
      }
    }
    this.changed();
    return count;
  }

  private addSilently(input: { title: string; url?: string; parentId: string; type: 'bookmark' | 'folder' }): Bookmark {
    const b: Bookmark = { id: uid('b'), type: input.type, title: input.title.slice(0, 500) || 'Untitled', url: input.url, parentId: input.parentId, created: Date.now() };
    this.store.data.items.push(b);
    return b;
  }

  exportHtml(): string {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const walk = (parentId: string, indent: string): string =>
      this.children(parentId)
        .map((b) =>
          b.type === 'folder'
            ? `${indent}<DT><H3>${esc(b.title)}</H3>\n${indent}<DL><p>\n${walk(b.id, indent + '    ')}${indent}</DL><p>\n`
            : `${indent}<DT><A HREF="${esc(b.url ?? '')}" ADD_DATE="${Math.floor(b.created / 1000)}">${esc(b.title)}</A>\n`,
        )
        .join('');
    return `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n    <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>\n    <DL><p>\n${walk(BAR, '        ')}    </DL><p>\n${walk(OTHER, '    ')}</DL><p>\n`;
  }

  private changed() {
    this.store.save();
    this.emit('change', this.store.data);
  }

  flush() {
    this.store.flush();
  }
}

export const bookmarks = new BookmarkService();
