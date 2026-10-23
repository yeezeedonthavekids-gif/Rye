import { useCallback, useEffect, useRef, useState } from 'react';
import type { Suggestion, TabState } from '../../shared/types';
import { displayUrl } from '../../shared/url';
import { px, rye } from '../ui/bridge';
import { Icon, RyeMark } from '../ui/Icon';
import { hideTooltip, tip } from './tooltip';

const INTERNAL_NAMES: Record<string, string> = {
  settings: 'Settings',
  history: 'History',
  bookmarks: 'Bookmarks',
  downloads: 'Downloads',
  about: 'About',
  newtab: 'New tab',
};

function rectOf(el: Element | null) {
  const r = el?.getBoundingClientRect();
  return r ? { x: r.left, y: r.top, width: r.width, height: r.height } : { x: 0, y: 0, width: 0, height: 0 };
}

export function AddressBar({ tab, bookmarked, isPrivate, engineName }: { tab: TabState | undefined; bookmarked: boolean; isPrivate: boolean; engineName: string }) {
  const input = useRef<HTMLInputElement>(null);
  const capsule = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState('');
  const typed = useRef('');
  const [items, setItems] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState(0);
  const query = useRef(0);
  const blurTimer = useRef(0);
  const lastKey = useRef('');
  const justFocused = useRef(false);

  const url = tab?.url ?? '';
  const isNewTab = url.startsWith('rye://newtab');

  // While not editing, mirror the active tab's URL.
  useEffect(() => {
    if (!focused) setText(isNewTab ? '' : url);
  }, [url, focused, isNewTab]);

  // Switching tabs always discards an unfinished edit from the previous tab.
  useEffect(() => {
    const next = isNewTab ? '' : url;
    setText(next);
    typed.current = next;
    query.current++;
    setItems([]);
    rye.send('suggest:hide');
    if (document.activeElement === input.current) requestAnimationFrame(() => input.current?.select());
  }, [tab?.id]);

  const placeSuggest = useCallback((list: Suggestion[], sel: number) => {
    if (!list.length || !capsule.current) {
      rye.send('suggest:hide');
      return;
    }
    const r = capsule.current.getBoundingClientRect();
    const row = Math.round(px('--row-h', 32) * 1.15);
    const height = list.length * row + 12 + 20;
    rye.send('suggest:show', list, sel, { x: r.left - 10, y: r.bottom + 2, width: r.width + 20, height });
  }, []);

  const runQuery = useCallback(
    async (value: string, allowInline: boolean) => {
      const id = ++query.current;
      if (!value.trim()) {
        setItems([]);
        rye.send('suggest:hide');
        return;
      }
      const res = await rye.invoke<{ items: Suggestion[]; inline: string | null }>('suggest:query', value);
      if (id !== query.current) return;
      let list = res.items;
      setItems(list);
      setSelected(0);
      placeSuggest(list, 0);
      // Inline completion: only when the caret is at the end and the user is typing forward.
      if (allowInline && res.inline && input.current && input.current.selectionStart === value.length && res.inline.toLowerCase().startsWith(value.toLowerCase())) {
        const full = value + res.inline.slice(value.length);
        input.current.value = full;
        setText(full);
        input.current.setSelectionRange(value.length, full.length);
      }
      const remote = await rye.invoke<Suggestion[]>('suggest:remote', value);
      if (id !== query.current || !remote.length) return;
      list = [list[0], ...remote.slice(0, 3), ...list.slice(1)].slice(0, 8);
      setItems(list);
      placeSuggest(list, 0);
    },
    [placeSuggest],
  );

  const close = useCallback(() => {
    query.current++;
    setItems([]);
    rye.send('suggest:hide');
  }, []);

  const focusInput = useCallback((selectAll: boolean, preset?: string) => {
    const el = input.current;
    if (!el) return;
    el.focus();
    if (preset !== undefined) {
      el.value = preset;
      setText(preset);
      typed.current = preset;
    }
    if (selectAll) el.select();
  }, []);

  useEffect(() => rye.on('ui:focus-address', ({ selectAll, text: preset }: { selectAll: boolean; text?: string }) => focusInput(selectAll, preset)), [focusInput]);

  const commit = (s: Suggestion | undefined, value: string, disposition: 'current' | 'new' = 'current') => {
    close();
    if (s?.kind === 'tab' && s.tabId !== undefined && disposition === 'current') {
      rye.send('nav:switch-tab', s.tabId);
    } else if (s?.kind === 'engine') {
      focusInput(false, s.url);
      return;
    } else if (s && s.kind !== 'search' && s.kind !== 'url') {
      rye.send('nav:go', s.url, disposition);
    } else if (s?.kind === 'search' && s.title !== typed.current) {
      rye.send('nav:go', s.url, disposition);
    } else {
      rye.send('nav:go', value, disposition);
    }
    input.current?.blur();
  };

  // Hover and clicks on suggestions are reported by the overlay layer.
  useEffect(() => {
    const offHover = rye.on('ui:suggest-hover', (i: number) => setSelected(i));
    const offPick = rye.on('ui:suggest-pick', (i: number, d: 'current' | 'new') => {
      window.clearTimeout(blurTimer.current);
      const s = items[i];
      commit(s, s?.kind === 'search' ? s.title : (s?.url ?? text), d);
    });
    return () => {
      offHover();
      offPick();
    };
  });

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    lastKey.current = e.key;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault();
      const next = (selected + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      setSelected(next);
      placeSuggest(items, next);
      const s = items[next];
      const shown = next === 0 ? typed.current : s.kind === 'search' ? s.title : s.url;
      if (s.kind !== 'engine') setText(shown);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = (input.current?.value ?? text).trim();
      if (!value) return;
      const s = selected > 0 ? items[selected] : undefined;
      commit(s, value, e.altKey || e.metaKey ? 'new' : 'current');
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (items.length) {
        close();
        setText(typed.current);
        return;
      }
      setText(isNewTab ? '' : url);
      input.current?.blur();
      rye.send('ui:focus-page');
      return;
    }
    if (e.key === 'Tab' && items[selected]?.kind === 'engine') {
      e.preventDefault();
      focusInput(false, items[selected].url);
      runQuery(items[selected].url, false);
    }
  };

  const security = tab?.security ?? 'none';
  const internalPage = tab?.internal ? url.replace('rye://', '').split(/[/?#]/)[0] : '';
  const display = displayUrl(url);
  const host = display.split(/[/?#]/)[0];
  const rest = display.slice(host.length);
  const zoom = tab?.zoom ?? 1;

  return (
    <div ref={capsule} className="address" data-focused={focused} data-display={!focused && (!!display || (!!tab?.internal && !isNewTab))} data-security={security} data-private={isPrivate}>
      <button
        type="button"
        className="address-chip"
        data-anchor="siteInfo"
        data-kind={internalPage ? 'internal' : security}
        onClick={(e) => {
          hideTooltip(true);
          rye.send('site:info', rectOf(e.currentTarget));
        }}
        {...tip(security === 'secure' ? 'Connection is secure' : security === 'insecure' ? 'Connection is not secure' : 'Site information')}
      >
        {internalPage ? (
          <>
            <RyeMark size={15} />
            {!focused && internalPage !== 'newtab' && <span className="chip-label">{INTERNAL_NAMES[internalPage] ?? 'Rye'}</span>}
          </>
        ) : security === 'insecure' ? (
          <>
            <Icon name="warning" size={14} />
            {!focused && <span className="chip-label">Not secure</span>}
          </>
        ) : security === 'error' ? (
          <Icon name="alert" size={15} />
        ) : security === 'file' ? (
          <Icon name="file" size={15} />
        ) : security === 'secure' ? (
          <Icon name="lock" size={14} />
        ) : (
          <Icon name="search" size={15} />
        )}
      </button>

      <div className="address-field">
        <input
          ref={input}
          className="address-input"
          spellCheck={false}
          autoComplete="off"
          aria-label="Address and search bar"
          placeholder={isPrivate ? `Search privately with ${engineName} or enter address` : `Search with ${engineName} or enter address`}
          value={text}
          onFocus={(e) => {
            window.clearTimeout(blurTimer.current);
            setFocused(true);
            typed.current = e.currentTarget.value;
            // Select synchronously so fast typing right after focusing isn't swallowed.
            e.currentTarget.select();
            justFocused.current = true;
          }}
          onMouseUp={(e) => {
            // Keep the select-all from focusing; a later click places the caret normally.
            if (justFocused.current) e.preventDefault();
            justFocused.current = false;
          }}
          onBlur={() => {
            // The overlay may be about to report a click on a suggestion.
            blurTimer.current = window.setTimeout(() => {
              setFocused(false);
              close();
            }, 140);
          }}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            typed.current = v;
            const deleting = lastKey.current === 'Backspace' || lastKey.current === 'Delete';
            runQuery(v, !deleting);
          }}
          onKeyDown={onKeyDown}
          onPaste={() => (lastKey.current = 'paste')}
        />
        {!focused && display && (
          <div className="address-display" aria-hidden onMouseDown={(e) => (e.preventDefault(), focusInput(true))}>
            <span className="host">{host}</span>
            <span className="rest">{rest}</span>
          </div>
        )}
      </div>

      {Math.abs(zoom - 1) > 0.001 && (
        <button type="button" className="address-pill" onClick={(e) => rye.send('zoom:popover', rectOf(e.currentTarget))} {...tip('Zoom')}>
          {Math.round(zoom * 100)}%
        </button>
      )}
      {!tab?.internal && !tab?.error && (
        <button
          type="button"
          className="icon-btn sm address-star"
          data-anchor="star"
          data-on={bookmarked}
          onClick={(e) => {
            hideTooltip(true);
            rye.send('bookmarks:popover', rectOf(e.currentTarget));
          }}
          {...tip(bookmarked ? 'Edit bookmark' : 'Bookmark this page', rye.platform === 'darwin' ? '⌘D' : 'Ctrl+D')}
        >
          <Icon name="star" size={15} fill={bookmarked ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>
  );
}
