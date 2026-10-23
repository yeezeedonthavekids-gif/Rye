import { useEffect, useRef, type ReactNode } from 'react';
import { rye } from '../ui/bridge';
import { Icon } from '../ui/Icon';

export const open = (url: string, e?: { button?: number; ctrlKey?: boolean; metaKey?: boolean }) =>
  rye.send('page:open', url, e && (e.button === 1 || e.ctrlKey || e.metaKey) ? 'background' : 'current');

/** History, Bookmarks and Downloads share one header so they read as one library. */
export function LibraryHeader({ current, children }: { current: 'history' | 'bookmarks' | 'downloads'; children?: ReactNode }) {
  const tabs = [
    { id: 'history', label: 'History', icon: 'history' },
    { id: 'bookmarks', label: 'Bookmarks', icon: 'bookmark' },
    { id: 'downloads', label: 'Downloads', icon: 'download' },
  ] as const;
  return (
    <header className="lib-header">
      <nav className="lib-switch" aria-label="Library">
        {tabs.map((t) => (
          <button key={t.id} type="button" className="lib-tab" aria-current={t.id === current ? 'page' : undefined} onClick={() => t.id !== current && open(`rye://${t.id}`)}>
            <Icon name={t.icon} size={15} />
            {t.label}
          </button>
        ))}
      </nav>
      <div className="lib-tools">{children}</div>
    </header>
  );
}

export function SearchField({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  return (
    <div className="search-field">
      <Icon name="search" size={15} />
      <input className="field" value={value} placeholder={placeholder} autoFocus={autoFocus} spellCheck={false} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && value && (e.stopPropagation(), onChange(''))} />
      {value && (
        <button type="button" className="icon-btn xs" onClick={() => onChange('')} aria-label="Clear search">
          <Icon name="x" size={13} />
        </button>
      )}
    </div>
  );
}

export function Modal({ title, children, onClose, width = 420 }: { title: string; children: ReactNode; onClose: () => void; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, button.primary, button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (e.preventDefault(), onClose());
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, []);
  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="modal surface" role="dialog" aria-modal aria-label={title} style={{ width }}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close">
            <Icon name="x" size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ icon, title, body, children }: { icon: string; title: string; body?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={20} />
      </span>
      <div className="empty-title">{title}</div>
      {body && <div className="empty-body">{body}</div>}
      {children}
    </div>
  );
}

export function useRyeEvent(channel: string, fn: () => void) {
  useEffect(() => rye.on(channel, fn), [channel, fn]);
}

export function dayLabel(t: number) {
  const d = new Date(t);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}
