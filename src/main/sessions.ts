// Session configuration: storage partitions, permissions, privacy headers, internal protocol.
import { app, net, session, type Session } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { INTERNAL_PAGES } from '../shared/defaults';
import { originOf } from '../shared/url';
import { compatUserAgent, needsCompatUA } from './compat';
import { downloads } from './downloads';
import { AUTO_ALLOW, PERMISSION_LABELS, PROMPTED, permissions } from './permissions';
import { settings } from './settings';

const RENDERER_DIR = path.join(__dirname, '../renderer');
const configured = new WeakSet<Session>();
const privateDecisions = new Map<string, 'allow' | 'block'>();
let privateGeneration = 0;
let privateSessionRef: Session | null = null;

export type PermissionAsk = (wc: Electron.WebContents, origin: string, permission: string, label: string) => Promise<boolean | null>;
let askHandler: PermissionAsk = async () => false;
export function setPermissionAsk(fn: PermissionAsk) {
  askHandler = fn;
}

export function ntpBackgroundPath(): string | null {
  const dir = app.getPath('userData');
  for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif']) {
    const p = path.join(dir, `ntp-background.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function serveFile(file: string): Promise<Response> | Response {
  const resolved = path.resolve(file);
  if (!resolved.startsWith(path.resolve(RENDERER_DIR)) && resolved !== ntpBackgroundPath()) return new Response('Forbidden', { status: 403 });
  if (!fs.existsSync(resolved)) return new Response('Not found', { status: 404 });
  return net.fetch(pathToFileURL(resolved).toString());
}

function registerProtocol(ses: Session) {
  ses.protocol.handle('rye', async (request) => {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    if (!(INTERNAL_PAGES as readonly string[]).includes(url.host)) return new Response('Not found', { status: 404 });
    if (url.pathname === '/__background') {
      const bg = ntpBackgroundPath();
      return bg ? serveFile(bg) : new Response('Not found', { status: 404 });
    }
    if (url.pathname.startsWith('/assets/')) return serveFile(path.join(RENDERER_DIR, decodeURIComponent(url.pathname)));
    const res = await serveFile(path.join(RENDERER_DIR, 'pages.html'));
    const headers = new Headers(res.headers);
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('Cache-Control', 'no-store');
    return new Response(res.body, { status: res.status, headers });
  });
}

function permissionKey(permission: string, details: any): string {
  if (permission !== 'media') return permission;
  const types: string[] = details?.mediaTypes ?? [];
  if (types.includes('video') && types.includes('audio')) return 'media';
  if (types.includes('video')) return 'media:video';
  if (types.includes('audio')) return 'media:audio';
  return 'media';
}

function getDecision(isPrivate: boolean, origin: string, key: string) {
  if (isPrivate) return privateDecisions.get(`${origin} ${key}`) ?? (permissions.get(origin, key) === 'block' ? 'block' : undefined);
  return permissions.get(origin, key);
}

function configure(ses: Session, isPrivate: boolean) {
  if (configured.has(ses)) return;
  configured.add(ses);
  registerProtocol(ses);
  downloads.attach(ses, !isPrivate);
  ses.setSpellCheckerLanguages([app.getLocale() || 'en-US']);

  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    if (AUTO_ALLOW.has(permission)) return callback(true);
    const key = permissionKey(permission, details);
    const origin = originOf((details as any).requestingUrl || wc.getURL());
    if (!PROMPTED[key] || !origin || origin.startsWith('rye:')) return callback(false);
    const stored = getDecision(isPrivate, origin, key);
    if (stored) return callback(stored === 'allow');
    askHandler(wc, origin, key, PROMPTED[key]).then((answer) => {
      if (answer !== null) {
        const decision = answer ? 'allow' : 'block';
        if (isPrivate) privateDecisions.set(`${origin} ${key}`, decision);
        else permissions.set(origin, key, decision);
      }
      callback(!!answer);
    });
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    if (AUTO_ALLOW.has(permission)) return true;
    const origin = originOf(requestingOrigin);
    if (permission === 'media') return getDecision(isPrivate, origin, 'media') === 'allow' || getDecision(isPrivate, origin, 'media:video') === 'allow' || getDecision(isPrivate, origin, 'media:audio') === 'allow';
    return getDecision(isPrivate, origin, permission) === 'allow';
  });
  applyPrivacyHeaders(ses);
}

/**
 * Outgoing request headers: the Global Privacy Control signal (when enabled) and
 * the sign-in compatibility identity, which must also be undone on the first
 * request after a tab leaves the sign-in host. Electron allows one listener per
 * session, so both live here.
 */
export function applyPrivacyHeaders(ses: Session) {
  const gpc = settings.get().privacy.sendGpc;
  ses.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, cb) => {
    const h = details.requestHeaders;
    if (gpc) h['Sec-GPC'] = '1';
    if (needsCompatUA(details.url)) {
      h['User-Agent'] = compatUserAgent();
      for (const k of Object.keys(h)) if (/^sec-ch-ua/i.test(k)) delete h[k];
    } else if (h['User-Agent'] === compatUserAgent()) {
      h['User-Agent'] = app.userAgentFallback;
    }
    cb({ requestHeaders: h });
  });
}

export function defaultTabSession(): Session {
  const ses = session.defaultSession;
  configure(ses, false);
  return ses;
}

/** All private windows share one in-memory partition; it is wiped when the last one closes. */
export function privateTabSession(): Session {
  if (!privateSessionRef) {
    privateSessionRef = session.fromPartition(`rye-private-${++privateGeneration}`, { cache: true });
    configure(privateSessionRef, true);
  }
  return privateSessionRef;
}

export async function endPrivateSession() {
  const ses = privateSessionRef;
  privateSessionRef = null;
  privateDecisions.clear();
  downloads.clearPrivate();
  if (!ses) return;
  await Promise.allSettled([ses.clearStorageData(), ses.clearCache(), ses.clearAuthCache(), ses.clearHostResolverCache()]);
}

/** Rye's own UI documents use an isolated, cookie-less partition. */
export function uiSession(isPrivate: boolean): Session {
  const ses = session.fromPartition(isPrivate ? 'rye-ui-private' : 'rye-ui');
  if (!configured.has(ses)) {
    configured.add(ses);
    ses.webRequest.onBeforeSendHeaders((details, cb) => {
      delete details.requestHeaders.Cookie;
      cb({ requestHeaders: details.requestHeaders });
    });
    ses.webRequest.onHeadersReceived((details, cb) => {
      if (details.responseHeaders) {
        delete details.responseHeaders['set-cookie'];
        delete details.responseHeaders['Set-Cookie'];
      }
      cb({ responseHeaders: details.responseHeaders });
    });
    ses.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'clipboard-sanitized-write'));
  }
  return ses;
}

export function allTabSessions(): Session[] {
  return [session.defaultSession, ...(privateSessionRef ? [privateSessionRef] : [])];
}

export function labelFor(permission: string) {
  return PERMISSION_LABELS[permission] ?? permission;
}
