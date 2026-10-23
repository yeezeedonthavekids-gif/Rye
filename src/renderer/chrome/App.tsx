import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BookmarkTree, TabState, WindowState } from '../../shared/types';
import { px, rye, useThemePayload } from '../ui/bridge';
import { formatEta } from '../ui/components';
import { Icon } from '../ui/Icon';
import { AddressBar } from './AddressBar';
import { BookmarksBar } from './BookmarksBar';
import { ErrorView } from './ErrorView';
import { FindBar } from './FindBar';
import { TabList, TabStrip, shortcutLabel } from './Tabs';
import { hideTooltip, tip } from './tooltip';

function rectOf(el: Element | null) {
  const r = el?.getBoundingClientRect();
  return r ? { x: r.left, y: r.top, width: r.width, height: r.height } : { x: 0, y: 0, width: 0, height: 0 };
}

function WindowControls({ maximized }: { maximized: boolean }) {
  if (rye.platform === 'darwin') return null;
  if (rye.platform === 'win32') return <div className="wco-space" />;
  return (
    <div className="window-controls">
      <button type="button" className="wc-btn" onClick={() => rye.send('win:minimize')} aria-label="Minimize">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M1.5 5h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
      <button type="button" className="wc-btn" onClick={() => rye.send('win:maximize')} aria-label={maximized ? 'Restore' : 'Maximize'}>
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
            <rect x="1.5" y="3" width="5.5" height="5.5" rx="1.4" />
            <path d="M3.5 1.5h3.4c.9 0 1.6.7 1.6 1.6v3.4" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
            <rect x="1.5" y="1.5" width="7" height="7" rx="1.8" />
          </svg>
        )}
      </button>
      <button type="button" className="wc-btn close" onClick={() => rye.send('win:close')} aria-label="Close window">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function DownloadsButton({ state, pinned }: { state: WindowState; pinned: boolean }) {
  const d = state.downloads;
  // Bounce the arrow whenever a new download starts.
  const prev = useRef(d.active);
  const [arrive, setArrive] = useState(0);
  useEffect(() => {
    if (d.active > prev.current) setArrive((n) => n + 1);
    prev.current = d.active;
  }, [d.active]);
  if (!pinned && !d.active && !d.recent) return null;
  const pct = d.progress < 0 ? 0.25 : d.progress;
  const r = 10;
  const c = 2 * Math.PI * r;
  return (
    <button
      type="button"
      className="icon-btn dl-btn"
      key={arrive}
      data-anchor="downloads"
      data-active={d.active > 0}
      data-arrive={arrive > 0}
      onClick={(e) => {
        hideTooltip(true);
        rye.send('downloads:panel', rectOf(e.currentTarget));
      }}
      {...tip(d.active ? [`${d.active} download${d.active > 1 ? 's' : ''} in progress`, formatEta(d.eta)].filter(Boolean).join(' · ') : 'Downloads', shortcutLabel('J'))}
    >
      <Icon name="download" size={16} />
      {d.active > 0 && (
        <svg className="dl-ring" width="26" height="26" viewBox="0 0 26 26" data-indeterminate={d.progress < 0}>
          <circle cx="13" cy="13" r={r} fill="none" stroke="var(--hairline-strong)" strokeWidth="2" />
          <circle cx="13" cy="13" r={r} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 13 13)" />
        </svg>
      )}
      {!d.active && d.recent > 0 && <span className="dl-dot" />}
    </button>
  );
}

function Toolbar({ state, tab, settings, findOpen, closeFind, vertical }: { state: WindowState; tab: TabState | undefined; settings: any; findOpen: boolean; closeFind: () => void; vertical: boolean }) {
  const buttons: string[] = settings.appearance.toolbarButtons;
  const engine = settings.search.engines.find((e: any) => e.id === settings.search.engine)?.name ?? 'the web';
  const navMenu = (dir: 'back' | 'forward') => (e: React.MouseEvent) => {
    e.preventDefault();
    hideTooltip(true);
    rye.send('nav:history-menu', dir, rectOf(e.currentTarget));
  };
  return (
    <nav
      className="toolbar"
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest('input')) return;
        e.preventDefault();
        rye.send('menu:toolbar', { x: e.clientX, y: e.clientY, width: 0, height: 0 });
      }}
    >
      <div className="nav-group">
        <button type="button" className="icon-btn" disabled={!tab?.canGoBack} onClick={() => rye.send('nav:command', 'back')} onContextMenu={navMenu('back')} {...tip('Back', rye.platform === 'darwin' ? '⌘[' : 'Alt+←')}>
          <Icon name="arrow-left" size={17} />
        </button>
        <button type="button" className="icon-btn" disabled={!tab?.canGoForward} onClick={() => rye.send('nav:command', 'forward')} onContextMenu={navMenu('forward')} {...tip('Forward', rye.platform === 'darwin' ? '⌘]' : 'Alt+→')}>
          <Icon name="arrow-right" size={17} />
        </button>
        {tab?.loading ? (
          <button type="button" className="icon-btn" onClick={() => rye.send('nav:command', 'stop')} {...tip('Stop loading', 'Esc')}>
            <Icon name="x" size={17} />
          </button>
        ) : (
          <button type="button" className="icon-btn" onClick={() => rye.send('nav:command', 'reload')} {...tip('Reload', shortcutLabel('R'))}>
            <Icon name="rotate-cw" size={16} />
          </button>
        )}
        {buttons.includes('home') && (
          <button type="button" className="icon-btn" onClick={() => rye.send('nav:command', 'home')} {...tip('Home')}>
            <Icon name="home" size={16} />
          </button>
        )}
      </div>

      <div className="address-row">
        <AddressBar tab={tab} bookmarked={state.bookmarkedActive} isPrivate={state.private} engineName={engine} />
        {tab && <FindBar tabId={tab.id} open={findOpen} onClose={closeFind} />}
      </div>

      <div className="action-group">
        {buttons.includes('bookmarks') && (
          <button type="button" className="icon-btn" onClick={() => rye.send('nav:command', 'bookmarks')} {...tip('Bookmarks', shortcutLabel('O', true))}>
            <Icon name="bookmark" size={16} />
          </button>
        )}
        {buttons.includes('history') && (
          <button type="button" className="icon-btn" onClick={() => rye.send('nav:command', 'history')} {...tip('History', rye.platform === 'darwin' ? '⌘Y' : 'Ctrl+H')}>
            <Icon name="history" size={16} />
          </button>
        )}
        <DownloadsButton state={state} pinned={buttons.includes('downloads')} />
        {buttons.includes('private') && !state.private && (
          <button type="button" className="icon-btn" onClick={() => rye.send('nav:command', 'new-private')} {...tip('New private window', shortcutLabel('N', true))}>
            <Icon name="venetian-mask" size={16} />
          </button>
        )}
        {state.private && (
          <span className="private-badge" {...tip('Private window — history, cookies and site data are discarded when you close it', undefined, { delay: 300 })}>
            <Icon name="venetian-mask" size={14} />
            <span>Private</span>
          </span>
        )}
        <button
          type="button"
          className="icon-btn"
          data-anchor="menu"
          onClick={(e) => {
            hideTooltip(true);
            rye.send('menu:app', rectOf(e.currentTarget));
          }}
          {...tip('Menu')}
        >
          <Icon name="more" size={17} />
        </button>
        {vertical && <WindowControls maximized={state.maximized} />}
      </div>
    </nav>
  );
}

export function ChromeApp() {
  const theme = useThemePayload('ui:theme');
  const [state, setState] = useState<WindowState | null>(null);
  const [tree, setTree] = useState<BookmarkTree | null>(null);
  const [findTabs, setFindTabs] = useState<Record<number, boolean>>({});
  const slot = useRef<HTMLDivElement>(null);
  const topRow = useRef<HTMLElement | null>(null);
  const activeRef = useRef<number>(-1);

  useEffect(() => {
    const offs = [
      rye.on('ui:state', (s: WindowState) => setState(s)),
      rye.on('ui:bookmarks', (t: BookmarkTree) => setTree(t)),
      rye.on('ui:find', () => setFindTabs((f) => ({ ...f, [activeRef.current]: true }))),
      rye.on('ui:open-downloads', () => {
        const el = document.querySelector('[data-anchor="downloads"]') ?? document.querySelector('[data-anchor="menu"]');
        if (el) rye.send('downloads:panel', rectOf(el));
      }),
    ];
    rye.send('ui:ready');
    return () => offs.forEach((o) => o());
  }, []);

  const tab = state?.tabs.find((t) => t.id === state.activeId);
  activeRef.current = state?.activeId ?? -1;
  const a = theme?.settings.appearance;
  const vertical = a?.tabLayout === 'vertical';
  const showBar = !!a && (a.bookmarksBar === 'always' || (a.bookmarksBar === 'newtab' && !!tab?.url.startsWith('rye://newtab')));
  const hidden = !!state?.htmlFullscreen;

  // Report where the page should sit. The main process positions the live
  // page view exactly over this slot, and keeps it there during resizes.
  useLayoutEffect(() => {
    const el = slot.current;
    if (!el) return;
    let last = '';
    const report = () => {
      const r = el.getBoundingClientRect();
      const insets = {
        top: Math.round(r.top),
        left: Math.round(r.left),
        right: Math.round(window.innerWidth - r.right),
        bottom: Math.round(window.innerHeight - r.bottom),
        radius: px('--r-sheet', 12),
      };
      const anchors: Record<string, unknown> = {};
      document.querySelectorAll<HTMLElement>('[data-anchor]').forEach((n) => (anchors[n.dataset.anchor!] = rectOf(n)));
      const tb = topRow.current?.getBoundingClientRect().height ?? 42;
      const key = JSON.stringify([insets, anchors, tb]);
      if (key === last) return;
      last = key;
      rye.send('ui:insets', insets, anchors, Math.round(tb));
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    ro.observe(document.body);
    window.addEventListener('resize', report);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', report);
    };
  });

  if (!state || !theme) return <div className="shell loading" />;

  const closeFind = () => {
    setFindTabs((f) => ({ ...f, [state.activeId]: false }));
    rye.send('find:close');
  };
  const findOpen = !!findTabs[state.activeId];

  const toolbar = <Toolbar state={state} tab={tab} settings={theme.settings} findOpen={findOpen} closeFind={closeFind} vertical={vertical} />;
  const content = (
    <main className="slot-wrap">
      <div className="slot" ref={slot}>
        {tab?.error && <ErrorView tab={tab} />}
      </div>
      <div className="progress" data-loading={!!tab?.loading} style={{ ['--p' as any]: tab?.loading ? Math.max(0.06, tab.progress) : 1 }} />
    </main>
  );

  if (vertical) {
    return (
      <div className="shell vertical" data-hidden={hidden} data-collapsed={a!.sidebarCollapsed} data-private={state.private}>
        <aside className="sidebar">
          <div className="sidebar-head">
            <div className="traffic-space" />
            <button
              type="button"
              className="icon-btn sm"
              onClick={() => rye.invoke('settings:set', 'appearance.sidebarCollapsed', !a!.sidebarCollapsed)}
              {...tip(a!.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar', shortcutLabel('E', true), { side: a!.sidebarCollapsed ? 'right' : 'below' })}
            >
              <Icon name={a!.sidebarCollapsed ? 'panel-left-open' : 'panel-left-close'} size={16} />
            </button>
          </div>
          <TabList tabs={state.tabs} activeId={state.activeId} collapsed={a!.sidebarCollapsed} showTitles={theme.settings.tabs.showHoverPreviewTitles} />
        </aside>
        <div className="column">
          <header className="top" ref={(n) => {
            topRow.current = n;
          }}>
            {toolbar}
          </header>
          {showBar && <BookmarksBar tree={tree} />}
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="shell horizontal" data-hidden={hidden} data-private={state.private}>
      <header className="tabstrip" ref={(n) => {
            topRow.current = n;
          }}>
        <div className="traffic-space" />
        <TabStrip tabs={state.tabs} activeId={state.activeId} showTitles={theme.settings.tabs.showHoverPreviewTitles} />
        <div className="strip-drag" />
        <WindowControls maximized={state.maximized} />
      </header>
      {toolbar}
      {showBar && <BookmarksBar tree={tree} />}
      {content}
    </div>
  );
}
