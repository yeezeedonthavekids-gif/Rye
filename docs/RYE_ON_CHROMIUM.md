# Rye on Chromium

Rye currently runs on Electron, which Google treats as an embedded browser and blocks
from signing in. Chrome, Edge, Brave and Opera don't have this problem because they
are compiled from Chromium's own source. This guide moves Rye onto that same
foundation, in phases. Each phase ends with something you can run.

The requirements below come from Chromium's official Windows build instructions
(`docs/windows_build_instructions.md` in the Chromium source). If a step fails,
check that page first; versions move over time.

---

## Phase 1 — Build stock Chromium and confirm Google sign-in

Goal: a `chrome.exe` you built yourself that can sign in to Google. Nothing is
Rye-specific yet. This proves the toolchain works before we change anything.

**Budget:** about 100 GB of free space on an NTFS SSD, 1–2 hours to download, and
1–6 hours for the first build, depending on your CPU. Later builds only recompile
what changed.

### 1. Install the tools

1. **Visual Studio 2026** (Community is fine). Run the installer from a command
   prompt so the right parts are included:

   ```
   PATH_TO_INSTALLER.EXE ^
   --add Microsoft.VisualStudio.Workload.NativeDesktop ^
   --add Microsoft.VisualStudio.Component.VC.ATLMFC ^
   --includeRecommended
   ```

2. **Windows 11 SDK 10.0.28000** plus **Debugging Tools for Windows**
   (10.0.26100.3323 or newer). If the debugging tools are missing: Control Panel →
   Programs and Features → Windows Software Development Kit → Change → tick
   *Debugging Tools for Windows*.

3. **Git for Windows** from https://git-scm.com/download/win.

4. **depot_tools** (Google's build tools). Open **cmd.exe**, not PowerShell:

   ```
   mkdir C:\src
   cd C:\src
   git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
   ```

   Then, in System Properties → Environment Variables:
   - Put `C:\src\depot_tools` at the **front** of `PATH`.
   - Add a new variable `DEPOT_TOOLS_WIN_TOOLCHAIN` = `0`.

   Open a **new** cmd.exe and run `gclient` once. It installs Python and other tools.
   Then check that `where python3` lists depot_tools' `python3.bat` first. If it
   doesn't, turn off the `python.exe` and `python3.exe` entries under Settings →
   Apps → Advanced app settings → App execution aliases.

5. **Git settings** (once):

   ```
   git config --global core.autocrlf false
   git config --global core.filemode false
   git config --global core.preloadindex true
   git config --global core.fscache true
   git config --global core.longpaths true
   git config --global branch.autosetuprebase always
   ```

6. **Speed and reliability tweaks:**
   - Add `C:\src\chromium` to Windows Defender's exclusions (Windows Security →
     Virus & threat protection → Exclusions). This is the most common cause of slow builds.
   - Set the PC to never sleep while downloading and building.

### 2. Download Chromium

In cmd.exe:

```
mkdir C:\src\chromium
cd C:\src\chromium
fetch --no-history chromium
cd src
```

`--no-history` skips the full Git history and saves a lot of time and disk. If it
stops partway, run `gclient sync` from `C:\src\chromium\src` to resume.

### 3. Configure and build

```
gn gen out\Rye --args="is_debug=false is_component_build=true symbol_level=0 blink_symbol_level=0 v8_symbol_level=0"
autoninja -C out\Rye chrome
```

**With 16 GB of RAM or less:** linking can run out of memory near the end.
- Set a fixed page file of 32 GB (32768 MB) on an SSD under System Properties →
  Advanced → Performance → Settings → Advanced → Virtual memory.
- If the build still fails with an out-of-memory error or the PC stalls, lower the
  parallel jobs and rerun: `autoninja -C out\Rye -j 8 chrome`. It resumes where it
  stopped.

**Using another drive:** you can put everything on a second SSD (for example
`D:\src` instead of `C:\src`). Keep the path free of spaces, update the `PATH`
entry for depot_tools, and exclude that folder from Defender instead.

### 4. Run it and test sign-in

```
out\Rye\chrome.exe
```

Go to https://accounts.google.com and sign in. This is the test that matters.
Signing in to Google **websites** (Gmail, YouTube, Drive) works in plain Chromium.
The browser-level "Sign in to Chrome" profile sync needs private Google API keys
and is reserved for Google's own builds, so Rye won't have it.

**Tell me when you reach this point**, including whether sign-in worked and how
long the build took. Errors are easiest to fix if you paste the last 30 or so
lines of output.

---

## Phase 2 — Turn Chromium into Rye (name and icons)

`chromium/apply_branding.py` changes the product name, every user-visible string,
in all languages, and the icons (taskbar, window, installer and Start tiles) to
Rye's. It only edits files that already exist, so it's safe to re-run, and
`git checkout -- chrome/app` in the Chromium checkout undoes all of it.

1. Get this repository onto your PC, anywhere outside the Chromium folder:

   ```
   cd C:\src
   git clone https://github.com/yeezeedonthavekids-gif/Rye.git rye
   cd rye
   git checkout claude/rye-browser
   ```

2. Preview, then apply:

   ```
   python3 C:\src\rye\chromium\apply_branding.py C:\src\chromium\src --check
   python3 C:\src\rye\chromium\apply_branding.py C:\src\chromium\src
   ```

3. Rebuild. Only the affected parts recompile, so this is much faster than the
   first build:

   ```
   cd C:\src\chromium\src
   autoninja -C out\Rye chrome
   out\Rye\chrome.exe
   ```

   The window, taskbar and "About" page should now say Rye, with Rye's icon.

4. Build the Windows installer:

   ```
   autoninja -C out\Rye mini_installer
   ```

   This produces `out\Rye\mini_installer.exe`. Running it installs Rye like any
   other app.

## Phase 3 — Rye's look and features

### Step 1: Rye's interface, built in

`chromium/apply_rye.py` does everything `apply_branding.py` does, and also
changes Chromium's own interface code, the way Brave and other browsers do.

**Colors.** Rye computes its palette inside Chromium's color pipeline
(`chrome_color_mixers.cc`) from three inputs: a surface tint, an accent and
light or dark. The frame, tabs, toolbar, address bar, menus, dialogs and
settings pages all follow it. The inputs are profile prefs:

| Setting | Pref |
| --- | --- |
| Surface tint (presets) | `rye.surface_color` (new, 0xRRGGBB, 0 = warm neutrals) |
| Accent | `browser.theme.user_color2` (Chromium's own) |
| Light / dark / system | `browser.theme.color_scheme2` |
| Monochrome | `browser.theme.is_grayscale2` |
| Corner style | `rye.shape` (new, 0 soft, 1 rounded, 2 extra round) |

An installed theme, high contrast and forced colors take precedence.

**Shape.** The page floats as a rounded sheet (square in fullscreen). Tabs,
the toolbar, address bar, menus, dialogs and fields follow the corner style.

**Rye's pages.** A built-in component extension (`extensions/rye-newtab`)
provides:

- a five-step first-launch setup (name, look, preferences), which also opens
  from Personalize → Backup and reset → Run setup again;
- the new tab page: greeting, search, note, shortcut collections, shortcuts
  with real icons, bookmarks, recent and most-visited lists, and a Customize
  panel;
- Personalize (`personalize.html`): identity, colors, layout, shape,
  background, motion, profiles, export/import and resets, with a live preview.

These pages change the browser's settings through `chrome.settingsPrivate`,
which `apply_rye.py` allows for the prefs above, the bookmarks bar and vertical
tabs. Chromium's own new-tab footer is turned off.

```
cd /d C:\src\rye
git pull
python3 C:\src\rye\chromium\apply_rye.py C:\src\chromium\src
cd /d C:\src\chromium\src
autoninja -C out\Rye chrome
```

Re-run it after every `git pull`. It patches each file fresh from Chromium's
original (read with `git show`) and only writes files whose contents change.
To undo all of it, run `git checkout -- chrome components` in
`C:\src\chromium\src`.

### Step 2: a lean release build

`out\\Rye` is a developer build: Chromium split into hundreds of libraries
(`is_component_build=true`) with debug checks on. It rebuilds quickly but uses
noticeably more memory. Browsers ship as a single library with the checks off:

```
cd /d C:\src\chromium\src
gn gen out\RyeLite --args="is_debug=false is_component_build=false dcheck_always_on=false symbol_level=0 blink_symbol_level=0 v8_symbol_level=0"
autoninja -C out\RyeLite -j 10 chrome
```

The first build takes as long as your very first one; later rebuilds are
incremental. `apply_rye.py` copies Rye's pages into every build folder.

Rye also turns off background work by default (`lean` in `apply_rye.py`):

- Memory Saver is on, so tabs you haven't used for a while give their memory
  back (chrome://settings/performance).
- Page preloading is off (chrome://settings/performance → Preload pages).
- Google's optimization hints, prediction models and on-device AI models are
  off.
- Tab hover cards don't keep screenshots of tabs.

### Next steps

Changes that need C++ in Chromium itself, each as a separate patch you can build
and try:

- **Tab shape:** Electron Rye's free-floating pill tabs, instead of Chromium's
  tabs that join the toolbar (`tab_style_views.cc`).
- **Defaults:** Rye's search engine and privacy settings.
- **Features:** download ETAs, the sliding tab indicator, and other details.

---

## What stays the same

The current Electron version of Rye in this repository keeps working while this
happens. Nothing here changes it.
