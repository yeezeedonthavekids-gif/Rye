import { app, WebContentsView, type WebContents } from 'electron';
import { compatUserAgent, needsCompatUA } from './compat';
import path from 'node:path';
import { INTERNAL_TITLES } from '../shared/defaults';
import type { SecurityState, TabErrorInfo, TabState } from '../shared/types';
import { isInternal } from '../shared/url';
import { history } from './history';
import type { RyeWindow } from './window';

let nextId = 1;

export interface SavedEntry {
  url: string;
  title: string;
}

/** `upgraded` is true when Rye upgraded a typed address to https and that attempt failed. */
export type TabError = TabErrorInfo;

const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

export class Tab {
  readonly id = nextId++;
  view: WebContentsView | null = null;
  url: string;
  title: string;
  favicon: string | null = null;
  loading = false;
  progress = 0;
  pinned = false;
  audible = false;
  muted = false;
  crashed: 'crashed' | 'unresponsive' | null = null;
  error: TabError | null = null;
  zoom = 1;
  lastActive = Date.now();
  findActive = false;
  findText = '';
  findResult = { active: 0, matches: 0 };
  /** Back/forward entries kept while the tab has no live WebContents. */
  private pendingEntries: SavedEntry[] | null = null;
  private pendingIndex = 0;
  private upgradedUrl: string | null = null;
  private progressTimer: NodeJS.Timeout | null = null;

  constructor(
    readonly win: RyeWindow,
    init: { url: string; title?: string; favicon?: string | null; entries?: SavedEntry[]; index?: number; pinned?: boolean; webContents?: WebContents },
  ) {
    this.url = init.url;
    this.title = init.title || this.defaultTitle(init.url);
    this.pinned = !!init.pinned;
    this.favicon = typeof init.favicon === 'string' && /^(https?|data):/.test(init.favicon) ? init.favicon : null;
    if (init.entries?.length) {
      this.pendingEntries = init.entries;
      this.pendingIndex = Math.min(Math.max(0, init.index ?? init.entries.length - 1), init.entries.length - 1);
    }
    if (init.webContents) this.createView(init.webContents);
  }

  /** The live WebContents. Electron clears view.webContents once it's destroyed, so keep our own reference. */
  private contents: WebContents | null = null;

  get wc(): WebContents | null {
    const wc = this.view ? this.contents : null;
    return wc && !wc.isDestroyed() ? wc : null;
  }

  get sleeping() {
    return !this.view;
  }

  private defaultTitle(url: string) {
    if (isInternal(url)) {
      try {
        return INTERNAL_TITLES[new URL(url).host] ?? 'Rye';
      } catch {
        return 'Rye';
      }
    }
    return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') || 'New Tab';
  }

  /** Creates the live WebContents, lazily, the first time the tab is shown. */
  ensureView(): WebContentsView {
    if (this.view) return this.view;
    this.createView();
    return this.view!;
  }

  private createView(adopt?: WebContents) {
    const view = adopt
      ? new WebContentsView({ webContents: adopt })
      : new WebContentsView({
          webPreferences: {
            session: this.win.session,
            preload: path.join(__dirname, '../preload/page.js'),
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: false,
            spellcheck: true,
            safeDialogs: true,
            navigateOnDragDrop: false,
          },
        });
    this.view = view;
    this.contents = view.webContents;
    this.applySheetColor(this.url);
    view.setBorderRadius(this.win.sheetRadius());
    this.bind(view.webContents);

    if (!adopt) {
      if (this.pendingEntries?.length) {
        const entries = this.pendingEntries;
        const index = this.pendingIndex;
        this.pendingEntries = null;
        view.webContents.navigationHistory.restore({ entries, index }).catch(() => view.webContents.loadURL(entries[index].url).catch(() => {}));
      } else {
        this.navigate(this.url);
      }
    }
  }

  private bind(wc: WebContents) {
    wc.setWindowOpenHandler((details) => this.win.handleWindowOpen(this, details));
    wc.on('did-start-loading', () => {
      this.loading = true;
      this.crashed = null;
      this.setProgress(0.1);
      this.changed();
    });
    wc.on('did-start-navigation', (details) => {
      if (!details.isMainFrame || details.isSameDocument) return;
      this.applySheetColor(details.url);
      // Keep navigator.userAgent consistent with the request headers on sign-in pages.
      const compat = needsCompatUA(details.url);
      if (compat !== this.compatUA) {
        this.compatUA = compat;
        wc.setUserAgent(compat ? compatUserAgent() : app.userAgentFallback);
      }
      this.setProgress(0.25);
    });
    wc.on('dom-ready', () => this.setProgress(0.7));
    wc.on('did-stop-loading', () => {
      this.loading = false;
      this.setProgress(1);
      this.changed();
    });
    wc.on('did-navigate', (_e, url) => {
      const sameHost = safeHost(url) === safeHost(this.url);
      this.url = url;
      this.error = null;
      if (!sameHost) this.favicon = null;
      if (url !== this.upgradedUrl) this.upgradedUrl = null;
      this.zoom = wc.getZoomFactor();
      if (this.findActive) this.stopFind();
      if (!this.win.isPrivate && this.win.recordHistory()) history.add(url, wc.getTitle(), this.favicon ?? undefined);
      this.changed();
    });
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (!isMainFrame) return;
      this.url = url;
      if (!this.win.isPrivate && this.win.recordHistory()) history.add(url, wc.getTitle(), this.favicon ?? undefined);
      this.changed();
    });
    wc.on('page-title-updated', (_e, title) => {
      this.title = title || this.defaultTitle(this.url);
      if (!this.win.isPrivate) history.updateTitle(this.url, title);
      this.changed();
    });
    wc.on('page-favicon-updated', (_e, favicons) => {
      const icon = favicons.find((f) => /^(https?|data):/.test(f)) ?? null;
      this.favicon = icon;
      if (icon && !this.win.isPrivate) history.updateTitle(this.url, '', icon);
      this.changed();
    });
    wc.on('did-fail-load', (_e, code, description, validatedURL, isMainFrame) => {
      // -3 is ERR_ABORTED: a navigation replaced by another, or a download.
      if (!isMainFrame || code === -3) return;
      this.error = { code, description, url: validatedURL, upgraded: this.upgradedUrl === validatedURL };
      this.url = validatedURL || this.url;
      this.title = safeHost(validatedURL) || 'Page unavailable';
      this.favicon = null;
      this.changed();
    });
    wc.on('render-process-gone', (_e, details) => {
      if (details.reason === 'clean-exit') return;
      this.crashed = 'crashed';
      this.loading = false;
      this.changed();
    });
    wc.on('unresponsive', () => {
      this.crashed = 'unresponsive';
      this.changed();
    });
    wc.on('responsive', () => {
      if (this.crashed === 'unresponsive') this.crashed = null;
      this.changed();
    });
    wc.on('audio-state-changed', (e) => {
      this.audible = e.audible;
      this.changed();
    });
    wc.on('found-in-page', (_e, result) => {
      this.findResult = { active: result.activeMatchOrdinal, matches: result.matches };
      this.win.sendFindResult(this);
    });
    wc.on('zoom-changed', (_e, direction) => this.stepZoom(direction === 'in' ? 1 : -1));
    wc.on('context-menu', (_e, params) => this.win.pageContextMenu(this, params));
    wc.on('before-input-event', (event, input) => this.win.handleInput(event, input, this));
    wc.on('update-target-url', (_e, url) => this.win.setStatus(this, url));
    wc.on('enter-html-full-screen', () => this.win.setHtmlFullscreen(true));
    wc.on('leave-html-full-screen', () => this.win.setHtmlFullscreen(false));
    wc.on('will-frame-navigate', (event) => {
      // Web content may never navigate itself (or a frame) into privileged rye:// pages.
      if (event.url.startsWith('rye:') && !isInternal(this.url) && event.initiator) event.preventDefault();
    });
    wc.on('will-prevent-unload', (event) => {
      // The page has unsaved changes. When the user is closing the tab we cancel
      // the close and ask in Rye's own dialog; for navigations we must decide
      // synchronously, so the window asks with a native prompt.
      if (this.closing) {
        this.closing = false;
        if (this.closeTimer) clearTimeout(this.closeTimer);
        this.win.confirmLeave(this);
        return;
      }
      if (this.win.confirmLeaveSync()) event.preventDefault();
    });
    wc.once('destroyed', () => {
      // Pages may close themselves (window.close()); sleeping tabs also destroy
      // their contents, but they detach the view first.
      if (this.view && this.contents === wc) {
        const view = this.view;
        this.view = null;
        this.contents = null;
        this.win.detachView(view);
        this.win.tabDestroyed(this);
      }
    });
  }

  closing = false;
  private compatUA = false;
  private closeTimer: NodeJS.Timeout | null = null;

  /** Closes the tab, giving the page a chance to warn about unsaved changes. */
  requestClose() {
    const wc = this.wc;
    if (!wc || this.crashed || this.error) {
      this.win.tabDestroyed(this);
      return;
    }
    this.closing = true;
    wc.close({ waitForBeforeUnload: true });
    // A hung page must not keep the tab alive.
    this.closeTimer = setTimeout(() => {
      if (this.closing) this.win.tabDestroyed(this);
    }, 2500);
  }

  /**
   * Web pages without their own background are white in every browser, so web
   * content always gets a white canvas; only Rye's own pages use the themed sheet.
   */
  applySheetColor(url: string) {
    this.view?.setBackgroundColor(isInternal(url) ? this.win.theme().sheet : '#ffffff');
  }

  private setProgress(p: number) {
    this.progress = Math.max(p, p === 0.1 ? 0 : this.progress);
    if (p >= 1) this.progress = 1;
    if (this.progressTimer) clearTimeout(this.progressTimer);
    // Creep forward slowly while waiting, so long loads still feel alive.
    if (this.loading && this.progress < 0.9) {
      this.progressTimer = setTimeout(() => {
        this.progress = Math.min(0.9, this.progress + (0.9 - this.progress) * 0.18);
        this.changed();
        this.setProgress(this.progress);
      }, 420);
    }
    this.changed();
  }

  navigate(url: string, opts: { upgraded?: boolean } = {}) {
    this.url = url;
    this.error = null;
    this.crashed = null;
    this.upgradedUrl = opts.upgraded ? url : null;
    const wc = this.wc;
    if (!wc) {
      this.pendingEntries = null;
      this.changed();
      return;
    }
    wc.loadURL(url).catch(() => {
      /* failures are surfaced through did-fail-load */
    });
    this.changed();
  }

  reload(hard = false) {
    const wc = this.wc;
    if (!wc) return;
    this.error = null;
    this.crashed = null;
    if (wc.getURL() !== this.url && this.url) wc.loadURL(this.url).catch(() => {});
    else if (hard) wc.reloadIgnoringCache();
    else wc.reload();
    this.changed();
  }

  stepZoom(dir: 1 | -1 | 0) {
    const wc = this.wc;
    if (!wc) return;
    let next = 1;
    if (dir !== 0) {
      const cur = wc.getZoomFactor();
      const idx = ZOOM_STEPS.findIndex((z) => z >= cur - 0.001);
      const base = idx === -1 ? ZOOM_STEPS.length - 1 : idx;
      const target = dir > 0 ? (ZOOM_STEPS[base] > cur + 0.001 ? base : base + 1) : base - 1;
      next = ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, target))];
    }
    wc.setZoomFactor(next);
    this.zoom = next;
    this.changed();
    // Same-origin tabs share Chromium's zoom level, so refresh their indicators too.
    this.win.syncZoom(this);
  }

  find(text: string, forward = true, findNext = false) {
    const wc = this.wc;
    if (!wc) return;
    this.findActive = true;
    this.findText = text;
    if (!text) {
      wc.stopFindInPage('clearSelection');
      this.findResult = { active: 0, matches: 0 };
      this.win.sendFindResult(this);
      return;
    }
    wc.findInPage(text, { forward, findNext });
  }

  stopFind() {
    this.findActive = false;
    this.findResult = { active: 0, matches: 0 };
    this.wc?.stopFindInPage('keepSelection');
    this.changed();
  }

  /** Releases the renderer process for an inactive tab while keeping its history. */
  sleep() {
    const wc = this.wc;
    if (!wc || this.audible) return;
    const nav = wc.navigationHistory;
    const entries = nav.getAllEntries().slice(-25).map((e) => ({ url: e.url, title: e.title }));
    const offset = Math.max(0, nav.getAllEntries().length - 25);
    this.pendingEntries = entries;
    this.pendingIndex = Math.max(0, nav.getActiveIndex() - offset);
    this.destroyView();
    this.loading = false;
    this.changed();
  }

  /** Back/forward entries for session saving and reopening closed tabs. */
  entries(): { entries: SavedEntry[]; index: number } {
    const wc = this.wc;
    if (!wc) {
      return this.pendingEntries
        ? { entries: this.pendingEntries, index: this.pendingIndex }
        : { entries: [{ url: this.url, title: this.title }], index: 0 };
    }
    const all = wc.navigationHistory.getAllEntries();
    const offset = Math.max(0, all.length - 25);
    const entries = all.slice(offset).map((e) => ({ url: e.url, title: e.title }));
    // Never persist entries of failed loads as the error itself.
    if (!entries.length) return { entries: [{ url: this.url, title: this.title }], index: 0 };
    return { entries, index: Math.max(0, wc.navigationHistory.getActiveIndex() - offset) };
  }

  security(): SecurityState {
    if (this.error) return 'error';
    if (isInternal(this.url)) return 'internal';
    if (this.url.startsWith('https:')) return 'secure';
    if (this.url.startsWith('http:')) return 'insecure';
    if (this.url.startsWith('file:')) return 'file';
    return 'none';
  }

  state(): TabState {
    const wc = this.wc;
    return {
      id: this.id,
      url: this.url,
      title: this.title,
      favicon: this.favicon,
      loading: this.loading,
      progress: this.progress,
      pinned: this.pinned,
      audible: this.audible,
      muted: wc ? wc.isAudioMuted() : this.muted,
      canGoBack: wc ? wc.navigationHistory.canGoBack() : this.pendingIndex > 0,
      canGoForward: wc ? wc.navigationHistory.canGoForward() : !!this.pendingEntries && this.pendingIndex < this.pendingEntries.length - 1,
      security: this.security(),
      crashed: !!this.crashed,
      error: this.errorInfo(),
      sleeping: this.sleeping,
      zoom: this.zoom,
      internal: isInternal(this.url),
      findActive: this.findActive,
    };
  }

  errorInfo() {
    return this.error ? { ...this.error } : this.crashed ? { code: 0, description: this.crashed, url: this.url, upgraded: false } : null;
  }

  changed() {
    this.win.tabChanged(this);
  }

  private destroyView() {
    const view = this.view;
    const wc = this.contents;
    if (!view) return;
    this.view = null;
    this.contents = null;
    this.win.detachView(view);
    if (wc && !wc.isDestroyed()) wc.close();
  }

  destroy() {
    if (this.progressTimer) clearTimeout(this.progressTimer);
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.destroyView();
  }
}

function safeHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}
