import { lazy, Suspense, useEffect } from 'react';
import type { ThemePayload } from '../../shared/types';
import { rye, useThemePayload } from '../ui/bridge';

// Each internal page is its own chunk, so a new tab never parses Settings or History code.
const NewTab = lazy(() => import('./NewTab'));
const SettingsPage = lazy(() => import('./Settings'));
const HistoryPage = lazy(() => import('./History'));
const BookmarksPage = lazy(() => import('./Bookmarks'));
const DownloadsPage = lazy(() => import('./Downloads'));

const TITLES: Record<string, string> = {
  newtab: 'New Tab',
  settings: 'Settings',
  history: 'History',
  bookmarks: 'Bookmarks',
  downloads: 'Downloads',
  about: 'About Rye',
};

export function PagesApp() {
  const theme = useThemePayload('page:theme', () => rye.invoke<ThemePayload>('page:theme'));
  const page = location.host;
  useEffect(() => {
    document.title = TITLES[page] ?? 'Rye';
    document.documentElement.dataset.page = page;
  }, [page]);
  if (!theme) return null;
  let view;
  switch (page) {
    case 'newtab':
      view = <NewTab theme={theme} />;
      break;
    case 'history':
      view = <HistoryPage />;
      break;
    case 'bookmarks':
      view = <BookmarksPage />;
      break;
    case 'downloads':
      view = <DownloadsPage />;
      break;
    default:
      view = <SettingsPage theme={theme} forced={page === 'about' ? 'about' : undefined} />;
  }
  return <Suspense fallback={null}>{view}</Suspense>;
}
