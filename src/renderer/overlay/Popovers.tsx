import { useEffect, useRef, useState } from 'react';
import type { Bookmark, DownloadEntry } from '../../shared/types';
import { DownloadRow } from '../ui/DownloadRow';
import { rye } from '../ui/bridge';
import { Segmented, Select } from '../ui/components';
import { Icon, RyeMark } from '../ui/Icon';

const act = (id: string, payload?: unknown) => rye.send('overlay:action', id, payload);
const dismiss = () => rye.send('overlay:dismiss');

export function BookmarkPopover({ data }: { data: { bookmark: Bookmark; folders: { id: string; title: string; depth: number }[]; isNew: boolean } }) {
  const [title, setTitle] = useState(data.bookmark.title);
  const [parentId, setParentId] = useState(data.bookmark.parentId ?? '');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const save = () => act('save', { title: title.trim() || data.bookmark.title, parentId });
  return (
    <form
      className="popover-body"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="pop-head">
        <span className="pop-icon accent">
          <Icon name="star" size={16} fill="currentColor" />
        </span>
        <div>
          <div className="pop-title">{data.isNew ? 'Bookmark added' : 'Edit bookmark'}</div>
          <div className="pop-sub">{data.bookmark.url}</div>
        </div>
      </div>
      <label className="pop-label">
        Name
        <input ref={ref} className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="pop-label">
        Folder
        <Select value={parentId} onChange={setParentId} width="100%" options={data.folders.map((f) => ({ value: f.id, label: f.title, indent: f.depth }))} label="Folder" />
      </div>
      <div className="pop-actions">
        <button type="button" className="btn ghost danger-text" onClick={() => act('remove')}>
          Remove
        </button>
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={() => act('manager')}>
          More…
        </button>
        <button type="submit" className="btn primary">
          Done
        </button>
      </div>
    </form>
  );
}

const SECURITY_COPY: Record<string, { icon: string; title: string; tone: string }> = {
  secure: { icon: 'shield-check', title: 'Connection is secure', tone: 'good' },
  insecure: { icon: 'shield-alert', title: 'Connection is not secure', tone: 'warn' },
  internal: { icon: 'rye', title: 'This is a Rye page', tone: 'accent' },
  file: { icon: 'file', title: 'This is a file on your device', tone: 'neutral' },
  error: { icon: 'alert', title: 'This page couldn’t be loaded', tone: 'warn' },
  none: { icon: 'globe', title: 'Site information', tone: 'neutral' },
};

export function SiteInfoPopover({ data }: { data: { host: string; origin: string; security: string; private: boolean; permissions: { permission: string; label: string; decision: string }[]; zoom: number; url: string } }) {
  const s = SECURITY_COPY[data.security] ?? SECURITY_COPY.none;
  const web = /^https?:/.test(data.url);
  return (
    <div className="popover-body">
      <div className="pop-head">
        <span className={`pop-icon ${s.tone}`}>{s.icon === 'rye' ? <RyeMark size={17} /> : <Icon name={s.icon} size={17} />}</span>
        <div className="pop-head-text">
          <div className="pop-title">{data.host || 'This page'}</div>
          <div className="pop-sub">{s.title}</div>
        </div>
      </div>
      {data.security === 'insecure' && <p className="pop-note">Information you send to this site could be read or changed by others on the network. Avoid entering passwords or payment details.</p>}
      {data.private && web && <p className="pop-note">You’re in a private window. Permissions you allow here are forgotten when the window closes.</p>}
      {web && !data.private && (
        <div className="pop-section">
          <div className="pop-section-title">Permissions</div>
          {data.permissions.length ? (
            data.permissions.map((p) => (
              <div className="pop-row" key={p.permission}>
                <span className="pop-row-label">{p.label}</span>
                <Segmented
                  value={p.decision as 'allow' | 'block'}
                  onChange={(v) => act('perm', { permission: p.permission, decision: v })}
                  options={[
                    { value: 'allow', label: 'Allow' },
                    { value: 'ask', label: 'Ask' },
                    { value: 'block', label: 'Block' },
                  ]}
                />
              </div>
            ))
          ) : (
            <div className="pop-empty">This site hasn’t asked for any special permissions.</div>
          )}
        </div>
      )}
      {Math.abs(data.zoom - 1) > 0.001 && (
        <div className="pop-row">
          <span className="pop-row-label">Zoom · {Math.round(data.zoom * 100)}%</span>
          <button type="button" className="btn sm" onClick={() => act('zoom-reset')}>
            Reset
          </button>
        </div>
      )}
      {web && (
        <div className="pop-actions">
          <button type="button" className="btn ghost danger-text" onClick={() => act('clear-site')}>
            Clear site data
          </button>
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={() => act('site-settings')}>
            Site settings
          </button>
        </div>
      )}
    </div>
  );
}

export function DownloadsPopover({ data }: { data: { entries: (DownloadEntry & { exists?: boolean })[] } }) {
  return (
    <div className="popover-body wide">
      <div className="pop-head row">
        <div className="pop-title">Downloads</div>
        <span className="spacer" />
        <button type="button" className="btn link" onClick={() => act('all')}>
          Show all
        </button>
      </div>
      {data.entries.length ? (
        <div className="dl-list">
          {data.entries.map((e) => (
            <DownloadRow key={e.id} e={e} onAction={(id, action) => act('dl', { id, action })} />
          ))}
        </div>
      ) : (
        <div className="pop-empty center">Files you download appear here.</div>
      )}
    </div>
  );
}

const PERM_ICONS: Record<string, string> = {
  media: 'camera',
  'media:video': 'camera',
  'media:audio': 'mic',
  geolocation: 'map-pin',
  notifications: 'bell',
  'clipboard-read': 'clipboard',
  'display-capture': 'monitor-up',
  usb: 'usb',
  hid: 'usb',
  serial: 'usb',
  openExternal: 'external',
};

export function PermissionPopover({ data }: { data: { origin: string; label: string; permission: string } }) {
  const allow = useRef<HTMLButtonElement>(null);
  useEffect(() => allow.current?.focus(), []);
  return (
    <div className="popover-body">
      <div className="pop-head">
        <span className="pop-icon accent">
          <Icon name={PERM_ICONS[data.permission] ?? 'shield'} size={17} />
        </span>
        <div className="pop-head-text">
          <div className="pop-title">{data.origin}</div>
          <div className="pop-sub">wants to {data.label.charAt(0).toLowerCase() + data.label.slice(1)}</div>
        </div>
      </div>
      <div className="pop-actions">
        <button type="button" className="btn ghost" onClick={dismiss}>
          Not now
        </button>
        <span className="spacer" />
        <button type="button" className="btn" onClick={() => act('block')}>
          Block
        </button>
        <button type="button" ref={allow} className="btn primary" onClick={() => act('allow')}>
          Allow
        </button>
      </div>
    </div>
  );
}

export function ZoomPopover({ data }: { data: { zoom: number } }) {
  return (
    <div className="popover-body compact">
      <div className="zoom-row">
        <button type="button" className="icon-btn" onClick={() => act('out')} aria-label="Zoom out">
          <Icon name="minus" size={16} />
        </button>
        <span className="zoom-value">{Math.round(data.zoom * 100)}%</span>
        <button type="button" className="icon-btn" onClick={() => act('in')} aria-label="Zoom in">
          <Icon name="plus" size={16} />
        </button>
        <button type="button" className="btn sm" onClick={() => act('reset')}>
          Reset
        </button>
      </div>
    </div>
  );
}

export function ConfirmDialog({ data }: { data: { title: string; body: string; confirm: string; cancel?: string; danger?: boolean } }) {
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => ok.current?.focus(), []);
  return (
    <div className="dialog surface pop" role="alertdialog" aria-modal>
      <div className="dialog-title">{data.title}</div>
      <p className="dialog-body">{data.body}</p>
      <div className="pop-actions">
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={dismiss}>
          {data.cancel ?? 'Cancel'}
        </button>
        <button type="button" ref={ok} className={`btn ${data.danger ? 'danger' : 'primary'}`} onClick={() => act('confirm')}>
          {data.confirm}
        </button>
      </div>
    </div>
  );
}
