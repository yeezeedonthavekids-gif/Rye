// Tooltips are drawn by the overlay layer so they can float above the page.
// The chrome measures them here so the overlay's bounds fit exactly and never
// intercept the mouse anywhere else.
import type React from 'react';
import { px, rye } from '../ui/bridge';

let timer = 0;
let warmUntil = 0;
let shownFor: Element | null = null;
let ctx: CanvasRenderingContext2D | null = null;

function measure(text: string, size: number, weight = 500): number {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return text.length * 7;
  const family = getComputedStyle(document.documentElement).getPropertyValue('--font') || 'sans-serif';
  ctx.font = `${weight} ${size}px ${family}`;
  return Math.ceil(ctx.measureText(text).width);
}

function show(el: Element, label: string, shortcut?: string, side: 'below' | 'right' = 'below') {
  if (!el.isConnected) return;
  const r = el.getBoundingClientRect();
  const size = px('--fs-sm', 11.5);
  const lines = label.split('\n').slice(0, 3);
  const textW = Math.min(Math.max(...lines.map((l, i) => measure(l, i ? size - 1 : size, i ? 450 : 500))), 320);
  const keyW = shortcut ? measure(shortcut, size - 1) + 10 + 8 : 0;
  const w = textW + keyW + 18;
  const h = 26 + (lines.length - 1) * Math.round(size * 1.4);
  const pad = 6;
  let x: number;
  let y: number;
  if (side === 'right') {
    x = r.right + 8;
    y = r.top + r.height / 2 - h / 2;
  } else {
    x = r.left + r.width / 2 - w / 2;
    y = r.bottom + 6;
    if (y + h > window.innerHeight - 4) y = r.top - h - 6;
  }
  x = Math.max(6, Math.min(x, window.innerWidth - w - 6));
  y = Math.max(4, y);
  rye.send('tooltip:show', label, { x: x - pad, y: y - pad, width: w + pad * 2, height: h + pad * 2 }, shortcut);
  shownFor = el;
}

export function hideTooltip(cool = false) {
  window.clearTimeout(timer);
  if (shownFor) {
    rye.send('tooltip:hide');
    shownFor = null;
    warmUntil = cool ? 0 : Date.now() + 450;
  }
}

/** Props that give any element a Rye tooltip. */
export function tip(label: string, shortcut?: string, opts: { side?: 'below' | 'right'; delay?: number } = {}) {
  return {
    'aria-label': label,
    onMouseEnter: (e: React.MouseEvent) => {
      const el = e.currentTarget;
      window.clearTimeout(timer);
      // Once one tooltip has been shown, neighbouring ones appear almost instantly.
      const delay = Date.now() < warmUntil || shownFor ? 40 : (opts.delay ?? 620);
      timer = window.setTimeout(() => show(el, label, shortcut, opts.side), delay);
    },
    onMouseLeave: () => hideTooltip(),
    onMouseDown: () => hideTooltip(true),
  };
}

window.addEventListener('blur', () => hideTooltip(true));
window.addEventListener('wheel', () => hideTooltip(true), { passive: true });
