// Rye's shared controls. Internal pages and the overlay layer both use these,
// so a toggle or select looks and behaves the same everywhere.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return <button type="button" role="switch" className="toggle" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} />;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, options.length]);
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const el = ref.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
      if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
    });
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const move = (dir: number) => {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length];
    onChange(next.value);
  };
  return (
    <div
      className="segmented"
      ref={ref}
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') (e.preventDefault(), move(1));
        if (e.key === 'ArrowLeft') (e.preventDefault(), move(-1));
      }}
    >
      {thumb && <span className="thumb" style={{ left: thumb.left, width: thumb.width }} />}
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} title={o.title} tabIndex={o.value === value ? 0 : -1} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({ value, min = 0, max = 100, step = 1, onChange, label }: { value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void; label?: string }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const timer = useRef<number>(0);
  const pct = ((local - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      className="slider"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={local}
      style={{ ['--pct' as any]: `${pct}%` }}
      onChange={(e) => {
        const v = Number(e.target.value);
        setLocal(v);
        // Coalesce drags into a few setting writes rather than one per pixel.
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => onChange(v), 40);
      }}
    />
  );
}

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="check-row" onClick={() => onChange(!checked)}>
      <span className="check" role="checkbox" aria-checked={checked} tabIndex={0} onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), onChange(!checked))}>
        {checked && <Icon name="check" size={11} stroke={3} />}
      </span>
      <span>{label}</span>
    </label>
  );
}

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  detail?: string;
  indent?: number;
}

/** A themed listbox select. Native <select> popups are drawn by the OS and ignore Rye's theme. */
export function Select<T extends string>({ value, options, onChange, label, width = 220 }: { value: T; options: SelectOption<T>[]; onChange: (v: T) => void; label?: string; width?: number | string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [up, setUp] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const r = btn.current!.getBoundingClientRect();
    setUp(window.innerHeight - r.bottom < Math.min(300, options.length * 32 + 12) && r.top > window.innerHeight - r.bottom);
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    const close = (e: MouseEvent) => {
      if (!btn.current?.contains(e.target as Node) && !list.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', () => setOpen(false), { once: true });
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const pick = (i: number) => {
    const o = options[i];
    if (o) onChange(o.value);
    setOpen(false);
    btn.current?.focus();
  };

  return (
    <div className="select" style={{ width }}>
      <button
        ref={btn}
        type="button"
        className="select-button field"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setOpen(true);
            return;
          }
          if (!open) return;
          if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(options.length - 1, a + 1)));
          else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
          else if (e.key === 'Enter' || e.key === ' ') (e.preventDefault(), pick(active));
          else if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), setOpen(false));
          else if (e.key === 'Tab') setOpen(false);
        }}
      >
        <span className="select-value">{current?.label ?? 'Choose…'}</span>
        <Icon name="chevron-down" size={14} className="select-chevron" />
      </button>
      {open && (
        <div ref={list} className={`select-list surface menu ${up ? 'up' : ''}`} role="listbox" style={{ minWidth: width }}>
          {options.map((o, i) => (
            <button
              key={o.value}
              type="button"
              role="option"
              data-index={i}
              aria-selected={o.value === value}
              className="menu-item"
              data-active={i === active}
              style={o.indent ? { paddingLeft: 9 + o.indent * 14 } : undefined}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(i)}
            >
              <span className="menu-label">{o.label}</span>
              {o.detail && <span className="menu-shortcut">{o.detail}</span>}
              <span className="menu-icon">{o.value === value && <Icon name="check" size={14} stroke={2.25} />}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}

/** Favicon with a graceful monogram fallback. */
export function Favicon({ src, url, title, size = 16 }: { src?: string | null; url?: string; title?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (src && !failed) return <img className="favicon" src={src} width={size} height={size} style={{ width: size, height: size }} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  return (
    <span className="monogram" style={{ width: size, height: size, fontSize: Math.max(8, size * 0.56), borderRadius: Math.round(size * 0.32) }}>
      {letterFor(url, title)}
    </span>
  );
}

export function letterFor(url?: string, title?: string) {
  try {
    if (url) {
      const h = new URL(url).hostname.replace(/^www\./, '');
      if (h) return h[0];
    }
  } catch {
    /* ignore */
  }
  return (title || '•').trim()[0] ?? '•';
}

export function formatBytes(n: number): string {
  if (!n || n < 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : n / 1024 ** i < 10 ? 1 : 0)} ${u[i]}`;
}
