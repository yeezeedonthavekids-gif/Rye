import { useCallback, useEffect, useState } from 'react';
import type { HistoryVisit } from '../../shared/types';
import { displayUrl, hostOf } from '../../shared/url';
import { rye } from '../ui/bridge';
import { Favicon } from '../ui/components';
import { Icon } from '../ui/Icon';
import { dayLabel, Empty, LibraryHeader, open, SearchField, useRyeEvent } from './common';
import { ClearDataDialog } from './Settings';

export default function HistoryPage() {
  const [query, setQuery] = useState('');
  const [visits, setVisits] = useState<HistoryVisit[] | null>(null);
  const [more, setMore] = useState(true);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(() => {
    rye.invoke<HistoryVisit[]>('history:query', query).then((v) => {
      setVisits(v);
      setMore(v.length >= 400);
    });
  }, [query]);

  useEffect(() => {
    const t = setTimeout(load, query ? 120 : 0);
    return () => clearTimeout(t);
  }, [load]);
  useRyeEvent('page:history', load);

  const loadMore = () => {
    const last = visits?.[visits.length - 1];
    if (!last) return;
    rye.invoke<HistoryVisit[]>('history:query', query, last.time).then((v) => {
      setVisits((cur) => [...(cur ?? []), ...v]);
      setMore(v.length >= 400);
    });
  };

  const groups: [string, HistoryVisit[]][] = [];
  for (const v of visits ?? []) {
    const label = dayLabel(v.time);
    const g = groups[groups.length - 1];
    if (g && g[0] === label) g[1].push(v);
    else groups.push([label, [v]]);
  }

  return (
    <div className="library">
      <LibraryHeader current="history">
        <SearchField value={query} onChange={setQuery} placeholder="Search history" autoFocus />
        <button type="button" className="btn sm ghost" onClick={() => setClearing(true)}>
          Clear browsing data…
        </button>
      </LibraryHeader>
      <main className="lib-body">
        {visits && !visits.length && (query ? <Empty icon="search" title="No matches" body={`Nothing in your history matches “${query}”.`} /> : <Empty icon="history" title="No history yet" body="Pages you visit will appear here." />)}
        {groups.map(([label, list]) => (
          <section key={label} className="day">
            <h2 className="day-title">{label}</h2>
            {list.map((v) => (
              <div key={v.id} className="list-row" onClick={(e) => open(v.url, e)} onAuxClick={(e) => e.button === 1 && open(v.url, e)} role="link" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && open(v.url)}>
                <span className="list-time">{new Date(v.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                <Favicon src={v.favicon} url={v.url} title={v.title} />
                <span className="list-title">{v.title || displayUrl(v.url)}</span>
                <span className="list-detail">{hostOf(v.url)}</span>
                <button
                  type="button"
                  className="icon-btn sm list-action"
                  aria-label="Remove from history"
                  onClick={(e) => {
                    e.stopPropagation();
                    rye.invoke('history:remove', [v.id]);
                  }}
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
          </section>
        ))}
        {more && !!visits?.length && (
          <div className="load-more">
            <button type="button" className="btn sm" onClick={loadMore}>
              Show older
            </button>
          </div>
        )}
      </main>
      {clearing && <ClearDataDialog onClose={() => setClearing(false)} />}
    </div>
  );
}
