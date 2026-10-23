import { useLayoutEffect, useRef, useState } from 'react';
import type { Bookmark, BookmarkTree } from '../../shared/types';
import { rye } from '../ui/bridge';
import { Favicon } from '../ui/components';
import { Icon } from '../ui/Icon';
import { hideTooltip, tip } from './tooltip';

function rectOf(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

export function BookmarksBar({ tree }: { tree: BookmarkTree | null }) {
  const row = useRef<HTMLDivElement>(null);
  const items: Bookmark[] = tree ? tree.items.filter((b) => b.parentId === tree.barId) : [];
  const [visible, setVisible] = useState(items.length);

  // Fit as many items as the bar allows; the rest go into an overflow menu.
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const fit = () => {
      const kids = [...el.querySelectorAll<HTMLElement>('[data-bm]')];
      const limit = el.clientWidth - 40;
      let used = 0;
      let n = 0;
      for (const k of kids) {
        k.style.display = '';
        used += k.offsetWidth + 2;
        if (used > limit) break;
        n++;
      }
      kids.forEach((k, i) => (k.style.display = i < n ? '' : 'none'));
      setVisible(n);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tree]);

  const open = (b: Bookmark, e: React.MouseEvent) => {
    hideTooltip(true);
    if (b.type === 'folder') {
      rye.send('bookmarks:folder-menu', b.id, rectOf(e.currentTarget));
      return;
    }
    rye.send('bookmarks:open', b.id, e.button === 1 || e.ctrlKey || e.metaKey ? 'background' : 'current');
  };

  return (
    <div className="bookmarks-bar" ref={row}>
      {!items.length && (
        <div className="bookmarks-empty">
          <Icon name="star" size={13} />
          <span>Bookmark pages with</span>
          <span className="kbd">{rye.platform === 'darwin' ? '⌘D' : 'Ctrl+D'}</span>
          <span>and they’ll appear here.</span>
        </div>
      )}
      {items.map((b) => (
        <button
          key={b.id}
          type="button"
          data-bm
          className="bm"
          {...tip(b.type === 'folder' ? b.title : `${b.title}\n${b.url ?? ''}`, undefined, { delay: 800 })}
          onClick={(e) => open(b, e)}
          onAuxClick={(e) => e.button === 1 && open(b, e)}
          onMouseDown={(e) => {
            hideTooltip(true);
            if (e.button === 1) e.preventDefault();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            hideTooltip(true);
            rye.send('bookmarks:item-menu', b.id, { x: e.clientX, y: e.clientY, width: 0, height: 0 });
          }}
        >
          {b.type === 'folder' ? <Icon name="folder" size={14} className="bm-folder" /> : <Favicon src={b.favicon} url={b.url} title={b.title} size={14} />}
          <span className="bm-title">{b.title || b.url}</span>
        </button>
      ))}
      {visible < items.length && (
        <button
          type="button"
          className="icon-btn sm bm-more"
          onClick={(e) => rye.send('bookmarks:folder-menu', tree!.barId, rectOf(e.currentTarget))}
          {...tip('More bookmarks')}
        >
          <Icon name="chevron-right" size={15} />
        </button>
      )}
    </div>
  );
}
