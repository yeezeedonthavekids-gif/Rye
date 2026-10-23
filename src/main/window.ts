import {
  BrowserWindow,
  WebContentsView,
  clipboard,
  dialog,
  nativeImage,
  nativeTheme,
  screen,
  type ContextMenuParams,
  type HandlerDetails,
  type Input,
  type Session,
  type WebContents,
  type WindowOpenHandlerResponse,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { computeTheme, type ThemeOutput } from '../shared/theme';
import type { Insets, MenuItem, PopupRequest, Rect, ThemePayload, WindowState } from '../shared/types';
import { displayUrl, isInternal, originOf, resolveInput } from '../shared/url';
import { bookmarks } from './bookmarks';
import { downloads } from './downloads';
import { appMenu, bookmarkItemMenu, folderMenu, historyMenu, inputMenu, pageMenu, stripMenu, tabMenu, toolbarMenu } from './menus';
import { PERMISSION_LABELS, permissions } from './permissions';
import { defaultTabSession, privateTabSession, uiSession } from './sessions';
import { settings } from './settings';
import { matchShortcut } from './shortcuts';
import { popClosed, pushClosed, takeClosed, hasClosed, type ClosedTab, type SavedWindow } from './state';
import { Tab } from './tab';

export const NEWTAB = 'rye://newtab';
const RENDERER = path.join(__dirname, '../renderer');
const UI_PRELOAD = path.join(__dirname, '../preload/ui.js');

interface OpenPopup {
  req: PopupRequest;
  onAction?: (id: string, payload: any) => boolean | void;
  onDismiss?: () => void;
  refresh?: () => unknown;
  focusBack: 'chrome' | 'page';
}

interface PendingPermission {
  tabId: number;
  origin: string;
  permission: string;
  label: string;
  resolve: (v: boolean | null) => void;
}

export interface AppHooks {
  newWindow(opts?: { isPrivate?: boolean; url?: string }): RyeWindow;
  quit(): void;
  broadcastSession(): void;
}

export class RyeWindow {
  static all = new Set<RyeWindow>();
  static app: AppHooks;

  readonly win: BrowserWindow;
  readonly session: Session;
  readonly overlay: WebContentsView;
  readonly isPrivate: boolean;
  tabs: Tab[] = [];
  activeId = -1;

  private insets: Insets = { top: 92, left: 7, right: 7, bottom: 7, radius: 12 };
  private anchors: Record<string, Rect> = {};
  private titlebarHeight = 42;
  private htmlFullscreen = false;
  private stateQueued = false;
  private popup: OpenPopup | null = null;
  private suggest: { items: unknown[]; selected: number; rect: Rect } | null = null;
  private tooltip: { text: string; shortcut?: string; rect: Rect } | null = null;
  private status: { text: string; rect: Rect } | null = null;
  private overlayVisible = false;
  private overlayBounds = '';
  private permQueue: PendingPermission[] = [];
  private privateClosed: ClosedTab[] = [];
  private uiReady = false;
  private readyActions: (() => void)[] = [];
  private forceClose = false;
  private lastSent = '';

  constructor(opts: { isPrivate?: boolean; saved?: SavedWindow; url?: string; urls?: string[] } = {}) {
    this.isPrivate = !!opts.isPrivate;
    this.session = this.isPrivate ? privateTabSession() : defaultTabSession();
    const t = this.theme();
    const platform = process.platform;
    const bounds = restoreBounds(opts.saved?.bounds);

    this.win = new BrowserWindow({
      ...bounds,
      minWidth: 440,
      minHeight: 320,
      show: false,
      title: this.isPrivate ? 'Rye — Private' : 'Rye',
      backgroundColor: t.frame,
      icon: appIcon(),
      frame: platform === 'linux' ? false : undefined,
      titleBarStyle: platform === 'darwin' ? 'hiddenInset' : platform === 'win32' ? 'hidden' : undefined,
      titleBarOverlay: platform === 'win32' ? { color: t.frame, symbolColor: t.text, height: this.titlebarHeight } : undefined,
      trafficLightPosition: platform === 'darwin' ? { x: 15, y: 14 } : undefined,
      webPreferences: {
        preload: UI_PRELOAD,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        session: uiSession(this.isPrivate),
        spellcheck: false,
      },
    });
    this.win.setMenuBarVisibility(false);

    this.overlay = new WebContentsView({
      webPreferences: { preload: UI_PRELOAD, sandbox: true, contextIsolation: true, nodeIntegration: false, session: uiSession(this.isPrivate), spellcheck: false },
    });
    this.overlay.setBackgroundColor('#00000000');
    this.overlay.setVisible(false);
    this.win.contentView.addChildView(this.overlay);

    for (const wc of [this.win.webContents, this.overlay.webContents]) {
      wc.on('will-navigate', (e) => e.preventDefault());
      wc.setWindowOpenHandler(() => ({ action: 'deny' }));
      wc.on('before-input-event', (event, input) => this.handleInput(event, input));
    }
    this.win.webContents.on('context-menu', (_e, params) => {
      if (params.isEditable) this.openInputMenu({ x: params.x, y: params.y, width: 0, height: 0 }, params.selectionText.length > 0);
    });
    this.win.webContents.loadFile(path.join(RENDERER, 'chrome.html'));
    this.overlay.webContents.loadFile(path.join(RENDERER, 'overlay.html'));

    // Restore tabs (lazily — only the active one loads) or open the start page.
    if (opts.saved?.tabs.length) {
      for (const st of opts.saved.tabs) this.tabs.push(new Tab(this, { url: st.url, title: st.title, favicon: st.favicon, entries: st.entries, index: st.index, pinned: st.pinned }));
      const active = this.tabs[Math.min(opts.saved.active, this.tabs.length - 1)] ?? this.tabs[0];
      this.activate(active.id);
    }
    for (const url of opts.urls ?? []) this.newTab(url, { activate: true });
    if (!this.tabs.length) this.newTab(opts.url ?? NEWTAB, { activate: true });

    this.win.once('ready-to-show', () => {
      if (opts.saved?.maximized) this.win.maximize();
      this.win.show();
    });
    this.win.on('resize', () => {
      this.layout();
      if (this.tooltip || this.status) {
        this.tooltip = null;
        this.status = null;
        this.updateOverlay();
      }
    });
    for (const ev of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen'] as const) {
      this.win.on(ev as any, () => {
        this.layout();
        this.scheduleState();
      });
    }
    this.win.on('blur', () => {
      if (this.popup && !this.overlay.webContents.isFocused()) this.closePopup();
      this.tooltip = null;
      this.updateOverlay();
    });
    this.win.on('move', () => RyeWindow.app.broadcastSession());
    this.win.on('close', (e) => this.onClose(e));
    this.win.on('closed', () => this.onClosed());
    RyeWindow.all.add(this);
  }

  // ─── Theme ────────────────────────────────────────────────────────────────

  dark(): boolean {
    const mode = settings.get().appearance.theme;
    return mode === 'system' ? nativeTheme.shouldUseDarkColors : mode === 'dark';
  }

  theme(): ThemeOutput {
    return computeTheme(settings.get().appearance, this.dark(), this.isPrivate);
  }

  themePayload(): ThemePayload {
    return { settings: settings.get(), dark: this.dark(), private: this.isPrivate, platform: process.platform };
  }

  sheetRadius(): number {
    if (this.htmlFullscreen || this.win?.isFullScreen?.()) return 0;
    return Math.round(this.insets.radius);
  }

  /** Pushes the current theme to every surface this window owns. */
  applyTheme() {
    const t = this.theme();
    this.win.setBackgroundColor(t.frame);
    if (process.platform === 'win32') this.win.setTitleBarOverlay({ color: t.frame, symbolColor: t.text, height: this.titlebarHeight });
    for (const tab of this.tabs) tab.applySheetColor(tab.url);
    const payload = this.themePayload();
    this.win.webContents.send('ui:theme', payload);
    this.overlay.webContents.send('ui:theme', payload);
    for (const tab of this.tabs) if (isInternal(tab.url)) tab.wc?.send('page:theme', payload);
    this.layout();
  }

  // ─── State ────────────────────────────────────────────────────────────────

  get active(): Tab | undefined {
    return this.tabs.find((t) => t.id === this.activeId);
  }

  recordHistory() {
    return settings.get().privacy.saveHistory;
  }

  tabChanged(tab: Tab) {
    if (tab.id === this.activeId) this.syncViewVisibility(tab);
    this.scheduleState();
  }

  scheduleState() {
    if (this.stateQueued) return;
    this.stateQueued = true;
    setImmediate(() => {
      this.stateQueued = false;
      this.sendState();
    });
  }

  private sendState() {
    if (this.win.isDestroyed()) return;
    const active = this.active;
    const state: WindowState = {
      windowId: this.win.id,
      private: this.isPrivate,
      tabs: this.tabs.map((t) => t.state()),
      activeId: this.activeId,
      maximized: this.win.isMaximized(),
      fullscreen: this.win.isFullScreen(),
      htmlFullscreen: this.htmlFullscreen,
      platform: process.platform,
      bookmarkedActive: !!(active && bookmarks.findByUrl(active.url)),
      downloads: downloads.hasAny(this.isPrivate) ? downloads.summary(this.isPrivate) : { active: 0, progress: 0, recent: 0, eta: -1 },
      canReopen: this.isPrivate ? this.privateClosed.length > 0 : hasClosed(),
    };
    const json = JSON.stringify(state);
    if (json !== this.lastSent) {
      this.lastSent = json;
      this.win.webContents.send('ui:state', state);
    }
    const title = active ? `${active.title || 'New Tab'} — Rye${this.isPrivate ? ' (Private)' : ''}` : 'Rye';
    if (this.win.getTitle() !== title) this.win.setTitle(title);
    RyeWindow.app.broadcastSession();
  }

  hasDownloads() {
    return downloads.hasAny(this.isPrivate);
  }

  onUiReady() {
    this.uiReady = true;
    this.win.webContents.send('ui:theme', this.themePayload());
    this.win.webContents.send('ui:bookmarks', bookmarks.tree());
    this.lastSent = '';
    this.sendState();
    for (const fn of this.readyActions.splice(0)) fn();
  }

  private whenReady(fn: () => void) {
    if (this.uiReady) fn();
    else this.readyActions.push(fn);
  }

  // ─── Tabs ─────────────────────────────────────────────────────────────────

  newTab(url = NEWTAB, opts: { activate?: boolean; index?: number; opener?: Tab; webContents?: WebContents; pinned?: boolean; entries?: { url: string; title: string }[]; entryIndex?: number; title?: string; favicon?: string | null } = {}): Tab {
    const tab = new Tab(this, { url, webContents: opts.webContents, pinned: opts.pinned, entries: opts.entries, index: opts.entryIndex, title: opts.title, favicon: opts.favicon });
    let index = opts.index ?? this.tabs.length;
    if (opts.opener && opts.index === undefined) {
      const at = this.tabs.indexOf(opts.opener);
      if (at !== -1) {
        index = at + 1;
        while (index < this.tabs.length && this.openerOf.get(this.tabs[index]) === opts.opener) index++;
      }
      this.openerOf.set(tab, opts.opener);
    }
    const pinnedCount = this.tabs.filter((t) => t.pinned).length;
    index = tab.pinned ? Math.min(index, pinnedCount) : Math.max(index, pinnedCount);
    this.tabs.splice(Math.min(index, this.tabs.length), 0, tab);
    if (opts.activate !== false) this.activate(tab.id);
    else if (!opts.webContents) tab.ensureView(); // background tabs start loading right away
    this.scheduleState();
    return tab;
  }

  private openerOf = new WeakMap<Tab, Tab>();

  activate(id: number) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    const prev = this.active;
    if (prev && prev !== tab) {
      prev.lastActive = Date.now();
      if (prev.view) this.win.contentView.removeChildView(prev.view);
    }
    this.activeId = id;
    tab.lastActive = Date.now();
    const view = tab.ensureView();
    this.win.contentView.addChildView(view, 0);
    view.setBorderRadius(this.sheetRadius());
    this.layout();
    this.syncViewVisibility(tab);
    this.hideSuggest();
    if (this.popup && this.popup.req.kind !== 'permission') this.closePopup();
    if (tab.url.startsWith(NEWTAB) && !tab.wc?.navigationHistory.canGoBack()) this.focusAddress(true);
    else if (this.win.isFocused()) tab.wc?.focus();
    this.scheduleState();
    this.showNextPermission();
  }

  /** Error and crash states are drawn by the chrome itself behind a hidden view. */
  private syncViewVisibility(tab: Tab) {
    const view = tab.view;
    if (!view) return;
    view.setVisible(!tab.error && !tab.crashed);
  }

  detachView(view: WebContentsView) {
    try {
      this.win.contentView.removeChildView(view);
    } catch {
      /* already detached */
    }
  }

  closeTab(id: number) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    tab.requestClose();
  }

  /** Final removal once the page agreed to close (or closed itself). */
  tabDestroyed(tab: Tab) {
    const idx = this.tabs.indexOf(tab);
    if (idx === -1) return;
    const saved = { url: tab.url, title: tab.title, favicon: tab.favicon, pinned: tab.pinned, ...tab.entries() };
    const closed: ClosedTab = { ...saved, windowId: this.win.id, position: idx, closedAt: Date.now() };
    if (this.isPrivate) {
      this.privateClosed.push(closed);
      if (this.privateClosed.length > 25) this.privateClosed.shift();
    } else pushClosed(closed);

    const wasActive = tab.id === this.activeId;
    this.tabs.splice(idx, 1);
    for (const p of this.permQueue.filter((p) => p.tabId === tab.id)) p.resolve(false);
    this.permQueue = this.permQueue.filter((p) => p.tabId !== tab.id);
    tab.destroy();

    if (!this.tabs.length) {
      if (settings.get().tabs.closeWindowWithLastTab) {
        this.activeId = -1;
        this.win.close();
        return;
      }
      this.newTab(NEWTAB);
      return;
    }
    if (wasActive) {
      const opener = this.openerOf.get(tab);
      const next = opener && this.tabs.includes(opener) ? opener : this.tabs[Math.min(idx, this.tabs.length - 1)];
      this.activate(next.id);
    }
    this.scheduleState();
  }

  reopenClosed(index?: number) {
    const closed = this.isPrivate
      ? index === undefined
        ? this.privateClosed.pop()
        : this.privateClosed.splice(this.privateClosed.length - 1 - index, 1)[0]
      : index === undefined
        ? popClosed()
        : takeClosed(index);
    if (!closed) return;
    this.newTab(closed.url, { index: closed.position, pinned: closed.pinned, entries: closed.entries, entryIndex: closed.index, title: closed.title, favicon: closed.favicon });
  }

  moveTab(id: number, to: number) {
    const from = this.tabs.findIndex((t) => t.id === id);
    if (from === -1) return;
    const [tab] = this.tabs.splice(from, 1);
    const pinnedCount = this.tabs.filter((t) => t.pinned).length;
    let index = Math.max(0, Math.min(to, this.tabs.length));
    index = tab.pinned ? Math.min(index, pinnedCount) : Math.max(index, pinnedCount);
    this.tabs.splice(index, 0, tab);
    this.scheduleState();
  }

  togglePin(id: number) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    this.tabs.splice(this.tabs.indexOf(tab), 1);
    tab.pinned = !tab.pinned;
    const pinnedCount = this.tabs.filter((t) => t.pinned).length;
    this.tabs.splice(pinnedCount, 0, tab);
    this.scheduleState();
  }

  duplicate(id: number) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    const { entries, index } = tab.entries();
    this.newTab(tab.url, { index: this.tabs.indexOf(tab) + 1, entries, entryIndex: index, title: tab.title, favicon: tab.favicon, activate: true });
  }

  cycle(dir: 1 | -1) {
    const idx = this.tabs.findIndex((t) => t.id === this.activeId);
    if (idx === -1 || this.tabs.length < 2) return;
    this.activate(this.tabs[(idx + dir + this.tabs.length) % this.tabs.length].id);
  }

  toggleMute(id: number) {
    const tab = this.tabs.find((t) => t.id === id);
    const wc = tab?.wc;
    if (!tab || !wc) return;
    wc.setAudioMuted(!wc.isAudioMuted());
    tab.changed();
  }

  // ─── Layout ───────────────────────────────────────────────────────────────

  setInsets(insets: Insets, anchors: Record<string, Rect>, titlebarHeight: number) {
    const clean = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
    this.insets = { top: clean(insets.top), left: clean(insets.left), right: clean(insets.right), bottom: clean(insets.bottom), radius: clean(insets.radius) };
    this.anchors = anchors && typeof anchors === 'object' ? anchors : {};
    const th = Math.max(28, Math.min(80, clean(titlebarHeight)));
    if (th !== this.titlebarHeight) {
      this.titlebarHeight = th;
      if (process.platform === 'win32') {
        const t = this.theme();
        this.win.setTitleBarOverlay({ color: t.frame, symbolColor: t.text, height: th });
      }
    }
    for (const tab of this.tabs) tab.view?.setBorderRadius(this.sheetRadius());
    this.layout();
  }

  contentRect(): Rect {
    const [w, h] = this.win.getContentSize();
    const i = this.htmlFullscreen ? { top: 0, left: 0, right: 0, bottom: 0 } : this.insets;
    return { x: i.left, y: i.top, width: Math.max(0, w - i.left - i.right), height: Math.max(0, h - i.top - i.bottom) };
  }

  layout() {
    if (this.win.isDestroyed()) return;
    const view = this.active?.view;
    if (view) view.setBounds(this.contentRect());
    if (this.popup) {
      const [w, h] = this.win.getContentSize();
      this.setOverlayBounds({ x: 0, y: 0, width: w, height: h });
    }
  }

  setHtmlFullscreen(on: boolean) {
    this.htmlFullscreen = on;
    if (on && !this.win.isFullScreen()) this.win.setFullScreen(true);
    if (!on && this.win.isFullScreen()) this.win.setFullScreen(false);
    for (const tab of this.tabs) tab.view?.setBorderRadius(this.sheetRadius());
    this.layout();
    this.scheduleState();
  }

  toggleFullscreen() {
    this.win.setFullScreen(!this.win.isFullScreen());
  }

  // ─── Overlay layer ────────────────────────────────────────────────────────

  private setOverlayBounds(r: Rect) {
    const key = `${r.x},${r.y},${r.width},${r.height}`;
    if (key === this.overlayBounds) return;
    this.overlayBounds = key;
    this.overlay.setBounds({ x: Math.round(r.x), y: Math.round(r.y), width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)) });
  }

  private updateOverlay() {
    if (this.win.isDestroyed()) return;
    const wc = this.overlay.webContents;
    const [w, h] = this.win.getContentSize();
    let mode: string;
    if (this.popup) {
      mode = 'popup';
      wc.send('overlay:render', { mode, popup: this.popup.req, data: this.popup.refresh?.() ?? this.popup.req.data, size: { width: w, height: h } });
      this.setOverlayBounds({ x: 0, y: 0, width: w, height: h });
    } else if (this.suggest) {
      mode = 'suggest';
      wc.send('overlay:render', { mode, items: this.suggest.items, selected: this.suggest.selected });
      this.setOverlayBounds(this.suggest.rect);
    } else if (this.tooltip) {
      mode = 'tooltip';
      wc.send('overlay:render', { mode, text: this.tooltip.text, shortcut: this.tooltip.shortcut });
      this.setOverlayBounds(this.tooltip.rect);
    } else if (this.status) {
      mode = 'status';
      wc.send('overlay:render', { mode, text: this.status.text });
      this.setOverlayBounds(this.status.rect);
    } else {
      mode = 'none';
    }
    const visible = mode !== 'none';
    if (!visible && this.overlayVisible) {
      wc.send('overlay:render', { mode: 'none' });
    }
    if (visible !== this.overlayVisible) {
      this.overlayVisible = visible;
      this.overlay.setVisible(visible);
    }
  }

  showPopup(req: PopupRequest, opts: Omit<OpenPopup, 'req' | 'focusBack'> = {}) {
    if (this.win.isDestroyed()) return;
    if (this.popup) this.closePopup(false);
    const focusBack = this.win.webContents.isFocused() ? 'chrome' : 'page';
    this.popup = { req, focusBack, ...opts };
    this.tooltip = null;
    this.suggest = null;
    this.updateOverlay();
    this.overlay.webContents.focus();
  }

  refreshPopup(kind?: string) {
    if (!this.popup || (kind && this.popup.req.kind !== kind)) return;
    this.updateOverlay();
  }

  popupKind() {
    return this.popup?.req.kind ?? null;
  }

  closePopup(restoreFocus = true) {
    const p = this.popup;
    if (!p) return;
    this.popup = null;
    p.onDismiss?.();
    this.updateOverlay();
    if (restoreFocus && !this.win.isDestroyed() && this.win.isFocused()) {
      if (p.focusBack === 'chrome') this.win.webContents.focus();
      else this.active?.wc?.focus();
    }
  }

  popupAction(id: string, payload: unknown) {
    const p = this.popup;
    if (!p || typeof id !== 'string') return;
    const keep = p.onAction?.(id, payload);
    if (!keep && this.popup === p) {
      p.onDismiss = undefined;
      this.closePopup();
    }
  }

  showSuggest(items: unknown[], selected: number, rect: Rect) {
    if (this.popup) return;
    if (!Array.isArray(items) || !items.length) return this.hideSuggest();
    this.suggest = { items: items.slice(0, 12), selected, rect: clampRect(rect, this.win.getContentSize()) };
    this.updateOverlay();
  }

  hideSuggest() {
    if (!this.suggest) return;
    this.suggest = null;
    this.updateOverlay();
  }

  showTooltip(text: string, rect: Rect, shortcut?: string) {
    if (this.popup || this.suggest || typeof text !== 'string') return;
    this.tooltip = { text: text.slice(0, 200), shortcut: typeof shortcut === 'string' ? shortcut.slice(0, 40) : undefined, rect: clampRect(rect, this.win.getContentSize()) };
    this.updateOverlay();
  }

  hideTooltip() {
    if (!this.tooltip) return;
    this.tooltip = null;
    this.updateOverlay();
  }

  setStatus(tab: Tab, url: string) {
    if (tab.id !== this.activeId) return;
    if (!url) {
      if (!this.status) return;
      this.status = null;
    } else {
      const c = this.contentRect();
      let text = url;
      try {
        text = decodeURI(url);
      } catch {
        /* keep raw */
      }
      const width = Math.min(Math.max(120, c.width * 0.55), 34 + text.length * 6.6);
      this.status = { text, rect: { x: c.x + 6, y: c.y + c.height - 36, width, height: 32 } };
    }
    this.updateOverlay();
  }

  // ─── Popups & menus ───────────────────────────────────────────────────────

  openMenu(items: MenuItem[], anchor: Rect, onSelect: (id: string) => void, placement: PopupRequest['placement'] = 'below') {
    this.showPopup({ kind: 'menu', anchor, placement, data: { items } }, { onAction: (id) => void onSelect(id) });
  }

  openAppMenu(anchor: Rect) {
    const build = () => ({ items: appMenu({ zoom: this.active?.zoom ?? 1, isPrivate: this.isPrivate, fullscreen: this.win.isFullScreen() }) });
    this.showPopup(
      { kind: 'menu', anchor, placement: 'below', data: build(), context: 'app' },
      {
        refresh: build,
        onAction: (id) => {
          if (id === 'zoom-in' || id === 'zoom-out' || id === 'zoom-reset') {
            this.active?.stepZoom(id === 'zoom-in' ? 1 : id === 'zoom-out' ? -1 : 0);
            this.refreshPopup('menu');
            return true;
          }
          if (id.startsWith('closed:')) this.reopenClosed(Number(id.slice(7)));
          else this.command(id);
          return false;
        },
      },
    );
  }

  openTabMenu(tabId: number, point: Rect) {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const idx = this.tabs.indexOf(tab);
    const vertical = settings.get().appearance.tabLayout === 'vertical';
    const items = tabMenu({
      pinned: tab.pinned,
      muted: !!tab.wc?.isAudioMuted(),
      audible: tab.audible,
      hasOthers: this.tabs.length > 1,
      hasRight: idx < this.tabs.length - 1,
      canReopen: this.isPrivate ? this.privateClosed.length > 0 : hasClosed(),
      vertical,
    });
    this.openMenu(items, point, (id) => {
      switch (id) {
        case 'new-right':
          this.newTab(NEWTAB, { index: this.tabs.indexOf(tab) + 1 });
          break;
        case 'reload':
          tab.reload();
          break;
        case 'duplicate':
          this.duplicate(tab.id);
          break;
        case 'pin':
          this.togglePin(tab.id);
          break;
        case 'mute':
          this.toggleMute(tab.id);
          break;
        case 'copy-url':
          clipboard.writeText(tab.url);
          break;
        case 'bookmark':
          this.activate(tab.id);
          this.whenAnchored(() => this.openBookmarkPopover());
          break;
        case 'close':
          this.closeTab(tab.id);
          break;
        case 'close-others':
          for (const t of this.tabs.filter((t) => t !== tab && !t.pinned)) this.closeTab(t.id);
          break;
        case 'close-right':
          for (const t of this.tabs.slice(this.tabs.indexOf(tab) + 1)) this.closeTab(t.id);
          break;
        case 'reopen':
          this.reopenClosed();
          break;
      }
    }, 'point');
  }

  private whenAnchored(fn: () => void) {
    setTimeout(fn, 60);
  }

  openStripMenu(point: Rect) {
    const vertical = settings.get().appearance.tabLayout === 'vertical';
    this.openMenu(stripMenu({ canReopen: hasClosed(), vertical }), point, (id) => {
      if (id === 'new-tab') this.newTab();
      else if (id === 'reopen') this.reopenClosed();
      else if (id === 'layout') settings.set('appearance.tabLayout', vertical ? 'horizontal' : 'vertical');
      else if (id === 'customize') this.openInternal('settings', '?section=appearance');
    }, 'point');
  }

  openToolbarMenu(point: Rect) {
    this.showPopup(
      { kind: 'menu', anchor: point, placement: 'point', data: { items: toolbarMenu() } },
      {
        refresh: () => ({ items: toolbarMenu() }),
        onAction: (id) => {
          const a = settings.get().appearance;
          if (id.startsWith('tb:')) {
            const b = id.slice(3) as any;
            settings.set('appearance.toolbarButtons', a.toolbarButtons.includes(b) ? a.toolbarButtons.filter((x) => x !== b) : [...a.toolbarButtons, b]);
            this.refreshPopup();
            return true;
          }
          if (id.startsWith('bb:')) {
            settings.set('appearance.bookmarksBar', id.slice(3));
            this.refreshPopup();
            return true;
          }
          if (id === 'customize') this.openInternal('settings', '?section=appearance');
          return false;
        },
      },
    );
  }

  async openInputMenu(point: Rect, hasSelection: boolean) {
    const text = await Promise.resolve(clipboard.readText());
    this.openMenu(inputMenu({ hasSelection, canPaste: !!text, clipboardText: text }), point, (id) => {
      const wc = this.win.webContents;
      wc.focus();
      if (id === 'paste-go') {
        if (text.trim()) this.navigateInput(text.trim(), 'current');
        return;
      }
      const map: Record<string, () => void> = { undo: () => wc.undo(), cut: () => wc.cut(), copy: () => wc.copy(), paste: () => wc.paste(), 'select-all': () => wc.selectAll() };
      map[id]?.();
    }, 'point');
  }

  openNavHistory(dir: 'back' | 'forward', anchor: Rect) {
    const wc = this.active?.wc;
    if (!wc) return;
    const nav = wc.navigationHistory;
    const all = nav.getAllEntries();
    const cur = nav.getActiveIndex();
    const list = (dir === 'back' ? all.slice(0, cur).map((e, i) => ({ ...e, index: i })).reverse() : all.slice(cur + 1).map((e, i) => ({ ...e, index: cur + 1 + i }))).slice(0, 14);
    if (!list.length) return;
    this.openMenu(historyMenu(list.map((e) => ({ title: e.title, url: e.url, index: e.index }))), anchor, (id) => {
      if (id.startsWith('go:')) nav.goToIndex(Number(id.slice(3)));
      else if (id === 'show-history') this.openInternal('history');
    });
  }

  openFolderMenu(folderId: string, anchor: Rect) {
    this.openMenu(folderMenu(folderId), anchor, (id) => this.bookmarkMenuAction(id, false));
  }

  private bookmarkMenuAction(id: string, newTab: boolean) {
    if (id.startsWith('bm:')) {
      const b = bookmarks.get(id.slice(3));
      if (b?.url) newTab ? this.newTab(b.url) : this.navigate(b.url);
    } else if (id.startsWith('openall:')) {
      for (const b of bookmarks.children(id.slice(8))) if (b.url) this.newTab(b.url, { activate: false });
    }
  }

  openBookmarkItemMenu(bookmarkId: string, point: Rect) {
    const b = bookmarks.get(bookmarkId);
    if (!b) return;
    this.openMenu(bookmarkItemMenu(b.type === 'folder'), point, (id) => {
      switch (id) {
        case 'open-all':
          for (const c of bookmarks.children(b.id)) if (c.url) this.newTab(c.url, { activate: false });
          break;
        case 'open-new':
          if (b.url) this.newTab(b.url);
          break;
        case 'open-window':
          if (b.url) RyeWindow.app.newWindow({ url: b.url });
          break;
        case 'open-private':
          if (b.url) RyeWindow.app.newWindow({ url: b.url, isPrivate: true });
          break;
        case 'edit':
          this.whenAnchored(() => this.openBookmarkPopover(b.id, point));
          break;
        case 'delete':
          bookmarks.remove(b.id);
          break;
        case 'manager':
          this.openInternal('bookmarks');
          break;
      }
    }, 'point');
  }

  /** Bookmark editor popover. Adds the active page first when it isn't bookmarked yet. */
  openBookmarkPopover(bookmarkId?: string, anchor?: Rect) {
    const tab = this.active;
    let b = bookmarkId ? bookmarks.get(bookmarkId) : tab ? bookmarks.findByUrl(tab.url) : undefined;
    let isNew = false;
    if (!b) {
      if (!tab || (isInternal(tab.url) && tab.url.startsWith(NEWTAB))) return;
      b = bookmarks.add({ title: tab.title, url: tab.url, favicon: tab.favicon ?? undefined });
      isNew = true;
    }
    const target = b;
    const folders: { id: string; title: string; depth: number }[] = [];
    const tree = bookmarks.tree();
    const walk = (id: string, depth: number) => {
      const f = bookmarks.get(id);
      if (!f) return;
      folders.push({ id: f.id, title: f.title, depth });
      for (const c of bookmarks.children(id)) if (c.type === 'folder' && c.id !== target.id) walk(c.id, depth + 1);
    };
    walk(tree.barId, 0);
    walk(tree.otherId, 0);
    this.showPopup(
      { kind: 'bookmark', anchor: anchor ?? this.anchors.star ?? this.anchors.address ?? { x: 200, y: 40, width: 0, height: 0 }, placement: 'below', data: { bookmark: target, folders, isNew } },
      {
        onAction: (id, payload) => {
          if (id === 'save' && payload && typeof payload === 'object') {
            bookmarks.update(target.id, { title: String((payload as any).title ?? target.title), url: typeof (payload as any).url === 'string' ? (payload as any).url : undefined, parentId: String((payload as any).parentId ?? target.parentId) });
          } else if (id === 'remove') bookmarks.remove(target.id);
          else if (id === 'manager') this.openInternal('bookmarks');
          return false;
        },
      },
    );
  }

  openSiteInfo(anchor: Rect) {
    const tab = this.active;
    if (!tab) return;
    const build = () => {
      const t = this.active ?? tab;
      const origin = originOf(t.url);
      const decisions = this.isPrivate ? [] : permissions.forOrigin(origin);
      return {
        url: t.url,
        host: displayUrl(origin) || displayUrl(t.url),
        origin,
        security: t.security(),
        private: this.isPrivate,
        permissions: decisions.map((d) => ({ ...d, label: PERMISSION_LABELS[d.permission] ?? d.permission })),
        zoom: t.zoom,
      };
    };
    this.showPopup(
      { kind: 'siteinfo', anchor, placement: 'below', data: build() },
      {
        refresh: build,
        onAction: (id, payload: any) => {
          const origin = originOf(tab.url);
          if (id === 'perm' && payload && typeof payload.permission === 'string') {
            permissions.set(origin, payload.permission, payload.decision === 'allow' ? 'allow' : payload.decision === 'block' ? 'block' : 'ask');
            this.refreshPopup('siteinfo');
            return true;
          }
          if (id === 'clear-site') {
            this.session.clearStorageData({ origin }).then(() => tab.reload());
            permissions.clearOrigin(origin);
            return false;
          }
          if (id === 'site-settings') this.openInternal('settings', '?section=privacy');
          if (id === 'zoom-reset') {
            tab.stepZoom(0);
            this.refreshPopup('siteinfo');
            return true;
          }
          return false;
        },
      },
    );
  }

  openDownloads(anchor: Rect) {
    downloads.markSeen();
    const build = () => ({ entries: downloads.list(this.isPrivate).slice(0, 6).map((e) => ({ ...e, exists: e.state !== 'completed' || downloads.exists(e) })) });
    this.showPopup(
      { kind: 'downloads', anchor, placement: 'below', data: build() },
      {
        refresh: build,
        onAction: (id, payload: any) => {
          if (id === 'dl' && payload && typeof payload.id === 'string') {
            downloads.action(payload.id, String(payload.action));
            return payload.action !== 'open' && payload.action !== 'show';
          }
          if (id === 'all') this.openInternal('downloads');
          return false;
        },
      },
    );
  }

  openZoomPopover(anchor: Rect) {
    const build = () => ({ zoom: this.active?.zoom ?? 1 });
    this.showPopup(
      { kind: 'zoom', anchor, placement: 'below', data: build() },
      {
        refresh: build,
        onAction: (id) => {
          this.active?.stepZoom(id === 'in' ? 1 : id === 'out' ? -1 : 0);
          this.refreshPopup('zoom');
          return id !== 'reset';
        },
      },
    );
  }

  confirm(opts: { title: string; body: string; confirm: string; cancel?: string; danger?: boolean }, onConfirm: () => void) {
    const [w, h] = this.win.getContentSize();
    this.showPopup({ kind: 'confirm', anchor: { x: w / 2, y: h / 3, width: 0, height: 0 }, data: opts }, { onAction: (id) => void (id === 'confirm' && onConfirm()) });
  }

  confirmLeave(tab: Tab) {
    this.activate(tab.id);
    this.confirm({ title: 'Leave this page?', body: 'Changes you made may not be saved.', confirm: 'Leave', cancel: 'Stay', danger: true }, () => {
      this.tabDestroyed(tab);
    });
  }

  confirmLeaveSync(): boolean {
    const r = dialog.showMessageBoxSync(this.win, { type: 'question', buttons: ['Leave', 'Stay'], defaultId: 1, cancelId: 1, message: 'Leave this page?', detail: 'Changes you made may not be saved.' });
    return r === 0;
  }

  pageContextMenu(tab: Tab, params: ContextMenuParams) {
    const s = settings.get().search;
    const engine = s.engines.find((e) => e.id === s.engine) ?? s.engines[0];
    const wc = tab.wc;
    if (!wc) return;
    const c = this.contentRect();
    const items = pageMenu(params, { canBack: wc.navigationHistory.canGoBack(), canForward: wc.navigationHistory.canGoForward(), engineName: engine.name, isPrivate: this.isPrivate, internal: isInternal(tab.url) });
    this.openMenu(items, { x: c.x + params.x, y: c.y + params.y, width: 0, height: 0 }, (id) => {
      const link = params.linkURL;
      const src = params.srcURL;
      switch (id) {
        case 'link-tab':
          this.newTab(link, { activate: !settings.get().tabs.openLinksInBackground, opener: tab });
          break;
        case 'link-window':
          RyeWindow.app.newWindow({ url: link, isPrivate: this.isPrivate });
          break;
        case 'link-private':
          RyeWindow.app.newWindow({ url: link, isPrivate: true });
          break;
        case 'link-copy':
          clipboard.writeText(link);
          break;
        case 'link-save':
          wc.downloadURL(link);
          break;
        case 'img-tab':
          this.newTab(src, { activate: false, opener: tab });
          break;
        case 'img-save':
        case 'media-save':
          wc.downloadURL(src);
          break;
        case 'img-copy':
          wc.copyImageAt(params.x, params.y);
          break;
        case 'img-copy-url':
          clipboard.writeText(src);
          break;
        case 'media-toggle':
          wc.executeJavaScript(`(() => { const el = document.elementFromPoint(${params.x}, ${params.y}); const m = el && el.closest('video,audio'); if (m) m.paused ? m.play() : m.pause(); })()`).catch(() => {});
          break;
        case 'media-loop':
          wc.executeJavaScript(`(() => { const el = document.elementFromPoint(${params.x}, ${params.y}); const m = el && el.closest('video,audio'); if (m) m.loop = !m.loop; })()`).catch(() => {});
          break;
        case 'media-controls':
          wc.executeJavaScript(`(() => { const el = document.elementFromPoint(${params.x}, ${params.y}); const m = el && el.closest('video,audio'); if (m) m.controls = !m.controls; })()`).catch(() => {});
          break;
        case 'media-pip':
          wc.executeJavaScript(`(() => { const el = document.elementFromPoint(${params.x}, ${params.y}); const m = el && el.closest('video'); if (m) m.requestPictureInPicture().catch(() => {}); })()`, true).catch(() => {});
          break;
        case 'spell-add':
          wc.session.addWordToSpellCheckerDictionary(params.misspelledWord);
          break;
        case 'undo':
          wc.undo();
          break;
        case 'redo':
          wc.redo();
          break;
        case 'cut':
          wc.cut();
          break;
        case 'copy':
          wc.copy();
          break;
        case 'paste':
          wc.paste();
          break;
        case 'paste-plain':
          wc.pasteAndMatchStyle();
          break;
        case 'select-all':
          wc.selectAll();
          break;
        case 'search-selection':
          this.newTab(resolveInput(params.selectionText.trim().slice(0, 500), s.engines, s.engine).url, { opener: tab });
          break;
        case 'inspect':
          wc.inspectElement(params.x, params.y);
          break;
        default:
          if (id.startsWith('spell:')) wc.replaceMisspelling(id.slice(6));
          else this.command(id);
      }
      wc.focus();
    }, 'point');
  }

  // ─── Permissions ──────────────────────────────────────────────────────────

  askPermission(tab: Tab, origin: string, permission: string, label: string): Promise<boolean | null> {
    return new Promise((resolve) => {
      this.permQueue.push({ tabId: tab.id, origin, permission, label, resolve });
      this.showNextPermission();
    });
  }

  private showNextPermission() {
    if (this.popup) return;
    const next = this.permQueue.find((p) => p.tabId === this.activeId);
    if (!next) return;
    let answered = false;
    const finish = (v: boolean | null) => {
      if (answered) return;
      answered = true;
      this.permQueue = this.permQueue.filter((p) => p !== next);
      next.resolve(v);
      setTimeout(() => this.showNextPermission(), 50);
    };
    this.whenReady(() =>
      this.showPopup(
        { kind: 'permission', anchor: this.anchors.siteInfo ?? { x: 120, y: 60, width: 24, height: 24 }, placement: 'below', data: { origin: displayUrl(next.origin), label: next.label, permission: next.permission } },
        {
          onAction: (id) => finish(id === 'allow' ? true : id === 'block' ? false : null),
          onDismiss: () => finish(null),
        },
      ),
    );
  }

  // ─── Navigation ───────────────────────────────────────────────────────────

  navigate(url: string, tab = this.active) {
    if (!tab) return;
    tab.navigate(url);
    if (tab.id === this.activeId) tab.wc?.focus();
  }

  /** Handles text submitted from the address bar. */
  navigateInput(text: string, disposition: 'current' | 'new' | 'background' = 'current') {
    const s = settings.get();
    const r = resolveInput(text, s.search.engines, s.search.engine, s.privacy.httpsFirst);
    const upgraded = !r.isSearch && !/^[a-z][a-z0-9+.-]*:\/\//i.test(text.trim()) && r.url.startsWith('https://');
    if (disposition !== 'current') {
      const t = this.newTab(r.url, { activate: disposition === 'new' });
      void t;
      return;
    }
    const tab = this.active;
    if (!tab) return;
    tab.navigate(r.url, { upgraded });
    tab.wc?.focus();
  }

  goHome() {
    const home = settings.get().general.homepage || NEWTAB;
    this.navigate(home);
  }

  openInternal(page: string, query = '') {
    const url = `rye://${page}/${query}`;
    const existing = this.tabs.find((t) => t.url.startsWith(`rye://${page}`));
    if (existing) {
      this.activate(existing.id);
      if (query && existing.url !== url) existing.navigate(url);
      return;
    }
    const tab = this.active;
    if (tab && tab.url.startsWith(NEWTAB) && !tab.wc?.navigationHistory.canGoBack()) {
      tab.navigate(url);
      return;
    }
    this.newTab(url);
  }

  focusAddress(selectAll = true, text?: string) {
    this.whenReady(() => {
      this.win.webContents.focus();
      this.win.webContents.send('ui:focus-address', { selectAll, text });
    });
  }

  handleWindowOpen(opener: Tab, details: HandlerDetails): WindowOpenHandlerResponse {
    if (details.url.startsWith('rye:') && !isInternal(opener.url)) return { action: 'deny' };
    if (details.url.startsWith('rye:')) {
      this.newTab(details.url, { opener });
      return { action: 'deny' };
    }
    const background = details.disposition === 'background-tab';
    return {
      action: 'allow',
      outlivesOpener: true,
      createWindow: (options) => {
        const tab = this.newTab(details.url, { webContents: (options as any).webContents, opener, activate: !background });
        return tab.wc!;
      },
    };
  }

  sendFindResult(tab: Tab) {
    this.win.webContents.send('ui:find-result', { tabId: tab.id, ...tab.findResult });
  }

  syncZoom(source: Tab) {
    const origin = originOf(source.url);
    for (const t of this.tabs) if (t !== source && t.wc && originOf(t.url) === origin) t.zoom = t.wc.getZoomFactor();
    this.scheduleState();
  }

  // ─── Input & commands ─────────────────────────────────────────────────────

  handleInput(event: Electron.Event, input: Input, tab?: Tab) {
    if (input.type !== 'keyDown') return;
    if (input.key === 'Escape' && tab && !input.control && !input.meta && !input.alt) {
      if (tab.loading) tab.wc?.stop();
      if (this.htmlFullscreen) return;
      return;
    }
    const cmd = matchShortcut(input);
    if (!cmd) return;
    event.preventDefault();
    if (this.popup && cmd !== 'quit') this.closePopup(false);
    this.command(cmd);
  }

  command(cmd: string) {
    const tab = this.active;
    const wc = tab?.wc;
    if (cmd.startsWith('tab:')) {
      const t = this.tabs[Number(cmd.slice(4))];
      if (t) this.activate(t.id);
      return;
    }
    switch (cmd) {
      case 'new-tab':
        this.newTab();
        break;
      case 'new-window':
        RyeWindow.app.newWindow({ isPrivate: this.isPrivate });
        break;
      case 'new-private':
        RyeWindow.app.newWindow({ isPrivate: true });
        break;
      case 'close-tab':
        if (tab) this.closeTab(tab.id);
        break;
      case 'close-window':
        this.win.close();
        break;
      case 'reopen':
        this.reopenClosed();
        break;
      case 'next-tab':
        this.cycle(1);
        break;
      case 'prev-tab':
        this.cycle(-1);
        break;
      case 'last-tab':
        if (this.tabs.length) this.activate(this.tabs[this.tabs.length - 1].id);
        break;
      case 'focus-address':
        this.focusAddress(true);
        break;
      case 'focus-search':
        this.focusAddress(true, '');
        break;
      case 'reload':
        tab?.reload();
        break;
      case 'hard-reload':
        tab?.reload(true);
        break;
      case 'stop':
        wc?.stop();
        break;
      case 'back':
        if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
        break;
      case 'forward':
        if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
        break;
      case 'home':
        this.goHome();
        break;
      case 'find':
        if (tab && !tab.sleeping) this.whenReady(() => (this.win.webContents.focus(), this.win.webContents.send('ui:find', { open: true })));
        break;
      case 'find-next':
      case 'find-prev':
        if (tab?.findActive && tab.findText) tab.find(tab.findText, cmd === 'find-next', true);
        else this.command('find');
        break;
      case 'bookmark':
        this.openBookmarkPopover();
        break;
      case 'toggle-bookmarks-bar': {
        const cur = settings.get().appearance.bookmarksBar;
        settings.set('appearance.bookmarksBar', cur === 'always' ? 'never' : 'always');
        break;
      }
      case 'toggle-sidebar':
        if (settings.get().appearance.tabLayout === 'vertical') settings.set('appearance.sidebarCollapsed', !settings.get().appearance.sidebarCollapsed);
        else settings.set('appearance.tabLayout', 'vertical');
        break;
      case 'bookmarks':
        this.openInternal('bookmarks');
        break;
      case 'history':
        this.openInternal('history');
        break;
      case 'downloads':
        this.openInternal('downloads');
        break;
      case 'settings':
        this.openInternal('settings');
        break;
      case 'clear-data':
        this.openInternal('settings', '?section=privacy&clear=1');
        break;
      case 'about':
        this.openInternal('settings', '?section=about');
        break;
      case 'task-info':
        this.openInternal('settings', '?section=about&perf=1');
        break;
      case 'zoom-in':
        tab?.stepZoom(1);
        break;
      case 'zoom-out':
        tab?.stepZoom(-1);
        break;
      case 'zoom-reset':
        tab?.stepZoom(0);
        break;
      case 'fullscreen':
        if (this.htmlFullscreen) wc?.executeJavaScript('document.exitFullscreen && document.exitFullscreen()').catch(() => {});
        this.toggleFullscreen();
        break;
      case 'print':
        wc?.print({}, () => {});
        break;
      case 'save-page':
        if (wc && tab && !isInternal(tab.url)) void this.savePage(tab);
        break;
      case 'view-source':
        if (tab && /^https?:/.test(tab.url)) this.newTab(`view-source:${tab.url}`, { opener: tab });
        break;
      case 'devtools':
        if (wc) wc.isDevToolsOpened() ? wc.closeDevTools() : wc.openDevTools({ mode: 'right' });
        break;
      case 'mute-tab':
        if (tab) this.toggleMute(tab.id);
        break;
      case 'quit':
        RyeWindow.app.quit();
        break;
    }
  }

  private async savePage(tab: Tab) {
    const wc = tab.wc;
    if (!wc) return;
    const name = (tab.title || 'page').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
    const r = await dialog.showSaveDialog(this.win, {
      defaultPath: path.join(require('electron').app.getPath('downloads'), `${name}.html`),
      filters: [
        { name: 'Web page, complete', extensions: ['html'] },
        { name: 'Web page, HTML only', extensions: ['htm'] },
      ],
    });
    if (r.canceled || !r.filePath) return;
    await wc.savePage(r.filePath, r.filePath.endsWith('.htm') ? 'HTMLOnly' : 'HTMLComplete').catch(() => {});
  }

  // ─── Session & lifecycle ──────────────────────────────────────────────────

  snapshot(): SavedWindow {
    return {
      tabs: this.tabs.map((t) => ({ url: t.url, title: t.title, favicon: t.favicon, pinned: t.pinned, ...t.entries() })),
      active: Math.max(0, this.tabs.findIndex((t) => t.id === this.activeId)),
      bounds: this.win.isDestroyed() ? undefined : this.win.getNormalBounds(),
      maximized: this.win.isDestroyed() ? false : this.win.isMaximized(),
    };
  }

  private onClose(e: Electron.Event) {
    if (this.forceClose || RyeWindow.quitting) return;
    const many = this.tabs.length >= 8;
    if (many && settings.get().general.confirmQuitWithManyTabs) {
      e.preventDefault();
      this.confirm({ title: `Close ${this.tabs.length} tabs?`, body: 'This window and all of its tabs will close.', confirm: 'Close window', cancel: 'Cancel' }, () => {
        this.forceClose = true;
        this.win.close();
      });
    }
  }

  static quitting = false;

  private onClosed() {
    RyeWindow.all.delete(this);
    for (const p of this.permQueue) p.resolve(false);
    this.permQueue = [];
    for (const t of this.tabs) t.destroy();
    if (!this.overlay.webContents.isDestroyed()) this.overlay.webContents.close();
    if (!RyeWindow.quitting) RyeWindow.app.broadcastSession();
    this.closedListeners.forEach((fn) => fn());
  }

  closedListeners: (() => void)[] = [];

  static fromWebContents(wc: WebContents): { win: RyeWindow; role: 'chrome' | 'overlay' | 'tab'; tab?: Tab } | null {
    for (const w of RyeWindow.all) {
      if (w.win.isDestroyed()) continue;
      if (w.win.webContents === wc) return { win: w, role: 'chrome' };
      if (w.overlay.webContents === wc) return { win: w, role: 'overlay' };
      const tab = w.tabs.find((t) => t.wc === wc);
      if (tab) return { win: w, role: 'tab', tab };
    }
    return null;
  }

  static focused(): RyeWindow | undefined {
    const f = BrowserWindow.getFocusedWindow();
    return [...RyeWindow.all].find((w) => w.win === f) ?? [...RyeWindow.all].filter((w) => !w.isPrivate).pop() ?? [...RyeWindow.all].pop();
  }
}

function clampRect(r: Rect, [w, h]: number[]): Rect {
  const n = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const width = Math.max(1, Math.min(n(r?.width, 100), w));
  const height = Math.max(1, Math.min(n(r?.height, 30), h));
  return { x: Math.max(0, Math.min(n(r?.x), w - width)), y: Math.max(0, Math.min(n(r?.y), h - height)), width, height };
}

function restoreBounds(b?: { x: number; y: number; width: number; height: number }) {
  const area = screen.getPrimaryDisplay().workArea;
  const fallback = { width: Math.min(1320, Math.round(area.width * 0.86)), height: Math.min(880, Math.round(area.height * 0.88)) };
  if (!b || b.width < 440 || b.height < 320) return fallback;
  // Only reuse a saved position if it's still visible on a connected display.
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x + 80 < a.x + a.width && b.x + b.width - 80 > a.x && b.y >= a.y - 10 && b.y + 40 < a.y + a.height;
  });
  return visible ? b : { width: b.width, height: b.height };
}

let iconCache: Electron.NativeImage | undefined;
function appIcon() {
  if (iconCache) return iconCache;
  const p = path.join(__dirname, '../../build/icon.png');
  iconCache = fs.existsSync(p) ? nativeImage.createFromPath(p) : undefined;
  return iconCache;
}

