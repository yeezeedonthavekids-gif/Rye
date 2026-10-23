import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MenuItem, PopupRequest, Suggestion, ThemePayload } from '../../shared/types';
import { rye, useThemePayload } from '../ui/bridge';
import { Favicon } from '../ui/components';
import { Icon, RyeMark } from '../ui/Icon';
import { Menu } from './Menu';
import { BookmarkPopover, ConfirmDialog, DownloadsPopover, PermissionPopover, SiteInfoPopover, ZoomPopover } from './Popovers';

type Render =
  | { mode: 'none' }
  | { mode: 'popup'; popup: PopupRequest; data: any; size: { width: number; height: number } }
  | { mode: 'suggest'; items: Suggestion[]; selected: number }
  | { mode: 'tooltip'; text: string; shortcut?: string }
  | { mode: 'status'; text: string };

const dismiss = () => rye.send('overlay:dismiss');

/** Positions a popover next to its anchor and keeps it on screen. */
function Anchored({ anchor, children }: { anchor: PopupRequest['anchor']; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; origin: string } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current;
      if (!el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const W = window.innerWidth;
      const H = window.innerHeight;
      let left = anchor.x + anchor.width / 2 - 28;
      if (left + w > W - 8) left = anchor.x + anchor.width - w;
      left = Math.max(8, Math.min(left, W - w - 8));
      let top = anchor.y + anchor.height + 8;
      let origin = 'top';
      if (top + h > H - 8) {
        top = Math.max(8, anchor.y - h - 8);
        origin = 'bottom';
      }
      const originX = Math.max(12, Math.min(w - 12, anchor.x + anchor.width / 2 - left));
      setPos({ left, top, origin: `${originX}px ${origin}` });
    };
    place();
    const ro = new ResizeObserver(place);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [anchor.x, anchor.y, anchor.width, anchor.height]);
  return (
    <div ref={ref} className="popover surface pop" style={{ left: pos?.left ?? anchor.x, top: pos?.top ?? anchor.y + anchor.height + 8, visibility: pos ? 'visible' : 'hidden', transformOrigin: pos?.origin }} onMouseDown={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

function Popup({ popup, data }: { popup: PopupRequest; data: any }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && popup.kind !== 'menu') {
        e.preventDefault();
        dismiss();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [popup.kind]);

  const confirm = popup.kind === 'confirm';
  return (
    <div className={`backdrop${confirm ? ' scrim' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && dismiss()} onContextMenu={(e) => (e.preventDefault(), dismiss())}>
      {popup.kind === 'menu' && <Menu items={(data?.items ?? []) as MenuItem[]} anchor={popup.anchor} placement={popup.placement} onPick={(id) => rye.send('overlay:action', id)} onClose={dismiss} />}
      {popup.kind === 'bookmark' && (
        <Anchored anchor={popup.anchor}>
          <BookmarkPopover data={data} />
        </Anchored>
      )}
      {popup.kind === 'siteinfo' && (
        <Anchored anchor={popup.anchor}>
          <SiteInfoPopover data={data} />
        </Anchored>
      )}
      {popup.kind === 'downloads' && (
        <Anchored anchor={popup.anchor}>
          <DownloadsPopover data={data} />
        </Anchored>
      )}
      {popup.kind === 'permission' && (
        <Anchored anchor={popup.anchor}>
          <PermissionPopover data={data} />
        </Anchored>
      )}
      {popup.kind === 'zoom' && (
        <Anchored anchor={popup.anchor}>
          <ZoomPopover data={data} />
        </Anchored>
      )}
      {confirm && <ConfirmDialog data={data} />}
    </div>
  );
}

const KIND_ICON: Record<string, string> = { search: 'search', url: 'globe', history: 'history', bookmark: 'star', tab: 'app-window', engine: 'search' };

function Suggestions({ items, selected }: { items: Suggestion[]; selected: number }) {
  return (
    <div className="suggest-wrap">
      <div className="suggest surface" role="listbox">
        {items.map((s, i) => (
          <div
            key={`${s.kind}:${s.url}:${i}`}
            role="option"
            aria-selected={i === selected}
            className="suggest-row"
            data-selected={i === selected}
            onMouseMove={() => i !== selected && rye.send('overlay:suggest-hover', i)}
            onMouseDown={(e) => {
              e.preventDefault();
              rye.send('overlay:suggest-pick', i, e.button === 1 || e.ctrlKey || e.metaKey ? 'new' : 'current');
            }}
          >
            <span className="suggest-icon" data-kind={s.kind}>
              {s.kind === 'internal' ? <RyeMark size={15} /> : (s.kind === 'history' || s.kind === 'tab') && s.favicon ? <Favicon src={s.favicon} url={s.url} /> : <Icon name={KIND_ICON[s.kind] ?? 'globe'} size={15} />}
            </span>
            <span className="suggest-title">{s.title}</span>
            {s.kind === 'tab' ? <span className="suggest-tag">Switch to tab</span> : s.detail && <span className="suggest-detail">{s.kind === 'search' ? `— ${s.detail}` : s.detail}</span>}
            {i === selected && <Icon name="corner-down-left" size={13} className="suggest-enter" />}
          </div>
        ))}
      </div>
    </div>
  );
}

export function OverlayApp() {
  const theme = useThemePayload('ui:theme', () => rye.invoke<ThemePayload>('ui:theme-get'));
  const [r, setR] = useState<Render>({ mode: 'none' });
  useEffect(() => rye.on('overlay:render', (msg: Render) => setR(msg)), []);
  if (!theme) return null;
  switch (r.mode) {
    case 'popup':
      return <Popup key={`${r.popup.kind}:${r.popup.anchor.x}:${r.popup.anchor.y}`} popup={r.popup} data={r.data} />;
    case 'suggest':
      return <Suggestions items={r.items} selected={r.selected} />;
    case 'tooltip':
      return (
        <div className="tooltip-wrap">
          <div className="tooltip" role="tooltip">
            <span className="tooltip-text">
              {r.text.split('\n').map((line, i) => (
                <span key={i} className={i ? 'tooltip-sub' : undefined}>
                  {line}
                </span>
              ))}
            </span>
            {r.shortcut && <span className="tooltip-key">{r.shortcut}</span>}
          </div>
        </div>
      );
    case 'status':
      return (
        <div className="status-wrap">
          <div className="status">{r.text}</div>
        </div>
      );
    default:
      return null;
  }
}
