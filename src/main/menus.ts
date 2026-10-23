// Menu models. Every menu in Rye (app, tab, page, bookmark folder, history) is
// rendered by the same overlay component, so they all share one visual language.
import type { ContextMenuParams } from 'electron';
import type { MenuItem, ToolbarButton } from '../shared/types';
import { bookmarks } from './bookmarks';
import { settings } from './settings';
import { recentlyClosed } from './state';

const mod = process.platform === 'darwin' ? '⌘' : 'Ctrl+';
const shift = process.platform === 'darwin' ? '⇧' : 'Shift+';
const alt = process.platform === 'darwin' ? '⌥' : 'Alt+';
export const keys = { mod, shift, alt };

export function appMenu(opts: { zoom: number; isPrivate: boolean; fullscreen: boolean }): MenuItem[] {
  const closed = recentlyClosed().slice(0, 8);
  return [
    { id: 'new-tab', label: 'New tab', icon: 'plus', shortcut: `${mod}T` },
    { id: 'new-window', label: 'New window', icon: 'app-window', shortcut: `${mod}N` },
    { id: 'new-private', label: 'New private window', icon: 'venetian-mask', shortcut: `${mod}${shift}N` },
    { separator: true },
    {
      row: [
        { id: 'zoom-out', icon: 'minus', label: 'Zoom out' },
        { id: 'zoom-reset', label: `${Math.round(opts.zoom * 100)}%` },
        { id: 'zoom-in', icon: 'plus', label: 'Zoom in' },
        { id: 'fullscreen', icon: opts.fullscreen ? 'minimize' : 'maximize', label: 'Full screen' },
      ],
      label: 'Zoom',
    },
    { separator: true },
    { id: 'history', label: 'History', icon: 'history', shortcut: `${mod}H` },
    {
      id: 'recent',
      label: 'Recently closed',
      icon: 'rotate-ccw',
      disabled: closed.length === 0,
      submenu: closed.map((t, i) => ({ id: `closed:${i}`, label: t.title || t.url, favicon: undefined })),
    },
    { id: 'downloads', label: 'Downloads', icon: 'download', shortcut: `${mod}J` },
    { id: 'bookmarks', label: 'Bookmarks', icon: 'bookmark', shortcut: `${mod}${shift}O` },
    { separator: true },
    { id: 'find', label: 'Find in page…', icon: 'search', shortcut: `${mod}F` },
    { id: 'print', label: 'Print…', icon: 'printer', shortcut: `${mod}P` },
    {
      id: 'more-tools',
      label: 'More tools',
      icon: 'wrench',
      submenu: [
        { id: 'save-page', label: 'Save page as…', shortcut: `${mod}S` },
        { id: 'view-source', label: 'View page source', shortcut: `${mod}U` },
        { id: 'devtools', label: 'Developer tools', shortcut: process.platform === 'darwin' ? '⌥⌘I' : 'F12' },
        { separator: true },
        { id: 'clear-data', label: 'Clear browsing data…', shortcut: `${mod}${shift}Del` },
        { id: 'task-info', label: 'Performance & memory' },
      ],
    },
    { separator: true },
    { id: 'settings', label: 'Settings', icon: 'settings', shortcut: `${mod},` },
    { id: 'about', label: 'About Rye', icon: 'info' },
    ...(opts.isPrivate ? [] : [{ separator: true }, { id: 'quit', label: 'Quit Rye', icon: 'power', shortcut: process.platform === 'darwin' ? '⌘Q' : `${mod}${shift}Q` }]),
  ];
}

export function tabMenu(opts: { pinned: boolean; muted: boolean; audible: boolean; hasOthers: boolean; hasRight: boolean; canReopen: boolean; vertical: boolean }): MenuItem[] {
  return [
    { id: 'new-right', label: opts.vertical ? 'New tab below' : 'New tab to the right', icon: 'plus' },
    { separator: true },
    { id: 'reload', label: 'Reload', icon: 'rotate-cw', shortcut: `${mod}R` },
    { id: 'duplicate', label: 'Duplicate', icon: 'copy' },
    { id: 'pin', label: opts.pinned ? 'Unpin' : 'Pin', icon: opts.pinned ? 'pin-off' : 'pin' },
    { id: 'mute', label: opts.muted ? 'Unmute site' : 'Mute site', icon: opts.muted ? 'volume-2' : 'volume-x' },
    { id: 'copy-url', label: 'Copy link', icon: 'link' },
    { id: 'bookmark', label: 'Bookmark tab…', icon: 'star' },
    { separator: true },
    { id: 'close', label: 'Close', icon: 'x', shortcut: `${mod}W` },
    { id: 'close-others', label: 'Close other tabs', disabled: !opts.hasOthers },
    { id: 'close-right', label: opts.vertical ? 'Close tabs below' : 'Close tabs to the right', disabled: !opts.hasRight },
    { separator: true },
    { id: 'reopen', label: 'Reopen closed tab', icon: 'rotate-ccw', shortcut: `${mod}${shift}T`, disabled: !opts.canReopen },
  ];
}

export function stripMenu(opts: { canReopen: boolean; vertical: boolean }): MenuItem[] {
  return [
    { id: 'new-tab', label: 'New tab', icon: 'plus', shortcut: `${mod}T` },
    { id: 'reopen', label: 'Reopen closed tab', icon: 'rotate-ccw', shortcut: `${mod}${shift}T`, disabled: !opts.canReopen },
    { separator: true },
    { id: 'layout', label: opts.vertical ? 'Move tabs to the top' : 'Move tabs to the side', icon: opts.vertical ? 'panel-top' : 'panel-left' },
    { id: 'customize', label: 'Customize appearance…', icon: 'palette' },
  ];
}

const TOOLBAR_LABELS: Record<ToolbarButton, string> = {
  home: 'Home',
  bookmarks: 'Bookmarks',
  history: 'History',
  downloads: 'Downloads (always visible)',
  private: 'New private window',
};

export function toolbarMenu(): MenuItem[] {
  const a = settings.get().appearance;
  return [
    { header: 'Show in toolbar' },
    ...(Object.keys(TOOLBAR_LABELS) as ToolbarButton[]).map((b) => ({ id: `tb:${b}`, label: TOOLBAR_LABELS[b], checked: a.toolbarButtons.includes(b) })),
    { separator: true },
    { header: 'Bookmarks bar' },
    { id: 'bb:always', label: 'Always', checked: a.bookmarksBar === 'always' },
    { id: 'bb:newtab', label: 'On new tab only', checked: a.bookmarksBar === 'newtab' },
    { id: 'bb:never', label: 'Never', checked: a.bookmarksBar === 'never' },
    { separator: true },
    { id: 'customize', label: 'Customize appearance…', icon: 'palette' },
  ];
}

export function inputMenu(opts: { hasSelection: boolean; canPaste: boolean; clipboardText: string }): MenuItem[] {
  const looksUrl = opts.clipboardText && !/\s/.test(opts.clipboardText.trim()) && /\.|:/.test(opts.clipboardText);
  return [
    { id: 'undo', label: 'Undo', shortcut: `${mod}Z` },
    { separator: true },
    { id: 'cut', label: 'Cut', shortcut: `${mod}X`, disabled: !opts.hasSelection },
    { id: 'copy', label: 'Copy', shortcut: `${mod}C`, disabled: !opts.hasSelection },
    { id: 'paste', label: 'Paste', shortcut: `${mod}V`, disabled: !opts.canPaste },
    { id: 'paste-go', label: looksUrl ? 'Paste and go' : 'Paste and search', disabled: !opts.canPaste, icon: 'corner-down-left' },
    { separator: true },
    { id: 'select-all', label: 'Select all', shortcut: `${mod}A` },
  ];
}

export function historyMenu(entries: { title: string; url: string; index: number }[]): MenuItem[] {
  return [
    ...entries.map((e) => ({ id: `go:${e.index}`, label: e.title || e.url, favicon: e.url })),
    { separator: true },
    { id: 'show-history', label: 'Show full history', icon: 'history', shortcut: `${mod}H` },
  ];
}

export function folderMenu(folderId: string): MenuItem[] {
  const kids = bookmarks.children(folderId);
  const build = (id: string, depth: number): MenuItem[] =>
    bookmarks.children(id).map((b) =>
      b.type === 'folder'
        ? { id: `folder:${b.id}`, label: b.title, icon: 'folder', submenu: depth < 6 ? withOpenAll(b.id, build(b.id, depth + 1)) : [] }
        : { id: `bm:${b.id}`, label: b.title || b.url, favicon: b.url },
    );
  if (!kids.length) return [{ label: 'This folder is empty', disabled: true }];
  return withOpenAll(folderId, build(folderId, 0));
}

function withOpenAll(folderId: string, items: MenuItem[]): MenuItem[] {
  const urls = bookmarks.children(folderId).filter((b) => b.type === 'bookmark');
  if (urls.length < 2) return items.length ? items : [{ label: 'Empty', disabled: true }];
  return [...items, { separator: true }, { id: `openall:${folderId}`, label: `Open all (${urls.length})`, icon: 'layers' }];
}

export function bookmarkItemMenu(isFolder: boolean): MenuItem[] {
  return [
    ...(isFolder
      ? [{ id: 'open-all', label: 'Open all', icon: 'layers' }]
      : [
          { id: 'open-new', label: 'Open in new tab', icon: 'plus' },
          { id: 'open-window', label: 'Open in new window', icon: 'app-window' },
          { id: 'open-private', label: 'Open in private window', icon: 'venetian-mask' },
        ]),
    { separator: true },
    { id: 'edit', label: 'Edit…', icon: 'pencil' },
    { id: 'delete', label: 'Delete', icon: 'trash-2', danger: true },
    { separator: true },
    { id: 'manager', label: 'Bookmark manager', icon: 'bookmark', shortcut: `${mod}${shift}O` },
  ];
}

export function pageMenu(p: ContextMenuParams, opts: { canBack: boolean; canForward: boolean; engineName: string; isPrivate: boolean; internal: boolean }): MenuItem[] {
  const items: MenuItem[] = [];
  const sep = () => items.length && !items[items.length - 1].separator && items.push({ separator: true });

  if (p.linkURL) {
    items.push(
      { id: 'link-tab', label: 'Open link in new tab', icon: 'plus' },
      { id: 'link-window', label: 'Open link in new window', icon: 'app-window' },
      ...(opts.isPrivate ? [] : [{ id: 'link-private', label: 'Open link in private window', icon: 'venetian-mask' }]),
      { id: 'link-copy', label: 'Copy link address', icon: 'link' },
      ...(p.linkURL.startsWith('http') ? [{ id: 'link-save', label: 'Save link as…', icon: 'download' }] : []),
    );
  }
  if (p.mediaType === 'image' && p.srcURL) {
    sep();
    items.push(
      { id: 'img-tab', label: 'Open image in new tab', icon: 'image' },
      { id: 'img-save', label: 'Save image as…', icon: 'download' },
      { id: 'img-copy', label: 'Copy image', icon: 'copy' },
      { id: 'img-copy-url', label: 'Copy image address', icon: 'link' },
    );
  }
  if ((p.mediaType === 'video' || p.mediaType === 'audio') && p.srcURL) {
    sep();
    items.push(
      { id: 'media-toggle', label: p.mediaFlags.isPaused ? 'Play' : 'Pause', icon: p.mediaFlags.isPaused ? 'play' : 'pause' },
      { id: 'media-loop', label: 'Loop', checked: p.mediaFlags.isLooping },
      { id: 'media-controls', label: 'Show controls', checked: p.mediaFlags.isControlsVisible },
      ...(p.mediaType === 'video' && p.mediaFlags.canShowPictureInPicture ? [{ id: 'media-pip', label: 'Picture in picture', icon: 'picture-in-picture-2' }] : []),
      { id: 'media-save', label: `Save ${p.mediaType} as…`, icon: 'download' },
    );
  }
  if (p.isEditable) {
    sep();
    if (p.misspelledWord) {
      const sug = p.dictionarySuggestions.slice(0, 4);
      items.push(...(sug.length ? sug.map((s) => ({ id: `spell:${s}`, label: s, icon: 'sparkles' })) : [{ label: 'No spelling suggestions', disabled: true }]));
      items.push({ id: 'spell-add', label: 'Add to dictionary', icon: 'book-plus' }, { separator: true });
    }
    const f = p.editFlags;
    items.push(
      { id: 'undo', label: 'Undo', shortcut: `${mod}Z`, disabled: !f.canUndo },
      { id: 'redo', label: 'Redo', shortcut: process.platform === 'darwin' ? '⇧⌘Z' : `${mod}Y`, disabled: !f.canRedo },
      { separator: true },
      { id: 'cut', label: 'Cut', shortcut: `${mod}X`, disabled: !f.canCut },
      { id: 'copy', label: 'Copy', shortcut: `${mod}C`, disabled: !f.canCopy },
      { id: 'paste', label: 'Paste', shortcut: `${mod}V`, disabled: !f.canPaste },
      { id: 'paste-plain', label: 'Paste as plain text', shortcut: `${mod}${shift}V`, disabled: !f.canPaste },
      { id: 'select-all', label: 'Select all', shortcut: `${mod}A`, disabled: !f.canSelectAll },
    );
  } else if (p.selectionText.trim()) {
    sep();
    const text = p.selectionText.trim().replace(/\s+/g, ' ');
    const short = text.length > 28 ? `${text.slice(0, 26)}…` : text;
    items.push({ id: 'copy', label: 'Copy', icon: 'copy', shortcut: `${mod}C` }, { id: 'search-selection', label: `Search ${opts.engineName} for “${short}”`, icon: 'search' });
  }
  if (!items.length) {
    items.push(
      { id: 'back', label: 'Back', icon: 'arrow-left', shortcut: `${alt}←`, disabled: !opts.canBack },
      { id: 'forward', label: 'Forward', icon: 'arrow-right', shortcut: `${alt}→`, disabled: !opts.canForward },
      { id: 'reload', label: 'Reload', icon: 'rotate-cw', shortcut: `${mod}R` },
      { separator: true },
      ...(opts.internal
        ? []
        : [
            { id: 'bookmark', label: 'Bookmark this page…', icon: 'star', shortcut: `${mod}D` },
            { id: 'save-page', label: 'Save page as…', icon: 'download', shortcut: `${mod}S` },
          ]),
      { id: 'print', label: 'Print…', icon: 'printer', shortcut: `${mod}P` },
      ...(opts.internal ? [] : [{ id: 'view-source', label: 'View page source', icon: 'code', shortcut: `${mod}U` }]),
    );
  }
  sep();
  items.push({ id: 'inspect', label: 'Inspect', icon: 'scan-search' });
  return items;
}
