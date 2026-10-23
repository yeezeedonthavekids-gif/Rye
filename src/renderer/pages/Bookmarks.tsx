import { useCallback, useEffect, useState } from 'react';
import type { Bookmark, BookmarkTree } from '../../shared/types';
import { displayUrl } from '../../shared/url';
import { rye } from '../ui/bridge';
import { Favicon } from '../ui/components';
import { Icon } from '../ui/Icon';
import { Empty, LibraryHeader, Modal, open, SearchField, useRyeEvent } from './common';

function Editor({ item, folderId, kind, onClose }: { item?: Bookmark; folderId: string; kind: 'bookmark' | 'folder'; onClose: () => void }) {
  const [title, setTitle] = useState(item?.title ?? '');
  const [url, setUrl] = useState(item?.url ?? '');
  const folder = kind === 'folder';
  const fixed = /^[a-z][a-z0-9+.-]*:/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  const valid = folder ? !!title.trim() : !!url.trim();
  return (
    <Modal title={item ? (folder ? 'Rename folder' : 'Edit bookmark') : folder ? 'New folder' : 'Add bookmark'} onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          if (item) await rye.invoke('bookmarks:update', item.id, folder ? { title } : { title, url: fixed });
          else await rye.invoke('bookmarks:add', { type: kind, title: title.trim(), url: folder ? undefined : fixed, parentId: folderId });
          onClose();
        }}
      >
        <label className="form-label">
          Name
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        {!folder && (
          <label className="form-label">
            Address
            <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="example.com" />
          </label>
        )}
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!valid}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function BookmarksPage() {
  const [tree, setTree] = useState<BookmarkTree | null>(null);
  const [folder, setFolder] = useState('bar');
  const [query, setQuery] = useState('');
  const [edit, setEdit] = useState<{ item?: Bookmark; kind: 'bookmark' | 'folder' } | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(() => void rye.invoke<BookmarkTree>('bookmarks:tree').then(setTree), []);
  useEffect(load, [load]);
  useRyeEvent('page:bookmarks', load);

  if (!tree) return null;
  const items = tree.items;
  const kids = (id: string) => items.filter((b) => b.parentId === id);
  const current = items.find((b) => b.id === folder) ?? items[0];
  const q = query.trim().toLowerCase();
  const rows = q ? items.filter((b) => b.parentId && (b.title.toLowerCase().includes(q) || b.url?.toLowerCase().includes(q))) : kids(current.id);

  const FolderNode = ({ b, depth }: { b: Bookmark; depth: number }) => (
    <>
      <button
        type="button"
        className="nav-item"
        style={{ paddingLeft: 10 + depth * 14 }}
        aria-current={!q && folder === b.id ? 'page' : undefined}
        data-drop={!!drag && drag !== b.id}
        onClick={() => (setFolder(b.id), setQuery(''))}
        onDragOver={(e) => drag && drag !== b.id && e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (drag) rye.invoke('bookmarks:move', drag, b.id, kids(b.id).length);
          setDrag(null);
        }}
      >
        <Icon name="folder" size={15} />
        <span className="nav-label">{b.title}</span>
      </button>
      {kids(b.id)
        .filter((c) => c.type === 'folder')
        .map((c) => (
          <FolderNode key={c.id} b={c} depth={depth + 1} />
        ))}
    </>
  );

  return (
    <div className="library">
      <LibraryHeader current="bookmarks">
        <SearchField value={query} onChange={setQuery} placeholder="Search bookmarks" />
        <button type="button" className="btn sm ghost" onClick={() => rye.invoke<number>('bookmarks:import').then((n) => n >= 0 && setNotice(`Imported ${n} bookmarks into Other bookmarks`))}>
          Import…
        </button>
        <button type="button" className="btn sm ghost" onClick={() => rye.invoke('bookmarks:export')}>
          Export…
        </button>
      </LibraryHeader>
      <div className="bm-layout">
        <aside className="bm-tree">
          {items
            .filter((b) => b.parentId === null)
            .map((b) => (
              <FolderNode key={b.id} b={b} depth={0} />
            ))}
        </aside>
        <main className="lib-body">
          <div className="bm-head">
            <h2 className="day-title">{q ? 'Search results' : current.title}</h2>
            {!q && (
              <div className="inline">
                <button type="button" className="btn sm ghost" onClick={() => setEdit({ kind: 'folder' })}>
                  <Icon name="folder" size={14} /> New folder
                </button>
                <button type="button" className="btn sm" onClick={() => setEdit({ kind: 'bookmark' })}>
                  <Icon name="plus" size={14} /> Add bookmark
                </button>
              </div>
            )}
          </div>
          {notice && <div className="notice">{notice}</div>}
          {!rows.length && <Empty icon={q ? 'search' : 'bookmark'} title={q ? 'No matches' : 'This folder is empty'} body={q ? undefined : 'Press Ctrl+D on any page to bookmark it, or drag bookmarks here.'} />}
          {rows.map((b, i) => (
            <div
              key={b.id}
              className="list-row"
              draggable={!q}
              data-dragging={drag === b.id}
              onDragStart={() => setDrag(b.id)}
              onDragEnd={() => setDrag(null)}
              onDragOver={(e) => drag && drag !== b.id && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (drag && drag !== b.id) rye.invoke('bookmarks:move', drag, current.id, i);
                setDrag(null);
              }}
              onClick={(e) => (b.type === 'folder' ? (setFolder(b.id), setQuery('')) : open(b.url!, e))}
              onAuxClick={(e) => e.button === 1 && b.url && open(b.url, e)}
              role="link"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && (b.type === 'folder' ? setFolder(b.id) : open(b.url!))}
            >
              {b.type === 'folder' ? <Icon name="folder" size={16} className="muted" /> : <Favicon src={b.favicon} url={b.url} title={b.title} />}
              <span className="list-title">{b.title}</span>
              <span className="list-detail">{b.type === 'folder' ? `${kids(b.id).length} item${kids(b.id).length === 1 ? '' : 's'}` : displayUrl(b.url ?? '')}</span>
              <button type="button" className="icon-btn sm list-action" aria-label="Edit" onClick={(e) => (e.stopPropagation(), setEdit({ item: b, kind: b.type }))}>
                <Icon name="pencil" size={14} />
              </button>
              <button type="button" className="icon-btn sm list-action" aria-label="Delete" onClick={(e) => (e.stopPropagation(), rye.invoke('bookmarks:remove', b.id))}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
        </main>
      </div>
      {edit && <Editor item={edit.item} kind={edit.kind} folderId={current.id} onClose={() => setEdit(null)} />}
    </div>
  );
}
