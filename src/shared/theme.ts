// Rye's design-token engine. Every surface (browser frame, overlay layer, internal
// pages, native window colours) derives its look from this one function so a
// change in Settings propagates everywhere at once.
import type { AppearanceSettings } from './types';

type Hsl = [number, number, number];

function hslToHex([h, s, l]: Hsl): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return [91, 127, 166];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function mix(hex: string, target: [number, number, number], amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const m = (a: number, t: number) => Math.round(a + (t - a) * amount);
  return `#${[m(r, target[0]), m(g, target[1]), m(b, target[2])].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const rgba = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

interface Neutral {
  hue: number;
  sat: number;
}

const TINTS: Record<string, { light: Neutral; dark: Neutral }> = {
  warm: { light: { hue: 36, sat: 16 }, dark: { hue: 30, sat: 6 } },
  neutral: { light: { hue: 220, sat: 4 }, dark: { hue: 220, sat: 4 } },
  cool: { light: { hue: 212, sat: 18 }, dark: { hue: 222, sat: 10 } },
  private: { light: { hue: 268, sat: 14 }, dark: { hue: 268, sat: 14 } },
};

export interface ThemeOutput {
  vars: Record<string, string>;
  frame: string;
  sheet: string;
  text: string;
  dark: boolean;
}

const DENSITY = { compact: 0.86, comfortable: 1, spacious: 1.16 } as const;
const FONT_SIZE = { small: 12, medium: 13, large: 14.5 } as const;
const MOTION = { full: 1, reduced: 0.55, off: 0 } as const;
const FONTS = {
  inter: `'Inter Variable', 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif`,
  system: `system-ui, -apple-system, 'Segoe UI Variable Text', 'Segoe UI', Roboto, Ubuntu, sans-serif`,
  rounded: `ui-rounded, 'SF Pro Rounded', 'Nunito', 'Varela Round', 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif`,
} as const;

export function computeTheme(a: AppearanceSettings, dark: boolean, isPrivate = false): ThemeOutput {
  const tint = TINTS[isPrivate ? 'private' : a.tint] ?? TINTS.warm;
  const n = dark ? tint.dark : tint.light;
  const N = (l: number, satScale = 1) => hslToHex([n.hue, n.sat * satScale, l]);

  // Surfaces. "frame" is the browser body that wraps the page; "raised" is any
  // element that floats above it (active tab, popovers, dialogs); "sunken" is
  // used for inputs and hover fills; "sheet" is the page's resting colour.
  const frame = dark ? N(isPrivate ? 11 : 10.5) : N(isPrivate ? 92 : 93.4);
  const raised = dark ? N(isPrivate ? 18 : 16.5) : N(99.2, 0.6);
  const raised2 = dark ? N(20.5) : N(97.4, 0.7);
  const sunken = dark ? N(14) : N(89.4);
  const sheet = dark ? N(12.5) : '#ffffff';
  const text = dark ? N(93, 0.5) : N(13, 1.2);
  const text2 = dark ? N(71, 0.6) : N(37, 1);
  const text3 = dark ? N(53, 0.6) : N(55, 0.8);
  const ink = dark ? '#ffffff' : hslToHex([n.hue, n.sat, 10]);

  let accent = a.accent || '#5b7fa6';
  if (dark) accent = mix(accent, [255, 255, 255], 0.16);
  const accentInk = luminance(accent) > 0.42 ? '#141414' : '#ffffff';
  const accentText = dark ? mix(accent, [255, 255, 255], 0.2) : mix(accent, [0, 0, 0], 0.18);

  const k = Math.max(0, Math.min(100, a.roundness)) / 100;
  const d = DENSITY[a.density] ?? 1;
  const px = (v: number) => `${Math.round(v * 10) / 10}px`;
  const sz = (v: number) => `${Math.round(v * d)}px`;
  const motion = MOTION[a.motion] ?? 1;
  const ms = (v: number) => `${Math.round(v * motion)}ms`;
  const fs = FONT_SIZE[a.fontScale] ?? 13;

  const r = {
    xs: 2 + 4 * k,
    sm: 3 + 7.5 * k,
    md: 4 + 10 * k,
    lg: 5 + 13 * k,
    xl: 6 + 18 * k,
  };

  const tabRadius = a.tabShape === 'pill' ? 999 : r.md;
  const tabGap = (a.tabSpacing / 100) * 8;

  const shadowBase = dark ? '0, 0, 0' : '42, 34, 24';
  const vars: Record<string, string> = {
    '--frame': frame,
    '--raised': raised,
    '--raised-2': raised2,
    '--sunken': sunken,
    '--sheet': sheet,
    '--text': text,
    '--text-2': text2,
    '--text-3': text3,
    '--ink': ink,
    '--hover': rgba(ink, dark ? 0.065 : 0.055),
    '--press': rgba(ink, dark ? 0.1 : 0.085),
    '--hairline': rgba(ink, dark ? 0.085 : 0.08),
    '--hairline-strong': rgba(ink, dark ? 0.14 : 0.13),
    '--highlight': dark ? 'rgba(255, 255, 255, 0.045)' : 'rgba(255, 255, 255, 0.7)',
    '--scrim': dark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(30, 24, 18, 0.22)',
    '--accent': accent,
    '--accent-ink': accentInk,
    '--accent-text': accentText,
    '--accent-soft': rgba(accent, dark ? 0.2 : 0.13),
    '--accent-softer': rgba(accent, dark ? 0.12 : 0.08),
    '--focus-ring': `0 0 0 3px ${rgba(accent, dark ? 0.36 : 0.26)}`,
    '--danger': dark ? '#e48a80' : '#b84a3e',
    '--danger-soft': dark ? 'rgba(228, 138, 128, 0.16)' : 'rgba(184, 74, 62, 0.1)',
    '--success': dark ? '#8cc59c' : '#3e8457',
    '--warning': dark ? '#e0b56a' : '#9a6a1c',

    '--shadow-1': `0 1px 1.5px rgba(${shadowBase}, ${dark ? 0.32 : 0.07}), 0 1px 4px rgba(${shadowBase}, ${dark ? 0.2 : 0.05})`,
    '--shadow-2': `0 1px 2px rgba(${shadowBase}, ${dark ? 0.3 : 0.06}), 0 4px 14px -2px rgba(${shadowBase}, ${dark ? 0.32 : 0.09})`,
    '--shadow-3': `0 2px 6px rgba(${shadowBase}, ${dark ? 0.32 : 0.07}), 0 18px 44px -10px rgba(${shadowBase}, ${dark ? 0.6 : 0.22})`,
    '--sheet-shadow': `0 0 0 1px rgba(${shadowBase}, ${dark ? 0.5 : 0.06}), 0 1px 3px rgba(${shadowBase}, ${dark ? 0.35 : 0.06}), 0 6px 22px -8px rgba(${shadowBase}, ${dark ? 0.5 : 0.14})`,

    '--r-xs': px(r.xs),
    '--r-sm': px(r.sm),
    '--r-md': px(r.md),
    '--r-lg': px(r.lg),
    '--r-xl': px(r.xl),
    '--r-tab': tabRadius === 999 ? '999px' : px(tabRadius),
    '--r-sheet': px(a.floatingPage ? r.lg : 0),

    '--font': FONTS[a.font] ?? FONTS.inter,
    '--font-mono': `ui-monospace, 'Cascadia Code', 'SF Mono', Consolas, monospace`,
    '--fs': `${fs}px`,
    '--fs-sm': `${Math.round((fs - 1.5) * 10) / 10}px`,
    '--fs-xs': `${Math.round((fs - 2.5) * 10) / 10}px`,
    '--fs-lg': `${fs + 2}px`,
    '--fs-xl': `${fs + 7}px`,

    '--space-1': sz(4),
    '--space-2': sz(8),
    '--space-3': sz(12),
    '--space-4': sz(16),
    '--space-5': sz(24),
    '--space-6': sz(32),
    '--control-h': sz(30),
    '--control-sm': sz(26),
    '--icon-btn': sz(30),
    '--tab-h': sz(a.tabShape === 'pill' ? 30 : 32),
    '--tab-gap': px(tabGap),
    '--tabstrip-h': sz(42),
    '--toolbar-h': sz(44),
    '--bookmarks-h': sz(32),
    '--row-h': sz(32),
    '--sidebar-w': a.sidebarCollapsed ? sz(52) : sz(236),
    '--mat': a.floatingPage ? sz(7) : '0px',

    '--dur-fast': ms(110),
    '--dur': ms(170),
    '--dur-slow': ms(260),
    '--ease': 'cubic-bezier(0.2, 0.7, 0.2, 1)',
    '--ease-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
    '--spring': motion === 0 ? 'linear' : 'cubic-bezier(0.34, 1.32, 0.5, 1)',
    '--lift': motion === 1 ? '1' : '0',
  };

  return { vars, frame, sheet, text, dark };
}

/** Applies the theme to a document. Used by every renderer. */
export function applyTheme(doc: Document, a: AppearanceSettings, dark: boolean, isPrivate = false): ThemeOutput {
  const t = computeTheme(a, dark, isPrivate);
  const root = doc.documentElement;
  for (const [key, value] of Object.entries(t.vars)) root.style.setProperty(key, value);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.density = a.density;
  root.dataset.motion = a.motion;
  root.dataset.tabShape = a.tabShape;
  root.dataset.private = isPrivate ? 'true' : 'false';
  root.style.colorScheme = dark ? 'dark' : 'light';
  return t;
}
