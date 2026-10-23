# Rye

A soft, private, customizable desktop browser built on Chromium (via Electron).

## Run

```bash
npm install
npm start            # typecheck, build, launch
npm run dist:win     # Windows installer (NSIS) — run on Windows or in CI
npm run dist:linux   # Linux AppImage
```

`.github/workflows/build.yml` builds the Windows installer on a Windows runner.
Building NSIS from Linux needs Wine; without it, `electron-builder --win zip` still
produces a runnable `Rye.exe`.

Set `RYE_USER_DATA=<dir>` to use a separate profile and `RYE_DEBUG=1` to log startup
timing and memory.

## Architecture

```
src/main/       Electron main process — windows, tabs, sessions, persistence, IPC
  window.ts     A browser window: tabs, layout, overlay layer, popups, commands
  tab.ts        A tab: a WebContentsView created lazily, sleepable, crash/error aware
  sessions.ts   Storage partitions, permissions, GPC header, rye:// protocol
  settings.ts   Validated, persisted settings with change events
  …             history, bookmarks, downloads, permissions, suggestions, shortcuts
src/preload/    ui.ts (Rye's own UI) and page.ts (bridge exposed only on rye:// pages)
src/shared/     Types, defaults/presets, URL helpers and the design-token engine
src/renderer/
  chrome/       The browser frame: tabs, toolbar, address bar, bookmarks bar
  overlay/      Menus, popovers, suggestions, tooltips — drawn above the page
  pages/        rye://newtab, settings, history, bookmarks, downloads
  ui/           Shared components (toggle, segmented, select, icons…)
  styles/       base.css (design system) + one stylesheet per surface
```

Each window has three renderer documents: the **frame**, a transparent **overlay** view
for anything that must float above the page, and one view per **tab**. The frame reports
where the page sits; the main process positions the tab's view there with rounded
corners. Errors and crashes are drawn by the frame behind a hidden view, so the address
bar keeps the real URL.

## Design system

Everything visual comes from `src/shared/theme.ts`, which turns appearance settings into
CSS variables for the frame, the overlay and every internal page. It also sets the native
window colours, so a change in Settings reaches every surface at once.

- **Composition:** a warm "mat" (the frame) carries a few raised surfaces: the active
  tab, the address capsule, and the page, which floats as a rounded sheet. Depth comes
  from surface and shadow, not dividers.
- **Geometry:** one roundness value scales the whole radius ladder (`xs … xl`), so
  nested corners stay concentric.
- **Tokens:** tint (warm, neutral, cool), accent, density, tab shape and spacing, font,
  text size and motion all feed the same token set. Four presets (Minimal, Midnight,
  Soft Light, Frost) only change visual tokens.
- **Motion:** 110–260 ms transitions that follow the system reduce-motion setting.

## Privacy & security

- Pages run sandboxed with context isolation and no Node. The page preload exposes a bridge
  only on `rye://` pages, and the main process checks the sending frame on every call.
- Web content cannot navigate or frame `rye://` pages. `<webview>` is disabled.
- Rye's UI uses a separate, cookie-less partition.
- Private windows share an in-memory partition that is wiped when the last one closes.
  Their history isn't recorded, and their permissions are forgotten.
- No telemetry. Search suggestions from your engine are **off by default**.
- HTTPS-first for typed addresses (with an explicit HTTP fallback), and a Global
  Privacy Control header.

## Limitations

- Electron supports only part of the Chrome extension APIs. Unpacked extensions load,
  but toolbar popups and the Web Store don't work.
- There is no built-in ad or tracker blocking, no sync, and no Widevine, so some DRM
  video won't play.
- Clearing cookies and cache clears them entirely. The time range applies to history only.
