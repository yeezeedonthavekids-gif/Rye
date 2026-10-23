import { useEffect, useState } from 'react';
import { NTP_COLORS, NTP_GRADIENTS } from '../../shared/defaults';
import { hexToRgb } from '../../shared/theme';
import type { Bookmark, Shortcut, ThemePayload } from '../../shared/types';
import { rye } from '../ui/bridge';
import { Favicon, Slider, Toggle } from '../ui/components';
import { Icon } from '../ui/Icon';
import { Modal, open } from './common';

interface Stat {
  url: string;
  title: string;
  favicon?: string;
}
interface NtpData {
  recent: Stat[];
  bookmarks: Bookmark[];
  hasBackground: boolean;
}

const set = (path: string, value: unknown) => rye.invoke('settings:set', path, value);

function isDark(color: string) {
  const [r, g, b] = hexToRgb(color.match(/#[0-9a-f]{6}/i)?.[0] ?? '#ffffff');
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

/** Minute-aligned clock: one timer per minute, not per second. */
function useMinute(enabled: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    let t = 0;
    const tick = () => {
      setNow(new Date());
      t = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    t = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    return () => clearTimeout(t);
  }, [enabled]);
  return now;
}

function siteIcon(url: string) {
  try {
    return `${new URL(url).origin}/favicon.ico`;
  } catch {
    return undefined;
  }
}

export default function NewTab({ theme }: { theme: ThemePayload }) {
  const s = theme.settings.newTab;
  const engine = theme.settings.search.engines.find((e) => e.id === theme.settings.search.engine)?.name ?? 'the web';
  const [data, setData] = useState<NtpData | null>(null);
  const [editing, setEditing] = useState<Shortcut | 'new' | null>(null);
  const [panel, setPanel] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const now = useMinute(s.showClock || s.showDate);

  useEffect(() => {
    if (s.showRecent || s.showBookmarks || s.background.kind === 'image') rye.invoke<NtpData>('ntp:data').then(setData);
  }, [s.showRecent, s.showBookmarks, s.background.kind]);

  const bg = s.background;
  let style: React.CSSProperties = {};
  let tone: 'light' | 'dark' | undefined;
  if (bg.kind === 'color') (style = { background: bg.value }), (tone = isDark(bg.value) ? 'dark' : 'light');
  if (bg.kind === 'gradient') (style = { background: bg.value }), (tone = isDark(bg.value) ? 'dark' : 'light');
  if (bg.kind === 'image')
    (style = { backgroundImage: `linear-gradient(rgba(0,0,0,${bg.dim / 100}), rgba(0,0,0,${bg.dim / 100})), url("rye://newtab/__background?v=${bg.file}")` }), (tone = 'dark');

  const move = (from: string, to: string) => {
    const list = [...s.shortcuts];
    const a = list.findIndex((x) => x.id === from);
    const b = list.findIndex((x) => x.id === to);
    if (a < 0 || b < 0 || a === b) return;
    list.splice(b, 0, list.splice(a, 1)[0]);
    set('newTab.shortcuts', list);
  };

  return (
    <div className="ntp" data-bg={bg.kind} data-tone={tone} style={style}>
      <main className="ntp-center">
        {(s.showClock || s.showDate) && (
          <div className="ntp-time">
            {s.showClock && <div className="ntp-clock">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>}
            {s.showDate && <div className="ntp-date">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>}
          </div>
        )}

        {s.showSearch && (
          <form
            className="ntp-search"
            onSubmit={(e) => {
              e.preventDefault();
              const q = new FormData(e.currentTarget).get('q')?.toString().trim();
              if (q) rye.send('page:search', q);
            }}
          >
            <Icon name="search" size={18} />
            <input name="q" placeholder={`Search with ${engine} or enter address`} autoComplete="off" spellCheck={false} aria-label="Search" />
          </form>
        )}

        {s.showShortcuts && (
          <div className="ntp-grid">
            {s.shortcuts.map((sc) => (
              <div
                key={sc.id}
                className="tile"
                draggable
                data-dragging={dragId === sc.id}
                onDragStart={(e) => (setDragId(sc.id), e.dataTransfer.setData('text/plain', sc.url))}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => dragId && (e.preventDefault(), dragId !== sc.id && move(dragId, sc.id))}
              >
                <a
                  className="tile-link"
                  href={sc.url}
                  onClick={(e) => (e.preventDefault(), open(sc.url, e))}
                  onAuxClick={(e) => e.button === 1 && (e.preventDefault(), open(sc.url, e))}
                  title={sc.url}
                >
                  <span className="tile-icon">
                    <Favicon src={sc.icon ?? siteIcon(sc.url)} url={sc.url} title={sc.title} size={24} />
                  </span>
                  <span className="tile-title">{sc.title}</span>
                </a>
                <button type="button" className="icon-btn xs tile-edit" onClick={() => setEditing(sc)} aria-label={`Edit ${sc.title}`}>
                  <Icon name="pencil" size={12} />
                </button>
              </div>
            ))}
            {s.shortcuts.length < 24 && (
              <button type="button" className="tile tile-add" onClick={() => setEditing('new')}>
                <span className="tile-icon">
                  <Icon name="plus" size={20} />
                </span>
                <span className="tile-title">Add</span>
              </button>
            )}
          </div>
        )}

        {s.showRecent && !!data?.recent.length && (
          <section className="ntp-list">
            <div className="ntp-list-title">Recently visited</div>
            <div className="ntp-chips">
              {data.recent.slice(0, 6).map((r) => (
                <a key={r.url} className="chip" href={r.url} onClick={(e) => (e.preventDefault(), open(r.url, e))} title={r.url}>
                  <Favicon src={r.favicon} url={r.url} title={r.title} />
                  <span>{r.title}</span>
                </a>
              ))}
            </div>
          </section>
        )}
        {s.showBookmarks && !!data?.bookmarks.length && (
          <section className="ntp-list">
            <div className="ntp-list-title">Bookmarks</div>
            <div className="ntp-chips">
              {data.bookmarks.map((b) => (
                <a key={b.id} className="chip" href={b.url} onClick={(e) => (e.preventDefault(), open(b.url!, e))} title={b.url}>
                  <Favicon src={b.favicon} url={b.url} title={b.title} />
                  <span>{b.title}</span>
                </a>
              ))}
            </div>
          </section>
        )}
      </main>

      <button type="button" className="ntp-customize btn" onClick={() => setPanel((p) => !p)} aria-expanded={panel}>
        <Icon name="palette" size={15} />
        Customize
      </button>
      {panel && <CustomizePanel theme={theme} onClose={() => setPanel(false)} />}
      {editing && <ShortcutEditor shortcut={editing === 'new' ? null : editing} list={s.shortcuts} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ShortcutEditor({ shortcut, list, onClose }: { shortcut: Shortcut | null; list: Shortcut[]; onClose: () => void }) {
  const [title, setTitle] = useState(shortcut?.title ?? '');
  const [url, setUrl] = useState(shortcut?.url ?? '');
  const [icon, setIcon] = useState<string | undefined>(shortcut?.icon);
  const normalized = /^[a-z][a-z0-9+.-]*:/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  let valid = false;
  try {
    valid = !!url.trim() && /^https?:|^file:/.test(new URL(normalized).protocol);
  } catch {
    valid = false;
  }
  const save = () => {
    if (!valid) return;
    const item: Shortcut = { id: shortcut?.id ?? `s${Date.now().toString(36)}`, title: title.trim() || new URL(normalized).hostname.replace(/^www\./, ''), url: normalized, icon };
    set('newTab.shortcuts', shortcut ? list.map((x) => (x.id === shortcut.id ? item : x)) : [...list, item]);
    onClose();
  };
  return (
    <Modal title={shortcut ? 'Edit shortcut' : 'Add shortcut'} onClose={onClose}>
      <form className="form" onSubmit={(e) => (e.preventDefault(), save())}>
        <label className="form-label">
          Name
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional" />
        </label>
        <label className="form-label">
          Address
          <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="example.com" />
        </label>
        <div className="form-label">
          Icon
          <div className="icon-pick">
            <span className="tile-icon small">
              <Favicon src={icon ?? (valid ? siteIcon(normalized) : undefined)} url={valid ? normalized : undefined} title={title} size={20} />
            </span>
            <button type="button" className="btn sm" onClick={() => rye.invoke<string | null>('ntp:choose-icon').then((d) => d && setIcon(d))}>
              Choose image…
            </button>
            {icon && (
              <button type="button" className="btn sm ghost" onClick={() => setIcon(undefined)}>
                Use site icon
              </button>
            )}
          </div>
        </div>
        <div className="form-actions">
          {shortcut && (
            <button type="button" className="btn ghost danger-text" onClick={() => (set('newTab.shortcuts', list.filter((x) => x.id !== shortcut.id)), onClose())}>
              Remove
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!valid}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CustomizePanel({ theme, onClose }: { theme: ThemePayload; onClose: () => void }) {
  const s = theme.settings.newTab;
  const bg = s.background;
  const toggles: [keyof typeof s, string][] = [
    ['showSearch', 'Search box'],
    ['showShortcuts', 'Shortcuts'],
    ['showClock', 'Clock'],
    ['showDate', 'Date'],
    ['showRecent', 'Recently visited'],
    ['showBookmarks', 'Bookmarks'],
  ];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <aside className="ntp-panel surface" aria-label="Customize new tab">
      <div className="modal-head">
        <div className="modal-title">Customize</div>
        <button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close">
          <Icon name="x" size={15} />
        </button>
      </div>
      <div className="panel-section">
        <div className="group-title">Background</div>
        <div className="swatches">
          <button type="button" className="swatch theme" aria-pressed={bg.kind === 'theme'} onClick={() => set('newTab.background', { kind: 'theme' })} title="Match theme" />
          {NTP_COLORS.map((c) => (
            <button key={c} type="button" className="swatch" style={{ background: c }} aria-pressed={bg.kind === 'color' && bg.value === c} onClick={() => set('newTab.background', { kind: 'color', value: c })} />
          ))}
          {NTP_GRADIENTS.map((g) => (
            <button key={g} type="button" className="swatch" style={{ background: g }} aria-pressed={bg.kind === 'gradient' && bg.value === g} onClick={() => set('newTab.background', { kind: 'gradient', value: g })} />
          ))}
          <button type="button" className="swatch upload" aria-pressed={bg.kind === 'image'} onClick={() => rye.invoke('ntp:choose-background')} title="Upload image">
            <Icon name="upload" size={15} />
          </button>
        </div>
        {bg.kind === 'image' && (
          <div className="row compact">
            <span className="row-label">Dim image</span>
            <Slider value={bg.dim} max={70} onChange={(v) => set('newTab.background', { ...bg, dim: v })} label="Dim image" />
          </div>
        )}
      </div>
      <div className="panel-section">
        <div className="group-title">Show</div>
        {toggles.map(([k, label]) => (
          <div className="row compact" key={k}>
            <span className="row-label">{label}</span>
            <Toggle checked={!!s[k]} onChange={(v) => set(`newTab.${k}`, v)} label={label} />
          </div>
        ))}
      </div>
      <button type="button" className="btn link" onClick={() => open('rye://settings/?section=appearance')}>
        All appearance settings
      </button>
    </aside>
  );
}
