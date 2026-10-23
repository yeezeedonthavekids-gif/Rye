import { useEffect, useRef, useState } from 'react';
import { rye } from '../ui/bridge';
import { Icon } from '../ui/Icon';
import { tip } from './tooltip';

/** Find-in-page lives inside the toolbar, beside the address bar, so it never covers the page. */
export function FindBar({ tabId, open, onClose }: { tabId: number; open: boolean; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [result, setResult] = useState<{ tabId: number; active: number; matches: number } | null>(null);
  const text = texts[tabId] ?? '';

  useEffect(() => rye.on('ui:find-result', (r: { tabId: number; active: number; matches: number }) => setResult(r)), []);
  useEffect(() => {
    if (open) requestAnimationFrame(() => (input.current?.focus(), input.current?.select()));
  }, [open, tabId]);
  useEffect(
    () =>
      rye.on('ui:find', () => {
        requestAnimationFrame(() => (input.current?.focus(), input.current?.select()));
      }),
    [],
  );

  if (!open) return null;
  const r = result?.tabId === tabId ? result : null;
  const none = !!text && r && r.matches === 0;

  return (
    <div className="findbar" data-empty={none || undefined}>
      <Icon name="search" size={14} className="find-icon" />
      <input
        ref={input}
        className="find-input"
        placeholder="Find in page"
        spellCheck={false}
        value={text}
        aria-label="Find in page"
        onChange={(e) => {
          const v = e.target.value;
          setTexts((t) => ({ ...t, [tabId]: v }));
          rye.send('find:query', v, true, false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (text) rye.send('find:query', text, !e.shiftKey, true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <span className="find-count">{text && r ? `${r.matches ? r.active : 0}/${r.matches}` : ''}</span>
      <button type="button" className="icon-btn xs" disabled={!r?.matches} onClick={() => rye.send('find:query', text, false, true)} {...tip('Previous match', 'Shift+Enter')}>
        <Icon name="chevron-up" size={15} />
      </button>
      <button type="button" className="icon-btn xs" disabled={!r?.matches} onClick={() => rye.send('find:query', text, true, true)} {...tip('Next match', 'Enter')}>
        <Icon name="chevron-down" size={15} />
      </button>
      <button type="button" className="icon-btn xs" onClick={onClose} {...tip('Close', 'Esc')}>
        <Icon name="x" size={14} stroke={2} />
      </button>
    </div>
  );
}
