import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ACCENTS, PRESETS } from '../../shared/defaults';
import { computeTheme } from '../../shared/theme';
import type { Settings, ThemePayload } from '../../shared/types';
import { rye } from '../ui/bridge';
import { Check, formatBytes, Segmented, Select, Slider, Toggle } from '../ui/components';
import { Icon, RyeMark } from '../ui/Icon';
import { Empty, Modal, open, SearchField } from './common';

const set = (path: string, value: unknown) => rye.invoke('settings:set', path, value);

const SECTIONS = [
  { id: 'general', label: 'General', icon: 'sliders' },
  { id: 'appearance', label: 'Appearance', icon: 'palette' },
  { id: 'tabs', label: 'Tabs', icon: 'layers' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'privacy', label: 'Privacy & security', icon: 'shield' },
  { id: 'downloads', label: 'Downloads', icon: 'download' },
  { id: 'bookmarks', label: 'Bookmarks', icon: 'bookmark' },
  { id: 'extensions', label: 'Extensions', icon: 'puzzle' },
  { id: 'shortcuts', label: 'Keyboard shortcuts', icon: 'keyboard' },
  { id: 'about', label: 'About Rye', icon: 'info' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

const Query = createContext('');

/** A setting row. While searching, rows that don't match hide themselves. */
function Row({ label, desc, keywords = '', children, stack }: { label: string; desc?: ReactNode; keywords?: string; children?: ReactNode; stack?: boolean }) {
  const q = useContext(Query).trim().toLowerCase();
  if (q && !`${label} ${typeof desc === 'string' ? desc : ''} ${keywords}`.toLowerCase().includes(q)) return null;
  return (
    <div className={`row${stack ? ' stack' : ''}`}>
      <div className="row-text">
        <div className="row-label">{label}</div>
        {desc && <div className="row-desc">{desc}</div>}
      </div>
      {children && <div className="row-control">{children}</div>}
    </div>
  );
}

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="group">
      {title && <h3 className="group-title">{title}</h3>}
      <div className="group-rows">{children}</div>
    </section>
  );
}

// ─── Appearance ──────────────────────────────────────────────────────────────

/** A miniature Rye drawn entirely with the live design tokens. */
function Preview({ s }: { s: Settings }) {
  const a = s.appearance;
  return (
    <div className="preview" data-vertical={a.tabLayout === 'vertical'} aria-hidden>
      {a.tabLayout === 'vertical' ? (
        <div className="pv-side">
          <span className="pv-tab on" />
          <span className="pv-tab" />
          <span className="pv-tab" />
        </div>
      ) : (
        <div className="pv-strip">
          <span className="pv-tab on" />
          <span className="pv-tab" />
          <span className="pv-tab" />
        </div>
      )}
      <div className="pv-main">
        <div className="pv-bar">
          <span className="pv-dot" />
          <span className="pv-dot" />
          <span className="pv-address">
            <span className="pv-lock" />
          </span>
        </div>
        <div className="pv-sheet">
          <span className="pv-line w60" />
          <span className="pv-line w80" />
          <span className="pv-line w40" />
          <span className="pv-button" />
        </div>
      </div>
    </div>
  );
}

function PresetCard({ id, name, description, active }: { id: string; name: string; description: string; active: boolean }) {
  const p = PRESETS.find((x) => x.id === id)!;
  const dark = p.values.theme === 'dark' || (p.values.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const t = computeTheme({ ...(p.values as any), roundness: p.values.roundness ?? 60, density: 'comfortable', floatingPage: true }, dark).vars;
  return (
    <button type="button" className="preset" aria-pressed={active} onClick={() => rye.invoke('settings:preset', id)}>
      <span className="preset-swatch" style={{ background: t['--frame'], borderRadius: t['--r-md'] }}>
        <span style={{ background: t['--raised'], borderRadius: t['--r-sm'] }} />
        <span style={{ background: t['--sheet'], borderRadius: t['--r-sm'] }}>
          <i style={{ background: t['--accent'] }} />
        </span>
      </span>
      <span className="preset-name">{name}</span>
      <span className="preset-desc">{description}</span>
    </button>
  );
}

function Appearance({ s }: { s: Settings }) {
  const a = s.appearance;
  const tb = a.toolbarButtons;
  const toggleButton = (b: string, on: boolean) => set('appearance.toolbarButtons', on ? [...tb, b] : tb.filter((x) => x !== b));
  return (
    <>
      {!useContext(Query) && (
        <div className="appearance-hero">
          <Preview s={s} />
          <div className="presets">
            {PRESETS.map((p) => (
              <PresetCard key={p.id} {...p} active={a.preset === p.id} />
            ))}
          </div>
        </div>
      )}
      <Group title="Colour">
        <Row label="Theme" keywords="dark light mode system">
          <Segmented value={a.theme} onChange={(v) => set('appearance.theme', v)} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        </Row>
        <Row label="Accent colour" keywords="color highlight">
          <div className="accents">
            {ACCENTS.map((c) => (
              <button key={c} type="button" className="accent-dot" style={{ background: c }} aria-pressed={a.accent.toLowerCase() === c} aria-label={c} onClick={() => set('appearance.accent', c)} />
            ))}
            <label className="accent-dot custom" title="Custom colour" aria-pressed={!ACCENTS.includes(a.accent.toLowerCase())}>
              <input type="color" value={a.accent} onChange={(e) => set('appearance.accent', e.target.value)} />
            </label>
          </div>
        </Row>
        <Row label="Surface tint" desc="The undertone of Rye’s frame and menus" keywords="warm cool neutral color">
          <Segmented value={a.tint} onChange={(v) => set('appearance.tint', v)} options={[{ value: 'warm', label: 'Warm' }, { value: 'neutral', label: 'Neutral' }, { value: 'cool', label: 'Cool' }]} />
        </Row>
      </Group>
      <Group title="Shape & space">
        <Row label="Corner roundness" desc="Scales every corner in Rye together" keywords="radius rounded">
          <Slider value={a.roundness} onChange={(v) => set('appearance.roundness', v)} label="Corner roundness" />
        </Row>
        <Row label="Density" keywords="compact spacious size">
          <Segmented value={a.density} onChange={(v) => set('appearance.density', v)} options={[{ value: 'compact', label: 'Compact' }, { value: 'comfortable', label: 'Comfortable' }, { value: 'spacious', label: 'Spacious' }]} />
        </Row>
        <Row label="Floating page" desc="Inset the page as a rounded sheet, or run it edge to edge" keywords="frame border">
          <Toggle checked={a.floatingPage} onChange={(v) => set('appearance.floatingPage', v)} label="Floating page" />
        </Row>
      </Group>
      <Group title="Tabs & toolbar">
        <Row label="Tab layout" keywords="vertical sidebar horizontal">
          <Segmented value={a.tabLayout} onChange={(v) => set('appearance.tabLayout', v)} options={[{ value: 'horizontal', label: 'Top' }, { value: 'vertical', label: 'Side' }]} />
        </Row>
        {a.tabLayout === 'vertical' && (
          <Row label="Collapse sidebar" desc="Show only tab icons" keywords="sidebar">
            <Toggle checked={a.sidebarCollapsed} onChange={(v) => set('appearance.sidebarCollapsed', v)} label="Collapse sidebar" />
          </Row>
        )}
        <Row label="Tab shape" keywords="pill soft quiet">
          <Segmented value={a.tabShape} onChange={(v) => set('appearance.tabShape', v)} options={[{ value: 'soft', label: 'Soft' }, { value: 'pill', label: 'Pill' }, { value: 'quiet', label: 'Quiet' }]} />
        </Row>
        <Row label="Tab spacing" keywords="gap">
          <Slider value={a.tabSpacing} onChange={(v) => set('appearance.tabSpacing', v)} label="Tab spacing" />
        </Row>
        <Row label="Bookmarks bar" keywords="favorites">
          <Segmented value={a.bookmarksBar} onChange={(v) => set('appearance.bookmarksBar', v)} options={[{ value: 'always', label: 'Always' }, { value: 'newtab', label: 'New tab' }, { value: 'never', label: 'Never' }]} />
        </Row>
        <Row label="Toolbar buttons" desc="Right-click the toolbar to change these anytime" keywords="home downloads history toolbar icons" stack>
          <div className="checks">
            {[
              ['home', 'Home'],
              ['bookmarks', 'Bookmarks'],
              ['history', 'History'],
              ['downloads', 'Downloads'],
              ['private', 'Private window'],
            ].map(([id, label]) => (
              <Check key={id} checked={tb.includes(id as any)} onChange={(v) => toggleButton(id, v)} label={label} />
            ))}
          </div>
        </Row>
      </Group>
      <Group title="Text & motion">
        <Row label="Interface font" keywords="typeface typography">
          <Segmented value={a.font} onChange={(v) => set('appearance.font', v)} options={[{ value: 'inter', label: 'Rye Sans' }, { value: 'system', label: 'System' }, { value: 'rounded', label: 'Rounded' }]} />
        </Row>
        <Row label="Text size" keywords="font scale">
          <Segmented value={a.fontScale} onChange={(v) => set('appearance.fontScale', v)} options={[{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }]} />
        </Row>
        <Row label="Animations" desc="Rye also follows your system’s reduce-motion setting" keywords="motion transitions">
          <Segmented value={a.motion} onChange={(v) => set('appearance.motion', v)} options={[{ value: 'full', label: 'Full' }, { value: 'reduced', label: 'Reduced' }, { value: 'off', label: 'Off' }]} />
        </Row>
      </Group>
      {!useContext(Query) && <div className="section-foot">
        <button type="button" className="btn ghost" onClick={() => rye.invoke('settings:reset', 'appearance')}>
          Reset appearance
        </button>
      </div>}
    </>
  );
}

// ─── Other sections ──────────────────────────────────────────────────────────

function General({ s }: { s: Settings }) {
  const g = s.general;
  const [home, setHome] = useState(g.homepage === 'rye://newtab' ? '' : g.homepage);
  return (
    <Group>
      <Row label="On startup" keywords="restore session open">
        <Segmented value={g.startup} onChange={(v) => set('general.startup', v)} options={[{ value: 'restore', label: 'Continue where I left off' }, { value: 'newtab', label: 'New tab' }, { value: 'homepage', label: 'Home page' }]} />
      </Row>
      <Row label="Home page" desc="Leave empty to use the new tab page" keywords="homepage start">
        <input
          className="field"
          style={{ width: 260 }}
          value={home}
          placeholder="New tab page"
          onChange={(e) => setHome(e.target.value)}
          onBlur={() => {
            const v = home.trim();
            set('general.homepage', !v ? 'rye://newtab' : /^[a-z]+:/i.test(v) ? v : `https://${v}`);
          }}
        />
      </Row>
      <Row label="Ask before closing a window with many tabs" keywords="confirm quit">
        <Toggle checked={g.confirmQuitWithManyTabs} onChange={(v) => set('general.confirmQuitWithManyTabs', v)} />
      </Row>
    </Group>
  );
}

function Tabs({ s }: { s: Settings }) {
  const t = s.tabs;
  const [slept, setSlept] = useState<number | null>(null);
  return (
    <Group>
      <Row label="Open links from menus in the background" keywords="new tab focus">
        <Toggle checked={t.openLinksInBackground} onChange={(v) => set('tabs.openLinksInBackground', v)} />
      </Row>
      <Row label="Close the window with its last tab">
        <Toggle checked={t.closeWindowWithLastTab} onChange={(v) => set('tabs.closeWindowWithLastTab', v)} />
      </Row>
      <Row label="Show titles when hovering tabs" keywords="tooltip preview">
        <Toggle checked={t.showHoverPreviewTitles} onChange={(v) => set('tabs.showHoverPreviewTitles', v)} />
      </Row>
      <Row label="Sleep inactive tabs" desc="Frees memory from tabs you haven’t looked at. Pinned and playing tabs stay awake." keywords="memory performance discard">
        <Select
          value={String(t.sleepInactiveMinutes)}
          width={150}
          onChange={(v) => set('tabs.sleepInactiveMinutes', Number(v))}
          options={[
            { value: '0', label: 'Never' },
            { value: '15', label: 'After 15 min' },
            { value: '30', label: 'After 30 min' },
            { value: '60', label: 'After 1 hour' },
            { value: '180', label: 'After 3 hours' },
          ]}
        />
      </Row>
      <Row label="Sleep background tabs now" desc={slept !== null ? `${slept} tab${slept === 1 ? '' : 's'} put to sleep` : undefined} keywords="memory">
        <button type="button" className="btn sm" onClick={() => rye.invoke<number>('app:sleep-tab').then(setSlept)}>
          Sleep tabs
        </button>
      </Row>
    </Group>
  );
}

function Search({ s }: { s: Settings }) {
  const q = s.search;
  const [adding, setAdding] = useState(false);
  const custom = q.engines.filter((e) => !e.builtIn);
  return (
    <>
      <Group>
        <Row label="Search engine" desc="Used in the address bar and on the new tab page" keywords="default google duckduckgo bing">
          <Select value={q.engine} onChange={(v) => set('search.engine', v)} options={q.engines.map((e) => ({ value: e.id, label: e.name, detail: `@${e.keyword}` }))} />
        </Row>
        <Row label="Search suggestions from your engine" desc="Sends what you type in the address bar to your search engine as you type. Off by default; never used in private windows." keywords="privacy autocomplete">
          <Toggle checked={q.suggestions} onChange={(v) => set('search.suggestions', v)} />
        </Row>
        <Row label="Suggest from history" keywords="autocomplete">
          <Toggle checked={q.showHistorySuggestions} onChange={(v) => set('search.showHistorySuggestions', v)} />
        </Row>
        <Row label="Suggest bookmarks" keywords="autocomplete">
          <Toggle checked={q.showBookmarkSuggestions} onChange={(v) => set('search.showBookmarkSuggestions', v)} />
        </Row>
        <Row label="Suggest open tabs" keywords="switch">
          <Toggle checked={q.showTabSuggestions} onChange={(v) => set('search.showTabSuggestions', v)} />
        </Row>
      </Group>
      <Group title="Engine shortcuts">
        <Row label="Search a specific engine" desc={<>Type <span className="kbd">@</span> followed by a keyword, then your query — for example <span className="kbd">@w rye bread</span>.</>} keywords="keyword shortcut" />
        {custom.map((e) => (
          <Row key={e.id} label={e.name} desc={`@${e.keyword} · ${e.url}`}>
            <button type="button" className="icon-btn sm" aria-label={`Remove ${e.name}`} onClick={() => set('search.engines', q.engines.filter((x) => x.id !== e.id))}>
              <Icon name="trash" size={15} />
            </button>
          </Row>
        ))}
        <Row label="Add a search engine" keywords="custom">
          <button type="button" className="btn sm" onClick={() => setAdding(true)}>
            Add…
          </button>
        </Row>
      </Group>
      {adding && <EngineDialog s={s} onClose={() => setAdding(false)} />}
    </>
  );
}

function EngineDialog({ s, onClose }: { s: Settings; onClose: () => void }) {
  const [name, setName] = useState('');
  const [keyword, setKeyword] = useState('');
  const [url, setUrl] = useState('');
  const valid = name.trim() && /^[a-z0-9]+$/i.test(keyword) && /^https?:\/\/.+%s/.test(url) && !s.search.engines.some((e) => e.keyword === keyword);
  return (
    <Modal title="Add search engine" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          set('search.engines', [...s.search.engines, { id: `c${Date.now().toString(36)}`, name: name.trim(), keyword, url: url.trim() }]);
          onClose();
        }}
      >
        <label className="form-label">
          Name
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="form-label">
          Keyword
          <input className="field" value={keyword} onChange={(e) => setKeyword(e.target.value.replace(/\s/g, ''))} placeholder="e.g. mdn" />
        </label>
        <label className="form-label">
          URL with %s in place of the query
          <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/search?q=%s" />
        </label>
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!valid}>
            Add
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ClearDataDialog({ onClose }: { onClose: () => void }) {
  const [range, setRange] = useState('0');
  const [opts, setOpts] = useState({ history: true, cookies: false, cache: true, downloads: false, permissions: false });
  const [busy, setBusy] = useState(false);
  const flip = (k: keyof typeof opts) => (v: boolean) => setOpts((o) => ({ ...o, [k]: v }));
  return (
    <Modal title="Clear browsing data" onClose={onClose}>
      <div className="form">
        <div className="form-label">
          History time range
          <Select value={range} onChange={setRange} width={360} options={[{ value: '3600000', label: 'Last hour' }, { value: '86400000', label: 'Last 24 hours' }, { value: '604800000', label: 'Last 7 days' }, { value: '2419200000', label: 'Last 4 weeks' }, { value: '0', label: 'All time' }]} />
        </div>
        <div className="checks column">
          <Check checked={opts.history} onChange={flip('history')} label="Browsing history" />
          <Check checked={opts.cookies} onChange={flip('cookies')} label="Cookies and site data — signs you out of most sites" />
          <Check checked={opts.cache} onChange={flip('cache')} label="Cached images and files" />
          <Check checked={opts.downloads} onChange={flip('downloads')} label="Download list (files stay on disk)" />
          <Check checked={opts.permissions} onChange={flip('permissions')} label="Site permissions" />
        </div>
        <p className="form-note">The time range applies to history. Cookies, cache and permissions are always cleared entirely.</p>
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy || !Object.values(opts).some(Boolean)}
            onClick={async () => {
              setBusy(true);
              await rye.invoke('data:clear', { ...opts, since: Number(range) });
              onClose();
            }}
          >
            {busy ? 'Clearing…' : 'Clear data'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Privacy({ s, clear }: { s: Settings; clear: boolean }) {
  const p = s.privacy;
  const [dialog, setDialog] = useState(clear);
  const [sites, setSites] = useState<{ cookies: { domain: string; count: number }[]; permissions: { origin: string; permission: string; label: string; decision: string }[] } | null>(null);
  const [showSites, setShowSites] = useState(false);
  const load = () => rye.invoke<any>('site:list').then(setSites);
  useEffect(() => {
    if (showSites || !sites) load();
  }, [showSites]);
  return (
    <>
      <Group>
        <Row label="Clear browsing data" desc="History, cookies, cache and more" keywords="delete history cookies cache">
          <button type="button" className="btn sm" onClick={() => setDialog(true)}>
            Clear…
          </button>
        </Row>
        <Row label="Save browsing history" keywords="record">
          <Toggle checked={p.saveHistory} onChange={(v) => set('privacy.saveHistory', v)} />
        </Row>
        <Row label="Clear cookies and site data when Rye closes" keywords="exit quit">
          <Toggle checked={p.clearOnExit} onChange={(v) => set('privacy.clearOnExit', v)} />
        </Row>
        <Row label="Send a Global Privacy Control signal" desc="Asks sites not to sell or share your data. Sites decide whether to honour it." keywords="gpc do not track dnt">
          <Toggle checked={p.sendGpc} onChange={(v) => set('privacy.sendGpc', v)} />
        </Row>
        <Row label="Try HTTPS first" desc="Addresses you type open securely; you’re offered HTTP if the site doesn’t support it" keywords="secure https upgrade">
          <Toggle checked={p.httpsFirst} onChange={(v) => set('privacy.httpsFirst', v)} />
        </Row>
      </Group>
      <Group title="Site permissions">
        {sites?.permissions.length ? (
          sites.permissions.map((x) => (
            <Row key={x.origin + x.permission} label={x.origin.replace(/^https?:\/\//, '')} desc={x.label} keywords="camera microphone location notifications">
              <Segmented
                value={x.decision as any}
                onChange={(v) => rye.invoke('site:set-permission', x.origin, x.permission, v).then(load)}
                options={[{ value: 'allow', label: 'Allow' }, { value: 'ask', label: 'Ask' }, { value: 'block', label: 'Block' }]}
              />
            </Row>
          ))
        ) : (
          <Row label="No saved permissions" desc="When a site asks for your camera, location or similar, your answer is remembered here." keywords="camera microphone location" />
        )}
      </Group>
      <Group title="Cookies and site data">
        <Row label="Sites storing cookies" desc={sites ? `${sites.cookies.length} site${sites.cookies.length === 1 ? '' : 's'}` : undefined} keywords="cookies storage">
          <button type="button" className="btn sm" onClick={() => setShowSites((v) => !v)}>
            {showSites ? 'Hide' : 'Show'}
          </button>
        </Row>
        {showSites &&
          sites?.cookies.map((c) => (
            <Row key={c.domain} label={c.domain} desc={`${c.count} cookie${c.count === 1 ? '' : 's'}`}>
              <button type="button" className="icon-btn sm" aria-label={`Remove data for ${c.domain}`} onClick={() => rye.invoke('site:clear-domain', c.domain).then(load)}>
                <Icon name="trash" size={15} />
              </button>
            </Row>
          ))}
      </Group>
      <Group title="Private windows">
        <Row
          label="How private windows work"
          desc="Private windows use a separate in-memory session. History isn’t recorded, and cookies, cache, permissions and downloads list are discarded when the last private window closes. Your network, employer or the sites you visit can still see your activity."
          keywords="incognito"
        />
      </Group>
      {dialog && <ClearDataDialog onClose={() => (setDialog(false), load())} />}
    </>
  );
}

function Downloads({ s }: { s: Settings }) {
  const d = s.downloads;
  const [def, setDef] = useState('');
  useEffect(() => void rye.invoke<string>('downloads:default-dir').then(setDef), []);
  return (
    <Group>
      <Row label="Save files to" desc={d.directory || def} keywords="folder location directory">
        <div className="inline">
          {d.directory && (
            <button type="button" className="btn sm ghost" onClick={() => set('downloads.directory', '')}>
              Reset
            </button>
          )}
          <button type="button" className="btn sm" onClick={() => rye.invoke('downloads:choose-dir')}>
            Change…
          </button>
        </div>
      </Row>
      <Row label="Ask where to save each file" keywords="dialog">
        <Toggle checked={d.askWhere} onChange={(v) => set('downloads.askWhere', v)} />
      </Row>
      <Row label="Show downloads when they start" keywords="panel popup">
        <Toggle checked={d.openPanelOnStart} onChange={(v) => set('downloads.openPanelOnStart', v)} />
      </Row>
    </Group>
  );
}

function BookmarksSection() {
  const [msg, setMsg] = useState('');
  return (
    <Group>
      <Row label="Manage bookmarks" keywords="folders organize">
        <button type="button" className="btn sm" onClick={() => open('rye://bookmarks')}>
          Open
        </button>
      </Row>
      <Row label="Import bookmarks" desc={msg || 'From an HTML file exported by Chrome, Edge, Firefox or Safari'} keywords="import html chrome firefox">
        <button type="button" className="btn sm" onClick={() => rye.invoke<number>('bookmarks:import').then((n) => n >= 0 && setMsg(`Imported ${n} bookmark${n === 1 ? '' : 's'} into Other bookmarks`))}>
          Import…
        </button>
      </Row>
      <Row label="Export bookmarks" desc="As an HTML file any browser can import" keywords="export backup">
        <button type="button" className="btn sm" onClick={() => rye.invoke('bookmarks:export')}>
          Export…
        </button>
      </Row>
    </Group>
  );
}

function Extensions() {
  const [list, setList] = useState<{ id: string; name: string; version: string; description: string }[]>([]);
  const [err, setErr] = useState('');
  const load = () => rye.invoke<any[]>('ext:list').then(setList);
  useEffect(() => void load(), []);
  return (
    <>
      <Group>
        <Row label="Load an unpacked extension" desc={err || 'Choose a folder that contains a manifest.json'} keywords="install add">
          <button type="button" className="btn sm" onClick={() => rye.invoke<any>('ext:load').then((r) => (r && !r.ok ? setErr(r.error) : setErr(''), load()))}>
            Load…
          </button>
        </Row>
        {list.map((e) => (
          <Row key={e.id} label={`${e.name} ${e.version}`} desc={e.description}>
            <button type="button" className="icon-btn sm" aria-label={`Remove ${e.name}`} onClick={() => rye.invoke('ext:remove', e.id).then(load)}>
              <Icon name="trash" size={15} />
            </button>
          </Row>
        ))}
      </Group>
      <p className="section-note">
        Rye runs on Electron, which supports only part of the Chrome extension platform: content scripts and some background features work, but toolbar popups and the Chrome Web Store don’t. Many popular extensions won’t work fully.
      </p>
    </>
  );
}

function Shortcuts() {
  const [docs, setDocs] = useState<{ keys: string; label: string; group: string }[]>([]);
  useEffect(() => void rye.invoke<any[]>('page:shortcuts').then(setDocs), []);
  const groups = [...new Set(docs.map((d) => d.group))];
  return (
    <>
      {groups.map((g) => (
        <Group key={g} title={g}>
          {docs
            .filter((d) => d.group === g)
            .map((d) => (
              <Row key={d.label} label={d.label} keywords={d.keys}>
                <span className="kbd">{d.keys}</span>
              </Row>
            ))}
        </Group>
      ))}
    </>
  );
}

function About({ perf }: { perf: boolean }) {
  const [info, setInfo] = useState<any>(null);
  const [metrics, setMetrics] = useState<any[] | null>(null);
  const loadMetrics = () => rye.invoke<any[]>('app:metrics').then(setMetrics);
  useEffect(() => {
    rye.invoke('app:info').then(setInfo);
    if (perf) loadMetrics();
  }, []);
  const total = metrics?.reduce((a, m) => a + m.memoryKB, 0) ?? 0;
  return (
    <>
      <div className="about-hero">
        <span className="about-mark">
          <RyeMark size={34} />
        </span>
        <div>
          <div className="about-name">Rye</div>
          <div className="row-desc">Version {info?.version} · Chromium {info?.chrome}</div>
        </div>
      </div>
      <Group title="Privacy">
        <Row label="No telemetry" desc="Rye doesn’t collect usage data or crash reports. It only connects to the sites you visit, plus your search engine when suggestions are on." />
        <Row label="What Rye doesn’t do" desc="Rye has no built-in ad or tracker blocking, no sync, and doesn’t include Widevine, so some DRM video services won’t play." />
      </Group>
      <Group title="Performance">
        <Row label="Memory and processes" desc={metrics ? `${formatBytes(total * 1024)} across ${metrics.length} processes` : 'See what each process is using'} keywords="memory task manager">
          <button type="button" className="btn sm" onClick={loadMetrics}>
            {metrics ? 'Refresh' : 'Show'}
          </button>
        </Row>
        {metrics && (
          <div className="metrics">
            {metrics
              .sort((a, b) => b.memoryKB - a.memoryKB)
              .map((m) => (
                <div key={m.pid} className="metric">
                  <span className="metric-name">{m.tabs.length ? m.tabs.join(', ') : m.name || m.type}</span>
                  <span className="metric-type">{m.type}</span>
                  <span className="metric-val">{formatBytes(m.memoryKB * 1024)}</span>
                  <span className="metric-val">{m.cpu}%</span>
                </div>
              ))}
          </div>
        )}
        {info?.startup && <Row label="Startup" desc={`App ready in ${info.startup.ready} ms · first window in ${info.startup['first-window']} ms`} />}
      </Group>
      <Group title="Versions">
        <Row label="Electron" desc={info?.electron} />
        <Row label="Platform" desc={info?.platform} />
        <Row label="Profile folder" desc={info?.userData} />
      </Group>
    </>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SettingsPage({ theme, forced }: { theme: ThemePayload; forced?: SectionId }) {
  const params = new URLSearchParams(location.search);
  const [section, setSection] = useState<SectionId>(forced ?? ((params.get('section') as SectionId) || 'general'));
  const [query, setQuery] = useState('');
  const s = theme.settings;

  const render = (id: SectionId) => {
    switch (id) {
      case 'general':
        return <General s={s} />;
      case 'appearance':
        return <Appearance s={s} />;
      case 'tabs':
        return <Tabs s={s} />;
      case 'search':
        return <Search s={s} />;
      case 'privacy':
        return <Privacy s={s} clear={params.get('clear') === '1'} />;
      case 'downloads':
        return <Downloads s={s} />;
      case 'bookmarks':
        return <BookmarksSection />;
      case 'extensions':
        return <Extensions />;
      case 'shortcuts':
        return <Shortcuts />;
      case 'about':
        return <About perf={params.get('perf') === '1'} />;
    }
  };

  const go = (id: SectionId) => {
    setSection(id);
    setQuery('');
    history.replaceState(null, '', `?section=${id}`);
    document.querySelector('.settings-main')?.scrollTo({ top: 0 });
  };

  return (
    <Query.Provider value={query}>
      <div className="settings">
        <aside className="settings-nav">
          <div className="settings-brand">
            <RyeMark size={18} />
            Settings
          </div>
          <SearchField value={query} onChange={setQuery} placeholder="Search settings" />
          <nav>
            {SECTIONS.map((x) => (
              <button key={x.id} type="button" className="nav-item" aria-current={!query && section === x.id ? 'page' : undefined} onClick={() => go(x.id)}>
                <Icon name={x.icon} size={16} />
                {x.label}
              </button>
            ))}
          </nav>
        </aside>
        <main className="settings-main">
          <div className="settings-content">
            {query ? (
              <>
                {SECTIONS.filter((x) => x.id !== 'about' && x.id !== 'shortcuts').map((x) => (
                  <div key={x.id} className="search-section">
                    <h2 className="search-section-title">{x.label}</h2>
                    {render(x.id)}
                  </div>
                ))}
                <div className="search-none">
                  <Empty icon="search" title="No matching settings" body="Try a different word, like “dark”, “cookies” or “tabs”." />
                </div>
              </>
            ) : (
              <>
                <h1 className="page-title">{SECTIONS.find((x) => x.id === section)?.label}</h1>
                {render(section)}
              </>
            )}
          </div>
        </main>
      </div>
    </Query.Provider>
  );
}
