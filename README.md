# Rye

A calm, quick browser you make your own. Rye is built from Chromium's source,
the same foundation as Chrome, Edge and Brave, so sites, extensions and Google
sign-in work like they do in Chrome. On top of that it has its own look,
personal new tab page, and lighter defaults.

## Download

Every file on the [Rye 1.0 release](../../releases/tag/v1.0.0) has been tested
on each device it supports.

| Device | File | Tested on |
| --- | --- | --- |
| Windows 10/11 | **Rye-1.0-Setup.exe** | Windows 11 PC |
| Android 8+ (arm64) | **Rye-1.0-Android.apk** | MuMu Player |
| iPhone and iPad | **Rye-1.0-iPhone.ipa** | LiveContainer |

**Windows.** Run the installer. It installs for your user account only, in
`%LOCALAPPDATA%\Rye`, with its own Start menu entry. The installer isn't
code-signed yet, so Windows may show "Windows protected your PC". Choose
**More info → Run anyway**.

**Android.** Download the APK on your phone and open it. Allow installs from
your browser or file manager when Android asks. The Android app uses Firefox's
engine (GeckoView), so it's larger than the iPhone app.

**iPhone and iPad.** The app isn't signed, so install it with a sideloading
app such as LiveContainer, AltStore or SideStore, which signs it on your phone.
It uses Safari's engine, like every iPhone browser.

The phone apps have Rye's new tab page, setup, Personalize and looks, with
tabs and a bottom address bar.

## What's different from Chromium

**Your look, everywhere.** Seven looks (Rye, Midnight, Lavender, Ocean, Forest,
Sunset and Soft Light), in light, dark or matching Windows. Each one recolors
the whole browser: tabs, toolbar, address bar, menus, dialogs and settings
pages. You can pick any accent color, or go monochrome.

**One corner style.** Soft, Rounded or Extra round, applied to tabs, the
address bar, menus, dialogs and the page, which floats as a rounded sheet
inside the window.

**A new tab page that's yours.**
- A different greeting each time, in a serif face, using your name.
- Search with your choice of engine.
- Shortcuts with each site's real icon, your own images and colors, drag to
  reorder, and collections.
- Optional: a note for today, a dateline and clock, bookmarks, recently and
  most visited sites.
- Backgrounds: flat artwork and textures, a solid color, or your own photo.

**Setup and Personalize.** A five-step setup on first launch: your name, a look
and a few preferences. Everything can be changed later in **Personalize**
(Customize → All personalization settings), which has a live preview.
Personalize also has:
- separate profiles, each with its own name, look and new tab page
- appearance export and import
- reset buttons and undo

**Lighter by default.**
- Memory Saver is on.
- Page preloading is off.
- There are no background downloads of Google's optimization or on-device AI
  models.
- Tab hover cards don't keep screenshots.
- The address bar's AI Mode and Lens buttons are hidden.

In a side-by-side test with YouTube and a Wikipedia article open, Rye used
685 MB of private memory, against 1,573 MB for Helium. Your numbers will vary.

## How it works

Rye isn't a fork kept in a separate tree. It's a small set of edits that
`chromium/apply_rye.py` applies to a Chromium checkout:

| Area | Files in Chromium | What changes |
| --- | --- | --- |
| Name and icons | `chrome/app/…` (via `apply_branding.py`) | Product name, every string, all icons |
| Colors | `ui/color/chrome_color_mixers.cc` | Rye's palette, computed from a surface tint, an accent and light/dark |
| Settings | `themes/theme_service.cc`, `settings_private/prefs_util.cc` | New `rye.shape` and `rye.surface_color` prefs, which Rye's pages may set |
| Shape | `layout_constants.cc`, `tab_style.cc`, `chrome_layout_provider.cc`, `multi_contents_view.cc` | Corner style; the floating page |
| New tab page | `component_loader.cc`, `ntp_features.cc` | Rye's pages built in as a component extension |
| Lighter defaults | optimization guide, Memory Saver, preloading, hover cards, omnibox | Background work off by default |
| Installer | `chromium_install_modes.h`, `chrome.release` | Installs as Rye; ships Rye's pages |

Rye's own pages are in [`chromium/extensions/rye-newtab`](chromium/extensions/rye-newtab):

| File | What it is |
| --- | --- |
| `core.js` | Settings and their validation, presets, the palette (it mirrors the C++), greetings, export/import, and the bridge to browser settings |
| `newtab.*` | The new tab page and its Customize panel |
| `onboarding.js` | The first-launch setup |
| `personalize.*` | The Personalize page |
| `rye.css` | The shared design system |

Pages and browser stay in sync because the pages write Chromium's own prefs
through `chrome.settingsPrivate`. These are the accent, light/dark, grayscale,
bookmarks bar and vertical tabs, plus Rye's two prefs. The browser's color
code reads those same prefs.

## Privacy

- No Rye telemetry. Everything Rye's pages store (your name, shortcuts, photo,
  settings) stays on your computer.
- Site icons for shortcuts come from the site itself. They're fetched only for
  shortcuts you add, and remembered so they aren't requested again.
- Background model downloads and page preloading are off.

## Limitations

- **No automatic updates yet.** Install new releases by hand.
- **Unsigned installer.** Windows SmartScreen will warn on first run.
- **Media:** like other Chromium builds, there's no Widevine, so Netflix and
  other DRM video won't play. Some H.264/AAC video may not play either; YouTube
  works.
- **"Sign in to Chrome" sync** needs Google's private API keys, so it isn't
  available. Signing in to Google websites works normally.
- **Rye profiles** in Personalize keep their own look and new tab page but
  share history, passwords and cookies. For fully separate browsing, use
  Chromium's own profiles.
- **Corner style:** some parts of windows that are already open update after a
  restart.
- **Phone apps** don't have extensions, bookmarks or sync yet.

## The Electron version

Rye started as an Electron app, which is still in `src/` (`npm install`,
`npm start`). Google treats Electron apps as embedded browsers and blocks
sign-in, which is why Rye moved to Chromium. The Electron version is no longer
the main one.
