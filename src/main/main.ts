import './env';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, protocol, session, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { INTERNAL_PAGES } from '../shared/defaults';
import { PAGE_CHANNEL, UI_CHANNEL } from '../shared/ipc';
import { bookmarks } from './bookmarks';
import { downloads } from './downloads';
import { history } from './history';
import { permissions, PERMISSION_LABELS } from './permissions';
import { allTabSessions, applyPrivacyHeaders, endPrivateSession, ntpBackgroundPath, setPermissionAsk } from './sessions';
import { settings } from './settings';
import { SHORTCUT_DOCS } from './shortcuts';
import { savedSession, writeSession, clearClosed } from './state';
import { flushAllStores, JsonStore } from './store';
import { localSuggestions, remoteSuggestions } from './suggest';
import { NEWTAB, RyeWindow } from './window';

const t0 = performance.now();
const marks: Record<string, number> = {};
const mark = (name: string) => (marks[name] = Math.round(performance.now() - t0));

// Rye's internal pages live on a privileged, standard scheme.
protocol.registerSchemesAsPrivileged([{ scheme: 'rye', privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } }]);
// Present a plain Chrome user agent; some sites refuse unknown embedders.
app.userAgentFallback = app.userAgentFallback.replace(/\s(Electron|rye)\/\S+/gi, '');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const urls = urlsFromArgv(argv);
    const w = RyeWindow.focused();
    if (!w) return newWindow({ url: urls[0] });
    for (const u of urls) w.newTab(u);
    if (w.win.isMinimized()) w.win.restore();
    w.win.focus();
  });
}

function urlsFromArgv(argv: string[]): string[] {
  return argv.slice(app.isPackaged ? 1 : 2).filter((a) => /^(https?|file):/i.test(a) || (/\.(html?|pdf|svg)$/i.test(a) && fs.existsSync(a))).map((a) => (/^[a-z]+:/i.test(a) ? a : `file://${path.resolve(a)}`));
}

// ─── Windows ────────────────────────────────────────────────────────────────

let privateCount = 0;
function newWindow(opts: { isPrivate?: boolean; url?: string; saved?: any; urls?: string[] } = {}): RyeWindow {
  const w = new RyeWindow(opts);
  if (opts.isPrivate) {
    privateCount++;
    w.closedListeners.push(() => {
      // The private session is wiped as soon as the last private window closes.
      if (--privateCount === 0) void endPrivateSession();
    });
  }
  return w;
}

let sessionTimer: NodeJS.Timeout | null = null;
function saveSessionNow() {
  if (sessionTimer) clearTimeout(sessionTimer);
  sessionTimer = null;
  const normal = [...RyeWindow.all].filter((w) => !w.isPrivate && !w.win.isDestroyed());
  // Closing the last window keeps the previous snapshot so it can be restored.
  if (!normal.length) return;
  try {
    writeSession(normal.map((w) => w.snapshot()));
  } catch (err) {
    console.error('[session] save failed', err);
  }
}

RyeWindow.app = {
  newWindow,
  quit: () => app.quit(),
  broadcastSession() {
    if (RyeWindow.quitting) return;
    if (sessionTimer) return;
    sessionTimer = setTimeout(saveSessionNow, 1500);
  },
};

setPermissionAsk(async (wc, origin, permission, label) => {
  const found = RyeWindow.fromWebContents(wc) ?? (wc.hostWebContents ? RyeWindow.fromWebContents(wc.hostWebContents) : null);
  if (!found?.tab) return false;
  return found.win.askPermission(found.tab, origin, permission, label);
});

// ─── IPC ────────────────────────────────────────────────────────────────────

type Ctx = NonNullable<ReturnType<typeof RyeWindow.fromWebContents>>;

function context(e: IpcMainEvent | IpcMainInvokeEvent, channel: string): Ctx | null {
  const ctx = RyeWindow.fromWebContents(e.sender);
  if (!ctx) return null;
  if (ctx.role === 'tab') {
    // Only Rye's own pages (top frame, rye: scheme) may talk to the main process.
    const frame = e.senderFrame;
    if (!PAGE_CHANNEL.test(channel) || !frame || frame !== e.sender.mainFrame || !frame.url.startsWith('rye://')) return null;
    let host = '';
    try {
      host = new URL(frame.url).host;
    } catch {
      return null;
    }
    if (!(INTERNAL_PAGES as readonly string[]).includes(host)) return null;
    return ctx;
  }
  return UI_CHANNEL.test(channel) ? ctx : null;
}

function on(channel: string, fn: (ctx: Ctx, ...args: any[]) => void) {
  ipcMain.on(channel, (e, ...args) => {
    const ctx = context(e, channel);
    if (!ctx) return;
    try {
      fn(ctx, ...args);
    } catch (err) {
      console.error(`[ipc] ${channel}`, err);
    }
  });
}

function handle(channel: string, fn: (ctx: Ctx, ...args: any[]) => unknown) {
  ipcMain.handle(channel, async (e, ...args) => {
    const ctx = context(e, channel);
    if (!ctx) throw new Error('Not allowed');
    return fn(ctx, ...args);
  });
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown, max = 4096) => (typeof v === 'string' ? v.slice(0, max) : '');
const rect = (r: any) => ({ x: num(r?.x), y: num(r?.y), width: num(r?.width), height: num(r?.height) });

// Browser chrome
on('ui:ready', ({ win }) => win.onUiReady());
handle('ui:theme-get', ({ win }) => win.themePayload());
on('ui:insets', ({ win }, insets, anchors, titlebar) => {
  const a: Record<string, any> = {};
  if (anchors && typeof anchors === 'object') for (const k of Object.keys(anchors).slice(0, 20)) a[k] = rect(anchors[k]);
  win.setInsets(insets, a, num(titlebar));
});
on('tab:new', ({ win }, url) => win.newTab(str(url) || NEWTAB));
on('tab:activate', ({ win }, id) => win.activate(num(id)));
on('tab:close', ({ win }, id) => win.closeTab(num(id)));
on('tab:move', ({ win }, id, to) => win.moveTab(num(id), num(to)));
on('tab:menu', ({ win }, id, point) => win.openTabMenu(num(id), rect(point)));
on('tab:strip-menu', ({ win }, point) => win.openStripMenu(rect(point)));
on('tab:reopen', ({ win }) => win.reopenClosed());
on('tab:pin', ({ win }, id) => win.togglePin(num(id)));
on('tab:mute', ({ win }, id) => win.toggleMute(num(id)));
on('tab:wake', ({ win }, id) => {
  const t = win.tabs.find((x) => x.id === num(id));
  if (t) win.activate(t.id);
});
on('nav:go', ({ win }, text, disposition) => {
  const d = disposition === 'new' || disposition === 'background' ? disposition : 'current';
  win.navigateInput(str(text), d);
});
on('nav:switch-tab', ({ win }, tabId) => {
  for (const w of RyeWindow.all) {
    const t = w.tabs.find((x) => x.id === num(tabId));
    if (t) {
      w.activate(t.id);
      w.win.focus();
      return;
    }
  }
  void win;
});
on('nav:command', ({ win }, cmd) => win.command(str(cmd, 40)));
on('nav:history-menu', ({ win }, dir, anchor) => win.openNavHistory(dir === 'forward' ? 'forward' : 'back', rect(anchor)));
on('nav:http-fallback', ({ win }) => {
  const tab = win.active;
  if (tab?.error?.url.startsWith('https://')) tab.navigate(tab.error.url.replace(/^https:/, 'http:'));
});
const certAllowed = new Set<string>();
on('nav:cert-proceed', ({ win }) => {
  const tab = win.active;
  if (!tab?.error) return;
  try {
    certAllowed.add(new URL(tab.error.url).host);
  } catch {
    return;
  }
  tab.navigate(tab.error.url);
});
on('win:minimize', ({ win }) => win.win.minimize());
on('win:maximize', ({ win }) => (win.win.isMaximized() ? win.win.unmaximize() : win.win.maximize()));
on('win:close', ({ win }) => win.win.close());
on('menu:app', ({ win }, anchor) => win.openAppMenu(rect(anchor)));
on('menu:toolbar', ({ win }, point) => win.openToolbarMenu(rect(point)));
on('menu:input', ({ win }, point, hasSelection) => win.openInputMenu(rect(point), !!hasSelection));
on('bookmarks:folder-menu', ({ win }, id, anchor) => win.openFolderMenu(str(id, 64), rect(anchor)));
on('bookmarks:item-menu', ({ win }, id, point) => win.openBookmarkItemMenu(str(id, 64), rect(point)));
on('bookmarks:popover', ({ win }, anchor) => win.openBookmarkPopover(undefined, rect(anchor)));
on('bookmarks:open', ({ win }, id, disposition) => {
  const b = bookmarks.get(str(id, 64));
  if (!b?.url) return;
  if (disposition === 'new' || disposition === 'background') win.newTab(b.url, { activate: disposition === 'new' });
  else win.navigate(b.url);
});
on('site:info', ({ win }, anchor) => win.openSiteInfo(rect(anchor)));
on('downloads:panel', ({ win }, anchor) => win.openDownloads(rect(anchor)));
on('zoom:popover', ({ win }, anchor) => win.openZoomPopover(rect(anchor)));
on('suggest:show', ({ win }, items, selected, r) => win.showSuggest(Array.isArray(items) ? items : [], num(selected), rect(r)));
on('suggest:hide', ({ win }) => win.hideSuggest());
on('tooltip:show', ({ win }, text, r, shortcut) => win.showTooltip(str(text, 200), rect(r), shortcut ? str(shortcut, 40) : undefined));
on('tooltip:hide', ({ win }) => win.hideTooltip());
on('find:query', ({ win }, text, forward, findNext) => win.active?.find(str(text, 500), forward !== false, !!findNext));
on('find:close', ({ win }) => {
  win.active?.stopFind();
  win.active?.wc?.focus();
});
on('ui:focus-page', ({ win }) => win.active?.wc?.focus());
handle('suggest:query', ({ win }, text) => {
  const tabs = [...RyeWindow.all].filter((w) => w.isPrivate === win.isPrivate).flatMap((w) => w.tabs.map((t) => ({ id: t.id, title: t.title, url: t.url, favicon: t.favicon })));
  return localSuggestions(str(text, 2048), tabs, win.isPrivate);
});
handle('suggest:remote', ({ win }, text) => remoteSuggestions(str(text, 2048), win.isPrivate));
handle('bookmarks:tree', () => bookmarks.tree());

// Overlay layer
on('overlay:action', ({ win, role }, id, payload) => role === 'overlay' && win.popupAction(str(id, 200), payload));
on('overlay:dismiss', ({ win, role }) => role === 'overlay' && win.closePopup());
on('overlay:suggest-hover', ({ win, role }, i) => role === 'overlay' && win.win.webContents.send('ui:suggest-hover', num(i)));
on('overlay:suggest-pick', ({ win, role }, i, d) => role === 'overlay' && win.win.webContents.send('ui:suggest-pick', num(i), d === 'new' ? 'new' : 'current'));

// Settings (chrome and internal pages)
handle('settings:get', () => settings.get());
handle('settings:set', (_c, p, value) => settings.set(str(p, 100), value));
handle('settings:preset', (_c, id) => settings.applyPreset(str(id, 40)));
handle('settings:reset', (_c, section) => settings.reset(str(section, 40) as any));

// Internal pages
handle('page:theme', ({ win }) => win.themePayload());
on('page:open', ({ win, tab }, url, disposition) => {
  const u = str(url);
  if (!/^(https?|rye|file):/i.test(u) && !u.startsWith('@')) {
    win.navigateInput(u, disposition === 'new' ? 'new' : 'current');
    return;
  }
  if (disposition === 'new' || disposition === 'background') win.newTab(u, { activate: disposition === 'new', opener: tab });
  else win.navigate(u, tab);
});
on('page:search', ({ win }, text, disposition) => win.navigateInput(str(text, 2048), disposition === 'new' ? 'new' : 'current'));
on('page:focus-address', ({ win }) => win.focusAddress(true));
handle('page:shortcuts', () => SHORTCUT_DOCS);
handle('ntp:data', () => {
  const tree = bookmarks.tree();
  return {
    recent: history.recent(8),
    frequent: history.frequent(8),
    bookmarks: bookmarks.children(tree.barId).filter((b) => b.type === 'bookmark').slice(0, 12),
    hasBackground: !!ntpBackgroundPath(),
  };
});
handle('ntp:choose-background', async ({ win }) => {
  const r = await dialog.showOpenDialog(win.win, { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'] }] });
  if (r.canceled || !r.filePaths[0]) return false;
  const src = r.filePaths[0];
  if (fs.statSync(src).size > 25 * 1024 * 1024) return false;
  const old = ntpBackgroundPath();
  if (old) fs.rmSync(old, { force: true });
  const ext = path.extname(src).toLowerCase().replace('.', '') || 'png';
  fs.copyFileSync(src, path.join(app.getPath('userData'), `ntp-background.${ext}`));
  const cur = settings.get().newTab.background;
  settings.set('newTab.background', { kind: 'image', file: `${Date.now()}`, dim: cur.kind === 'image' ? cur.dim : 20 });
  return true;
});
handle('ntp:choose-icon', async ({ win }) => {
  const r = await dialog.showOpenDialog(win.win, { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg', 'ico', 'gif'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const file = r.filePaths[0];
  if (fs.statSync(file).size > 512 * 1024) return null;
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'ico' ? 'image/x-icon' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
});
handle('history:query', (_c, text, before) => history.query(str(text, 500), 400, num(before) || undefined));
handle('history:remove', (_c, ids) => history.remove(Array.isArray(ids) ? ids.map((x) => str(x, 64)) : []));
handle('history:remove-url', (_c, url) => history.removeUrl(str(url)));
handle('history:clear', () => history.clear());
handle('bookmarks:add', (_c, input) => bookmarks.add({ title: str(input?.title, 500), url: str(input?.url), parentId: str(input?.parentId, 64) || undefined, type: input?.type === 'folder' ? 'folder' : 'bookmark' }));
handle('bookmarks:update', (_c, id, patch) => bookmarks.update(str(id, 64), { title: patch?.title !== undefined ? str(patch.title, 500) : undefined, url: patch?.url !== undefined ? str(patch.url) : undefined, parentId: patch?.parentId !== undefined ? str(patch.parentId, 64) : undefined }));
handle('bookmarks:move', (_c, id, parentId, index) => bookmarks.move(str(id, 64), str(parentId, 64), num(index)));
handle('bookmarks:remove', (_c, id) => bookmarks.remove(str(id, 64)));
handle('bookmarks:import', async ({ win }) => {
  const r = await dialog.showOpenDialog(win.win, { properties: ['openFile'], filters: [{ name: 'Bookmark files', extensions: ['html', 'htm'] }] });
  if (r.canceled || !r.filePaths[0]) return -1;
  const html = fs.readFileSync(r.filePaths[0], 'utf8');
  return bookmarks.importHtml(html);
});
handle('bookmarks:export', async ({ win }) => {
  const r = await dialog.showSaveDialog(win.win, { defaultPath: path.join(app.getPath('documents'), 'rye-bookmarks.html'), filters: [{ name: 'HTML', extensions: ['html'] }] });
  if (r.canceled || !r.filePath) return false;
  fs.writeFileSync(r.filePath, bookmarks.exportHtml());
  return true;
});
handle('downloads:list', ({ win }) => downloads.list(win.isPrivate).map((e) => ({ ...e, exists: e.state !== 'completed' || downloads.exists(e) })));
handle('downloads:action', (_c, id, action) => downloads.action(str(id, 64), str(action, 20)));
handle('downloads:clear', () => downloads.clearFinished());
handle('downloads:choose-dir', async ({ win }) => {
  const r = await dialog.showOpenDialog(win.win, { properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  settings.set('downloads.directory', r.filePaths[0]);
  return r.filePaths[0];
});
handle('downloads:default-dir', () => app.getPath('downloads'));
handle('site:list', async ({ win }) => {
  const cookies = await win.session.cookies.get({});
  const map = new Map<string, number>();
  for (const c of cookies) {
    const d = (c.domain ?? '').replace(/^\./, '');
    map.set(d, (map.get(d) ?? 0) + 1);
  }
  return {
    cookies: [...map.entries()].map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count),
    permissions: permissions.all().map((p) => ({ ...p, label: PERMISSION_LABELS[p.permission] ?? p.permission })),
  };
});
handle('site:clear-domain', async ({ win }, domain) => {
  const d = str(domain, 300);
  const cookies = await win.session.cookies.get({});
  await Promise.all(
    cookies
      .filter((c) => (c.domain ?? '').replace(/^\./, '') === d)
      .map((c) => win.session.cookies.remove(`${c.secure ? 'https' : 'http'}://${(c.domain ?? '').replace(/^\./, '')}${c.path ?? '/'}`, c.name)),
  );
  await win.session.clearStorageData({ origin: `https://${d}` }).catch(() => {});
  await win.session.clearStorageData({ origin: `http://${d}` }).catch(() => {});
  return true;
});
handle('site:set-permission', (_c, origin, permission, decision) => permissions.set(str(origin, 300), str(permission, 60), decision === 'allow' ? 'allow' : decision === 'block' ? 'block' : 'ask'));
handle('site:clear-permissions', () => permissions.clearAll());
handle('data:clear', async ({ win }, opts) => {
  const since = num(opts?.since);
  const ses = win.isPrivate ? win.session : session.defaultSession;
  const jobs: Promise<unknown>[] = [];
  if (opts?.history) {
    history.clear(since ? Date.now() - since : 0);
    clearClosed();
  }
  if (opts?.cookies) jobs.push(ses.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage', 'shadercache', 'filesystem'] }));
  if (opts?.cache) jobs.push(ses.clearCache(), ses.clearCodeCaches({}));
  if (opts?.downloads) downloads.clearFinished();
  if (opts?.permissions) permissions.clearAll();
  await Promise.allSettled(jobs);
  return true;
});
handle('app:info', () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  v8: process.versions.v8,
  platform: `${process.platform} ${process.arch}`,
  userData: app.getPath('userData'),
  startup: marks,
}));
handle('app:metrics', () => {
  const metrics = app.getAppMetrics();
  const tabs = [...RyeWindow.all].flatMap((w) => w.tabs.map((t) => ({ pid: t.wc?.getOSProcessId() ?? 0, title: t.title, sleeping: t.sleeping })));
  return metrics.map((m) => ({
    pid: m.pid,
    type: m.type,
    name: m.name ?? m.serviceName ?? '',
    memoryKB: m.memory.workingSetSize,
    cpu: Math.round(m.cpu.percentCPUUsage * 10) / 10,
    tabs: tabs.filter((t) => t.pid === m.pid).map((t) => t.title),
  }));
});
handle('app:sleep-tab', () => {
  let n = 0;
  for (const w of RyeWindow.all) for (const t of w.tabs) if (t.id !== w.activeId && !t.sleeping && !t.audible) (t.sleep(), n++);
  return n;
});

// Extensions: Electron implements a subset of the Chrome extension APIs.
const extStore = new JsonStore<{ paths: string[] }>('extensions', () => ({ paths: [] }), (raw) => ({ paths: Array.isArray(raw?.paths) ? raw.paths.filter((p: unknown) => typeof p === 'string') : [] }));
handle('ext:list', () => session.defaultSession.extensions.getAllExtensions().map((e) => ({ id: e.id, name: e.name, version: e.version, path: e.path, description: e.manifest?.description ?? '' })));
handle('ext:load', async ({ win }) => {
  const r = await dialog.showOpenDialog(win.win, { properties: ['openDirectory'], title: 'Choose an unpacked extension folder' });
  if (r.canceled || !r.filePaths[0]) return null;
  try {
    const ext = await session.defaultSession.extensions.loadExtension(r.filePaths[0], { allowFileAccess: false });
    if (!extStore.data.paths.includes(r.filePaths[0])) extStore.data.paths.push(r.filePaths[0]);
    extStore.save();
    return { ok: true, name: ext.name };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) };
  }
});
handle('ext:remove', (_c, id) => {
  const ext = session.defaultSession.extensions.getExtension(str(id, 64));
  if (!ext) return false;
  session.defaultSession.extensions.removeExtension(ext.id);
  extStore.data.paths = extStore.data.paths.filter((p) => p !== ext.path);
  extStore.save();
  return true;
});

// ─── Change propagation ─────────────────────────────────────────────────────

function eachInternalPage(fn: (wc: Electron.WebContents) => void) {
  for (const w of RyeWindow.all) for (const t of w.tabs) if (t.wc && t.url.startsWith('rye://')) fn(t.wc);
}

let sleepTimer: NodeJS.Timeout | null = null;
function configureSleep() {
  const minutes = settings.get().tabs.sleepInactiveMinutes;
  if (sleepTimer) clearInterval(sleepTimer);
  sleepTimer = null;
  if (!minutes) return;
  // Only runs when the user turned tab sleeping on; checks once a minute.
  sleepTimer = setInterval(() => {
    const cutoff = Date.now() - minutes * 60_000;
    for (const w of RyeWindow.all) for (const t of w.tabs) if (t.id !== w.activeId && !t.sleeping && !t.audible && !t.pinned && t.lastActive < cutoff) t.sleep();
  }, 60_000);
}

settings.on('change', (s, changed: string) => {
  nativeTheme.themeSource = s.appearance.theme;
  for (const w of RyeWindow.all) w.applyTheme();
  if (changed.startsWith('privacy')) for (const ses of allTabSessions()) applyPrivacyHeaders(ses);
  if (changed.startsWith('tabs')) configureSleep();
});
nativeTheme.on('updated', () => {
  for (const w of RyeWindow.all) w.applyTheme();
});
bookmarks.on('change', (tree) => {
  for (const w of RyeWindow.all) {
    w.win.webContents.send('ui:bookmarks', tree);
    w.scheduleState();
  }
  eachInternalPage((wc) => wc.send('page:bookmarks'));
});
let historyTimer: NodeJS.Timeout | null = null;
history.on('change', () => {
  if (historyTimer) return;
  historyTimer = setTimeout(() => {
    historyTimer = null;
    eachInternalPage((wc) => wc.send('page:history'));
  }, 800);
});
downloads.on('change', () => {
  for (const w of RyeWindow.all) {
    w.scheduleState();
    w.refreshPopup('downloads');
  }
  eachInternalPage((wc) => wc.send('page:downloads'));
});
downloads.on('started', (_entry, wc: Electron.WebContents) => {
  if (!settings.get().downloads.openPanelOnStart) return;
  const found = wc && !wc.isDestroyed() ? RyeWindow.fromWebContents(wc) : null;
  const w = found?.win ?? RyeWindow.focused();
  // Let the toolbar render its downloads button first, then anchor the panel to it.
  setTimeout(() => w && !w.win.isDestroyed() && w.win.webContents.send('ui:open-downloads'), 120);
});
permissions.on('change', () => {
  for (const w of RyeWindow.all) w.refreshPopup('siteinfo');
});

// ─── Lifecycle ──────────────────────────────────────────────────────────────

app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (ev) => ev.preventDefault());
});

app.on('certificate-error', (event, _wc, url, _error, _cert, callback) => {
  let host = '';
  try {
    host = new URL(url).host;
  } catch {
    /* ignore */
  }
  if (certAllowed.has(host)) {
    event.preventDefault();
    callback(true);
  } else callback(false);
});

function buildAppMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  // macOS needs an application menu for standard editing shortcuts in text fields.
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { label: 'Rye', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
      { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'pasteAndMatchStyle' }, { role: 'selectAll' }] },
      { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }] },
    ]),
  );
}

let clearing = false;
app.on('before-quit', (e) => {
  if (!RyeWindow.quitting) {
    RyeWindow.quitting = true;
    saveSessionNow();
  }
  if (settings.get().privacy.clearOnExit && !clearing) {
    e.preventDefault();
    clearing = true;
    session.defaultSession
      .clearStorageData()
      .catch(() => {})
      .finally(() => {
        flushAllStores();
        app.quit();
      });
    return;
  }
  flushAllStores();
  settings.flush();
  history.flush();
  bookmarks.flush();
  permissions.flush();
  downloads.flush();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!BrowserWindow.getAllWindows().length) newWindow();
});

app.whenReady().then(async () => {
  mark('ready');
  nativeTheme.themeSource = settings.get().appearance.theme;
  buildAppMenu();
  for (const p of extStore.data.paths) {
    if (fs.existsSync(p)) await session.defaultSession.extensions.loadExtension(p, { allowFileAccess: false }).catch((err) => console.warn('[ext]', err?.message));
  }
  const urls = urlsFromArgv(process.argv);
  const g = settings.get().general;
  const saved = g.startup === 'restore' ? savedSession() : [];
  if (saved.length) {
    saved.forEach((w, i) => newWindow({ saved: w, urls: i === 0 ? urls : [] }));
  } else {
    const start = g.startup === 'homepage' && g.homepage ? g.homepage : NEWTAB;
    newWindow({ urls: urls.length ? urls : [start] });
  }
  configureSleep();
  mark('first-window');
  if (process.env.RYE_DEBUG) {
    setTimeout(() => console.log('[rye] startup', marks, 'rss MB', Math.round(process.memoryUsage().rss / 1048576)), 1500);
  }
});

// Test hook: lets the automated UI tests drive real windows. Only present when RYE_TEST is set.
if (process.env.RYE_TEST) (globalThis as any).__rye = { RyeWindow, settings, bookmarks, history, downloads };
