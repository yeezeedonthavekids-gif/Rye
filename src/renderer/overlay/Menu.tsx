import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MenuItem } from '../../shared/types';
import { Favicon } from '../ui/components';
import { Icon } from '../ui/Icon';

const interactive = (i: MenuItem) => !i.separator && !i.header && !i.disabled && !i.row;

interface Place {
  x: number;
  y: number;
  /** Right edge to align against when the panel would overflow to the right. */
  xFlip: number;
  /** Bottom edge to align against when the panel would overflow downwards. */
  yFlip: number;
}

function MenuPanel({ items, onPick, onClose, place, depth, autoFocus, onBack }: { items: MenuItem[]; onPick: (id: string) => void; onClose: () => void; place: Place; depth: number; autoFocus: boolean; onBack?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(autoFocus ? items.findIndex(interactive) : -1);
  const [sub, setSub] = useState<{ index: number; place: Place; focus: boolean } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const hoverTimer = useRef(0);

  // Keep the panel fully on screen, flipping to the other side of its anchor when needed.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const W = window.innerWidth;
    const H = window.innerHeight;
    let left = place.x;
    let top = place.y;
    if (left + w > W - 6) left = place.xFlip - w;
    if (top + h > H - 6) top = place.yFlip - h;
    left = Math.max(6, Math.min(left, W - w - 6));
    top = Math.max(6, Math.min(top, H - h - 6));
    setPos({ left, top });
  }, [place.x, place.y, place.xFlip, place.yFlip, items]);

  const openSub = (index: number, focus: boolean) => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    setSub({ index, place: { x: r.right - 2, xFlip: r.left + 2, y: r.top - 5, yFlip: r.bottom + 5 }, focus });
  };

  useEffect(() => {
    if (!autoFocus && depth > 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (sub?.focus) return;
      const list = items.map((it, i) => ({ it, i })).filter(({ it }) => interactive(it));
      const pos = list.findIndex((x) => x.i === active);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(list[(pos + 1) % list.length]?.i ?? -1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(list[(pos - 1 + list.length) % list.length]?.i ?? -1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setActive(list[0]?.i ?? -1);
      } else if (e.key === 'End') {
        e.preventDefault();
        setActive(list[list.length - 1]?.i ?? -1);
      } else if (e.key === 'ArrowRight' && items[active]?.submenu?.length) {
        e.preventDefault();
        openSub(active, true);
      } else if (e.key === 'ArrowLeft' && onBack) {
        e.preventDefault();
        onBack();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const it = items[active];
        if (!it) return;
        if (it.submenu?.length) openSub(active, true);
        else if (it.id && interactive(it)) onPick(it.id);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (onBack) onBack();
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, active, sub, autoFocus, depth, onBack]);

  return (
    <>
      <div
        ref={ref}
        className="surface menu pop"
        role="menu"
        style={{ position: 'fixed', left: pos?.left ?? place.x, top: pos?.top ?? place.y, visibility: pos ? 'visible' : 'hidden', zIndex: 10 + depth }}
        onMouseLeave={() => !sub && setActive(-1)}
      >
        {items.map((it, i) => {
          if (it.separator) return <div key={i} className="menu-sep" role="separator" />;
          if (it.header) return <div key={i} className="menu-header">{it.header}</div>;
          if (it.row) {
            return (
              <div key={i} className="menu-row" data-index={i}>
                <span className="menu-row-label">{it.label}</span>
                <div className="menu-row-buttons">
                  {it.row.map((b) => (
                    <button key={b.id} type="button" className={b.icon ? 'icon-btn sm' : 'menu-row-value'} title={b.label} onClick={() => b.id && onPick(b.id)}>
                      {b.icon ? <Icon name={b.icon} size={15} /> : b.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          }
          const hasSub = !!it.submenu?.length;
          return (
            <button
              key={i}
              type="button"
              role="menuitem"
              data-index={i}
              className={`menu-item${it.danger ? ' danger' : ''}`}
              disabled={it.disabled}
              data-active={active === i || sub?.index === i}
              aria-haspopup={hasSub || undefined}
              onMouseEnter={() => {
                setActive(i);
                window.clearTimeout(hoverTimer.current);
                if (hasSub) hoverTimer.current = window.setTimeout(() => openSub(i, false), 140);
                else if (sub) hoverTimer.current = window.setTimeout(() => setSub(null), 160);
              }}
              onClick={() => {
                if (hasSub) openSub(i, false);
                else if (it.id) onPick(it.id);
              }}
            >
              <span className="menu-icon">
                {it.checked ? <Icon name="check" size={15} stroke={2.25} /> : it.icon ? <Icon name={it.icon} size={15} /> : it.favicon ? <Favicon url={it.favicon} title={it.label} /> : null}
              </span>
              <span className="menu-label">{it.label}</span>
              {it.shortcut && <span className="menu-shortcut">{it.shortcut}</span>}
              {hasSub && <Icon name="chevron-right" size={14} className="menu-chevron" />}
            </button>
          );
        })}
      </div>
      {sub && items[sub.index]?.submenu && (
        <MenuPanel
          key={sub.index}
          items={items[sub.index].submenu!}
          onPick={onPick}
          onClose={onClose}
          place={sub.place}
          depth={depth + 1}
          autoFocus={sub.focus}
          onBack={() => setSub(null)}
        />
      )}
    </>
  );
}

export function Menu({ items, anchor, placement, onPick, onClose }: { items: MenuItem[]; anchor: { x: number; y: number; width: number; height: number }; placement?: string; onPick: (id: string) => void; onClose: () => void }) {
  const point = placement === 'point';
  const place: Place = point
    ? { x: anchor.x + 2, xFlip: anchor.x - 2, y: anchor.y + 2, yFlip: anchor.y - 2 }
    : { x: anchor.x, xFlip: anchor.x + anchor.width, y: anchor.y + anchor.height + 6, yFlip: anchor.y - 6 };
  return <MenuPanel items={items} onPick={onPick} onClose={onClose} place={place} depth={0} autoFocus={!point} />;
}
