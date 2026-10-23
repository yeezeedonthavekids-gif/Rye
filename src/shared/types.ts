// Shared data shapes used by the main process, preloads and every renderer.

export type ThemeMode = 'system' | 'light' | 'dark';
export type Density = 'compact' | 'comfortable' | 'spacious';
export type Tint = 'warm' | 'neutral' | 'cool';
export type TabShape = 'soft' | 'pill' | 'quiet';
export type TabLayout = 'horizontal' | 'vertical';
export type UiFont = 'inter' | 'system' | 'rounded';
export type FontScale = 'small' | 'medium' | 'large';
export type Motion = 'full' | 'reduced' | 'off';
export type BookmarksBarMode = 'always' | 'newtab' | 'never';
export type StartupMode = 'newtab' | 'restore' | 'homepage';
export type ToolbarButton = 'home' | 'bookmarks' | 'history' | 'downloads' | 'private';

export interface AppearanceSettings {
  preset: string | null;
  theme: ThemeMode;
  accent: string;
  tint: Tint;
  density: Density;
  /** 0 – 100. Scales every corner radius in the design system. */
  roundness: number;
  tabShape: TabShape;
  /** 0 – 100. Gap between tabs. */
  tabSpacing: number;
  tabLayout: TabLayout;
  sidebarCollapsed: boolean;
  /** Page floats as an inset rounded sheet inside the frame (otherwise edge to edge). */
  floatingPage: boolean;
  font: UiFont;
  fontScale: FontScale;
  motion: Motion;
  bookmarksBar: BookmarksBarMode;
  toolbarButtons: ToolbarButton[];
}

export type NtpBackground =
  | { kind: 'theme' }
  | { kind: 'color'; value: string }
  | { kind: 'gradient'; value: string }
  | { kind: 'image'; file: string; dim: number };

export interface Shortcut {
  id: string;
  title: string;
  url: string;
  icon?: string;
}

export interface NewTabSettings {
  background: NtpBackground;
  showSearch: boolean;
  showShortcuts: boolean;
  showClock: boolean;
  showDate: boolean;
  showRecent: boolean;
  showBookmarks: boolean;
  shortcuts: Shortcut[];
}

export interface SearchEngine {
  id: string;
  name: string;
  keyword: string;
  url: string; // contains %s
  suggestUrl?: string; // contains %s, OpenSearch JSON format
  builtIn?: boolean;
}

export interface Settings {
  version: number;
  appearance: AppearanceSettings;
  newTab: NewTabSettings;
  general: {
    startup: StartupMode;
    homepage: string; // 'rye://newtab' or URL
    confirmQuitWithManyTabs: boolean;
  };
  tabs: {
    openLinksInBackground: boolean;
    closeWindowWithLastTab: boolean;
    showHoverPreviewTitles: boolean;
    sleepInactiveMinutes: number; // 0 = never
  };
  search: {
    engine: string;
    engines: SearchEngine[];
    suggestions: boolean; // sends typed text to the engine
    showHistorySuggestions: boolean;
    showBookmarkSuggestions: boolean;
    showTabSuggestions: boolean;
  };
  privacy: {
    sendGpc: boolean;
    clearOnExit: boolean;
    httpsFirst: boolean;
    saveHistory: boolean;
  };
  downloads: {
    askWhere: boolean;
    directory: string; // '' = system downloads folder
    openPanelOnStart: boolean;
  };
}

export interface TabState {
  id: number;
  url: string;
  title: string;
  favicon: string | null;
  loading: boolean;
  progress: number; // 0..1
  pinned: boolean;
  audible: boolean;
  muted: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  security: SecurityState;
  crashed: boolean;
  error: TabErrorInfo | null;
  sleeping: boolean;
  zoom: number; // factor, 1 = 100%
  internal: boolean;
  findActive: boolean;
}

export interface TabErrorInfo {
  code: number;
  description: string;
  url: string;
  upgraded: boolean;
}

export type SecurityState = 'secure' | 'insecure' | 'internal' | 'file' | 'error' | 'none';

export interface WindowState {
  windowId: number;
  private: boolean;
  tabs: TabState[];
  activeId: number;
  maximized: boolean;
  fullscreen: boolean;
  htmlFullscreen: boolean;
  platform: NodeJS.Platform | string;
  bookmarkedActive: boolean;
  downloads: DownloadSummary;
  canReopen: boolean;
}

export interface DownloadSummary {
  active: number;
  progress: number; // 0..1 across active downloads, -1 when unknown
  recent: number; // downloads finished since panel last opened
  eta: number; // seconds until all active downloads finish, -1 when unknown
}

export interface Bookmark {
  id: string;
  type: 'bookmark' | 'folder';
  title: string;
  url?: string;
  parentId: string | null;
  favicon?: string;
  created: number;
}

export interface BookmarkTree {
  barId: string;
  otherId: string;
  items: Bookmark[];
}

export interface HistoryVisit {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  time: number;
}

export interface DownloadEntry {
  id: string;
  url: string;
  filename: string;
  path: string;
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted' | 'paused';
  received: number;
  total: number;
  started: number;
  mime?: string;
  /** Smoothed bytes per second while downloading. */
  speed?: number;
}

export interface Suggestion {
  kind: 'search' | 'url' | 'history' | 'bookmark' | 'tab' | 'engine' | 'internal';
  title: string;
  url: string;
  detail?: string;
  favicon?: string;
  tabId?: number;
  engineId?: string;
}

/** A menu item rendered by the overlay layer. */
export interface MenuItem {
  id?: string;
  label?: string;
  icon?: string;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  header?: string;
  submenu?: MenuItem[];
  /** A compact row of inline buttons (e.g. zoom controls). */
  row?: MenuItem[];
  favicon?: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PopupKind = 'menu' | 'bookmark' | 'siteinfo' | 'downloads' | 'permission' | 'zoom' | 'confirm';

export interface PopupRequest {
  kind: PopupKind;
  anchor: Rect;
  /** Preferred side relative to the anchor. */
  placement?: 'below' | 'right' | 'point';
  data?: unknown;
  /** Context string passed back with actions. */
  context?: string;
}

export interface PermissionPrompt {
  id: number;
  origin: string;
  permission: string;
  label: string;
}

export interface SitePermission {
  origin: string;
  permission: string;
  decision: 'allow' | 'block';
}

export interface Insets {
  top: number;
  left: number;
  right: number;
  bottom: number;
  radius: number;
}

export interface ThemePayload {
  settings: Settings;
  dark: boolean;
  private: boolean;
  platform: string;
}
