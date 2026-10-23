import { useCallback, useEffect, useState } from 'react';
import type { DownloadEntry } from '../../shared/types';
import { rye } from '../ui/bridge';
import { DownloadRow } from '../ui/DownloadRow';
import { dayLabel, Empty, LibraryHeader, SearchField, useRyeEvent } from './common';

type Entry = DownloadEntry & { exists?: boolean };

export default function DownloadsPage() {
  const [list, setList] = useState<Entry[] | null>(null);
  const [query, setQuery] = useState('');
  const load = useCallback(() => void rye.invoke<Entry[]>('downloads:list').then(setList), []);
  useEffect(load, [load]);
  useRyeEvent('page:downloads', load);

  const q = query.trim().toLowerCase();
  const shown = (list ?? []).filter((e) => !q || e.filename.toLowerCase().includes(q) || e.url.toLowerCase().includes(q));
  const groups: [string, Entry[]][] = [];
  for (const e of shown) {
    const label = dayLabel(e.started);
    const g = groups[groups.length - 1];
    if (g && g[0] === label) g[1].push(e);
    else groups.push([label, [e]]);
  }

  return (
    <div className="library">
      <LibraryHeader current="downloads">
        <SearchField value={query} onChange={setQuery} placeholder="Search downloads" />
        <button type="button" className="btn sm ghost" disabled={!list?.length} onClick={() => rye.invoke('downloads:clear')}>
          Clear list
        </button>
      </LibraryHeader>
      <main className="lib-body">
        {list && !shown.length && <Empty icon="download" title={q ? 'No matches' : 'No downloads'} body={q ? undefined : 'Files you download appear here.'} />}
        {groups.map(([label, entries]) => (
          <section key={label} className="day">
            <h2 className="day-title">{label}</h2>
            <div className="dl-list page">
              {entries.map((e) => (
                <DownloadRow key={e.id} e={e} onAction={(id, action) => rye.invoke('downloads:action', id, action)} />
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
