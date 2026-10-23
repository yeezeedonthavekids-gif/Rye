import type { SearchEngine } from './types';

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'file:', 'rye:', 'about:', 'data:', 'view-source:']);

export interface ResolvedInput {
  url: string;
  isSearch: boolean;
  engineId?: string;
}

export function looksLikeUrl(raw: string): boolean {
  const input = raw.trim();
  if (!input || /\s/.test(input)) return false;
  if (SCHEME_RE.test(input)) {
    const scheme = input.slice(0, input.indexOf(':') + 1).toLowerCase();
    // "foo:bar" style input that is not a known scheme is most likely "host:port".
    if (ALLOWED_SCHEMES.has(scheme) || scheme === 'mailto:') return true;
    if (/^[a-z0-9.-]+:\d+(\/|$)/i.test(input)) return true;
    return false;
  }
  if (/^localhost(:\d+)?(\/|$)/i.test(input)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(input)) return true;
  if (/^\[[0-9a-f:]+\](:\d+)?(\/|$)/i.test(input)) return true;
  // host.tld with an alphabetic TLD of 2+ chars
  return /^[^/?#\s]+\.[a-z][a-z0-9-]{1,62}\.?(:\d+)?([/?#].*)?$/i.test(input);
}

export function buildSearchUrl(engine: SearchEngine, query: string): string {
  return engine.url.replace('%s', encodeURIComponent(query));
}

/** Turns address-bar text into a navigable URL, honouring "@keyword query" shortcuts. */
export function resolveInput(raw: string, engines: SearchEngine[], defaultEngineId: string, httpsFirst = true): ResolvedInput {
  const input = raw.trim();
  const engine = engines.find((e) => e.id === defaultEngineId) ?? engines[0];

  const kw = /^@?(\S+)\s+(.+)$/.exec(input);
  if (kw && input.startsWith('@')) {
    const target = engines.find((e) => e.keyword.toLowerCase() === kw[1].toLowerCase());
    if (target) return { url: buildSearchUrl(target, kw[2]), isSearch: true, engineId: target.id };
  }

  if (looksLikeUrl(input)) {
    if (SCHEME_RE.test(input) && !/^[a-z0-9.-]+:\d+/i.test(input)) return { url: input, isSearch: false };
    const local = /^(localhost|127\.|\d{1,3}(\.\d{1,3}){3}|\[)/i.test(input);
    return { url: `${httpsFirst && !local ? 'https' : 'http'}://${input}`, isSearch: false };
  }
  return { url: buildSearchUrl(engine, input), isSearch: true, engineId: engine.id };
}

/** URL shown in the address bar when it is not focused: quiet, without noise. */
export function displayUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('rye://newtab')) return '';
  try {
    const u = new URL(url);
    // Internal pages are named by the address bar's chip; the raw URL is noise.
    if (u.protocol === 'rye:') return '';
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      const host = u.host.replace(/^www\./, '');
      const rest = `${u.pathname === '/' ? '' : u.pathname}${u.search}${u.hash}`;
      return `${host}${rest}`;
    }
    return url;
  } catch {
    return url;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function originOf(url: string): string {
  try {
    const u = new URL(url);
    return u.origin === 'null' ? `${u.protocol}//${u.host}` : u.origin;
  } catch {
    return '';
  }
}

export function isInternal(url: string): boolean {
  return url.startsWith('rye://');
}
