import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TabState } from '../../shared/types';
import { hostOf } from '../../shared/url';
import { px, rye } from '../ui/bridge';
import { Favicon } from '../ui/components';
import { Icon, RyeMark } from '../ui/Icon';
import { hideTooltip, tip } from './tooltip';

const INTERNAL_ICONS: Record<string, string> = {
  settings: 'settings',
  history: 'history',
  bookmarks: 'bookmark',
  downloads: 'download',
  about: 'info',
};

export function TabIcon({ tab }: { tab: TabState }) {
  if (tab.loading && !tab.sleeping) return <span className="tab-spinner" aria-hidden />;
  if (tab.crashed || tab.error) return <Icon name="warning" size={15} className="tab-warn" />;
  if (tab.internal) {
    const page = tab.url.replace('rye://', '').split(/[/?#]/)[0];
    if (page === 'newtab') return <RyeMark size={16} className="tab-mark" />;
    return <Icon name={INTERNAL_ICONS[page] ?? 'globe'} size={15} className="tab-glyph" />;
  }
  return <Favicon src={tab.favicon} url={tab.url} title={tab.title} />;
}

type Axis = 'x' | 'y';

interface Drag {
  id: number;
  from: number;
  target: number;
  delta: number;
  size: number;
}

/** Pointer-driven reordering shared by the horizontal strip and the vertical sidebar. */
function useReorder(tabs: TabState[], axis: Axis, container: React.RefObject<HTMLElement | null>) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [settling, setSettling] = useState(false);
  const start = useRef<{ id: number; pos: number; rects: DOMRect[]; from: number; pointer: number; moved: boolean; el: HTMLElement } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLElement>, tab: TabState, index: number) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    rye.send('tab:activate', tab.id);
    const items = [...(container.current?.querySelectorAll<HTMLElement>('[data-tab-id]') ?? [])];
    start.current = { id: tab.id, pos: axis === 'x' ? e.clientX : e.clientY, rects: items.map((i) => i.getBoundingClientRect()), from: index, pointer: e.pointerId, moved: false, el: e.currentTarget };
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = start.current;
      if (!s || e.pointerId !== s.pointer) return;
      const pos = axis === 'x' ? e.clientX : e.clientY;
      const delta = pos - s.pos;
      if (!s.moved && Math.abs(delta) < 5) return;
      if (!s.moved) {
        s.moved = true;
        s.el.setPointerCapture(s.pointer);
        hideTooltip(true);
      }
      const rects = s.rects;
      const me = rects[s.from];
      const lo = axis === 'x' ? rects[0].left - me.left : rects[0].top - me.top;
      const last = rects[rects.length - 1];
      const hi = axis === 'x' ? last.right - me.right : last.bottom - me.bottom;
      const d = Math.max(lo, Math.min(hi, delta));
      const center = (axis === 'x' ? me.left + me.width / 2 : me.top + me.height / 2) + d;
      const pinned = tabs[s.from]?.pinned;
      let target = 0;
      rects.forEach((r, i) => {
        if (i === s.from) return;
        const c = axis === 'x' ? r.left + r.width / 2 : r.top + r.height / 2;
        if (center > c) target++;
      });
      // Pinned tabs stay together at the start.
      const pinnedCount = tabs.filter((t) => t.pinned).length;
      target = pinned ? Math.min(target, pinnedCount - 1) : Math.max(target, pinnedCount);
      const size = (axis === 'x' ? me.width : me.height) + gapOf(container.current, axis);
      dragRef.current = { id: s.id, from: s.from, target, delta: d, size };
      setDrag(dragRef.current);
    };
    const up = (e: PointerEvent) => {
      const s = start.current;
      if (!s || e.pointerId !== s.pointer) return;
      start.current = null;
      const d = dragRef.current;
      if (d && s.moved && d.target !== d.from) {
        setSettling(true);
        rye.send('tab:move', d.id, d.target);
      }
      dragRef.current = null;
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [tabs, axis]);

  // After a drop, the new order arrives from the main process; skip one frame of transitions.
  useLayoutEffect(() => {
    if (!settling) return;
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setSettling(false)));
    return () => cancelAnimationFrame(r);
  }, [tabs, settling]);

  const offsetFor = (index: number, id: number): number => {
    if (!drag) return 0;
    if (id === drag.id) return drag.delta;
    if (drag.from < drag.target && index > drag.from && index <= drag.target) return -drag.size;
    if (drag.from > drag.target && index >= drag.target && index < drag.from) return drag.size;
    return 0;
  };

  return { drag, settling, onPointerDown, offsetFor };
}

function gapOf(el: HTMLElement | null, axis: Axis) {
  if (!el) return 0;
  const cs = getComputedStyle(el);
  return parseFloat(axis === 'x' ? cs.columnGap : cs.rowGap) || 0;
}

/** Collapses the tab, then closes it; the strip closes the gap smoothly. */
function closeTab(id: number) {
  hideTooltip(true);
  const el = document.querySelector<HTMLElement>(`[data-tab-id="${id}"]`);
  const dur = px('--dur', 170);
  if (!el || dur < 20) {
    rye.send('tab:close', id);
    return;
  }
  el.dataset.closing = 'true';
  window.dispatchEvent(new CustomEvent('rye:tabs-layout', { detail: dur }));
  window.setTimeout(() => {
    rye.send('tab:close', id);
    // If the page asked to stay (unsaved changes), bring the tab back.
    window.setTimeout(() => el.isConnected && delete el.dataset.closing, 600);
  }, dur);
}

/**
 * The active tab's raised surface is one element that glides between tabs,
 * rather than each tab switching its own background.
 */
function useGlider(container: React.RefObject<HTMLElement | null>, activeId: number, axis: Axis) {
  const [g, setG] = useState<{ x: number; y: number; w: number; h: number; animate: boolean } | null>(null);
  const lastActive = useRef(activeId);
  // Switching tabs glides; any other layout change (tabs opening, closing,
  // resizing) moves the surface instantly so it never lags behind its tab.
  const measure = useCallback(
    (animate: boolean) => {
      const el = container.current?.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`);
      if (!el) return setG(null);
      const next = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight, animate };
      setG((cur) => (cur && cur.x === next.x && cur.y === next.y && cur.w === next.w && cur.h === next.h ? cur : next));
    },
    [activeId, container],
  );
  useLayoutEffect(() => {
    const switched = lastActive.current !== activeId;
    lastActive.current = activeId;
    measure(switched);
  });
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure(false));
    ro.observe(el);
    for (const c of el.children) ro.observe(c);
    // Follow tabs frame by frame while one collapses.
    let raf = 0;
    const follow = (e: Event) => {
      const until = performance.now() + (e as CustomEvent<number>).detail + 60;
      cancelAnimationFrame(raf);
      const step = () => {
        measure(false);
        if (performance.now() < until) raf = requestAnimationFrame(step);
      };
      step();
    };
    window.addEventListener('rye:tabs-layout', follow);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener('rye:tabs-layout', follow);
    };
  });
  if (!g) return null;
  return <span className="tab-glider" data-axis={axis} data-animate={g.animate} aria-hidden style={{ width: g.w, height: g.h, transform: `translate(${g.x}px, ${g.y}px)` }} />;
}

function TabItem({
  tab,
  active,
  index,
  offset,
  dragging,
  compact,
  vertical,
  showTitles,
  onPointerDown,
}: {
  tab: TabState;
  active: boolean;
  index: number;
  offset: number;
  dragging: boolean;
  compact: boolean;
  vertical: boolean;
  showTitles: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLElement>, tab: TabState, index: number) => void;
}) {
  const title = tab.title || hostOf(tab.url) || 'New Tab';
  const host = tab.internal ? '' : hostOf(tab.url);
  const label = host && host !== title ? `${title}\n${host}` : title;
  const tipProps = showTitles || compact ? tip(label, undefined, { side: vertical ? 'right' : 'below', delay: 700 }) : { 'aria-label': title };
  return (
    <div
      className="tab"
      data-tab-id={tab.id}
      data-active={active}
      data-pinned={tab.pinned}
      data-compact={compact}
      data-dragging={dragging}
      data-sleeping={tab.sleeping}
      role="tab"
      aria-selected={active}
      tabIndex={-1}
      style={offset ? { transform: vertical ? `translateY(${offset}px)` : `translateX(${offset}px)` } : undefined}
      {...tipProps}
      onPointerDown={(e) => onPointerDown(e, tab, index)}
      onMouseDown={(e) => {
        hideTooltip(true);
        if (e.button === 1) e.preventDefault();
      }}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          closeTab(tab.id);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        hideTooltip(true);
        rye.send('tab:menu', tab.id, { x: e.clientX, y: e.clientY, width: 0, height: 0 });
      }}
    >
      <span className="tab-icon">
        <TabIcon tab={tab} />
      </span>
      {!compact && <span className="tab-title">{title}</span>}
      {(tab.audible || tab.muted) && !compact && (
        <button
          type="button"
          className="tab-audio icon-btn xs"
          data-no-drag
          onClick={(e) => {
            e.stopPropagation();
            rye.send('tab:mute', tab.id);
          }}
          {...tip(tab.muted ? 'Unmute tab' : 'Mute tab')}
        >
          <Icon name={tab.muted ? 'volume-x' : 'volume-2'} size={13} />
        </button>
      )}
      {!compact && !tab.pinned && (
        <button
          type="button"
          className="tab-close icon-btn xs"
          data-no-drag
          onClick={(e) => {
            e.stopPropagation();
            closeTab(tab.id);
          }}
          {...tip('Close tab', undefined, { delay: 900 })}
        >
          <Icon name="x" size={13} stroke={2} />
        </button>
      )}
    </div>
  );
}

export function TabStrip({ tabs, activeId, showTitles }: { tabs: TabState[]; activeId: number; showTitles: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  const { drag, settling, onPointerDown, offsetFor } = useReorder(tabs, 'x', scroller);
  const glider = useGlider(scroller, activeId, 'x');
  const [edges, setEdges] = useState({ left: false, right: false });

  const updateEdges = () => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  };

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(updateEdges);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep the active tab visible when it changes or new tabs are added.
  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    updateEdges();
  }, [activeId, tabs.length]);

  return (
    <div className="tabs-wrap" data-fade-left={edges.left} data-fade-right={edges.right}>
      <div
        ref={scroller}
        className="tabs"
        role="tablist"
        data-dragging={!!drag}
        data-settling={settling}
        onScroll={updateEdges}
        onWheel={(e) => {
          const el = scroller.current;
          if (el && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY;
        }}
        onDoubleClick={(e) => e.target === scroller.current && rye.send('tab:new')}
      >
        {glider}
        {tabs.map((t, i) => (
          <TabItem key={t.id} tab={t} index={i} active={t.id === activeId} offset={offsetFor(i, t.id)} dragging={drag?.id === t.id} compact={t.pinned} vertical={false} showTitles={showTitles} onPointerDown={onPointerDown} />
        ))}
      </div>
      <button type="button" className="icon-btn new-tab" onClick={() => rye.send('tab:new')} {...tip('New tab', shortcutLabel('T'))}>
        <Icon name="plus" size={17} />
      </button>
    </div>
  );
}

export function TabList({ tabs, activeId, collapsed, showTitles }: { tabs: TabState[]; activeId: number; collapsed: boolean; showTitles: boolean }) {
  const list = useRef<HTMLDivElement>(null);
  const { drag, settling, onPointerDown, offsetFor } = useReorder(tabs, 'y', list);
  const glider = useGlider(list, activeId, 'y');
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeId, tabs.length]);
  return (
    <div ref={list} className="vtabs" role="tablist" aria-orientation="vertical" data-dragging={!!drag} data-settling={settling} data-collapsed={collapsed}>
      {glider}
      {tabs.map((t, i) => (
        <TabItem key={t.id} tab={t} index={i} active={t.id === activeId} offset={offsetFor(i, t.id)} dragging={drag?.id === t.id} compact={collapsed} vertical showTitles={showTitles} onPointerDown={onPointerDown} />
      ))}
      <button type="button" className="vtab-new" onClick={() => rye.send('tab:new')} {...(collapsed ? tip('New tab', shortcutLabel('T'), { side: 'right' }) : {})}>
        <span className="tab-icon">
          <Icon name="plus" size={16} />
        </span>
        {!collapsed && <span className="tab-title">New tab</span>}
      </button>
    </div>
  );
}

export function shortcutLabel(key: string, shift = false) {
  const mac = rye.platform === 'darwin';
  if (mac) return `${shift ? '⇧' : ''}⌘${key}`;
  return `Ctrl+${shift ? 'Shift+' : ''}${key}`;
}
