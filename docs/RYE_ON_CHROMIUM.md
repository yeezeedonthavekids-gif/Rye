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

### Step 1: theme and new tab page (no rebuild needed)

`chromium/extensions/` holds three add-ons you load from a folder:

- `rye-theme`: Rye's warm light colors for the frame, tabs, toolbar and address bar.
- `rye-theme-dark`: the warm dark version. Use one theme at a time.
- `rye-newtab`: Rye's new tab page, with search, shortcuts, and an optional
  clock, date and most-visited list, plus a Customize panel for backgrounds.

To install:
1. In Rye, open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose `C:\src\rye\chromium\extensions\rye-theme`.
3. Click **Load unpacked** again and choose `C:\src\rye\chromium\extensions\rye-newtab`.

To update after changes: run `git pull` in `C:\src\rye`, then click the reload
arrow on each add-on in `chrome://extensions`.

Later these will be built into Rye as defaults, so installer users get them
automatically.

### Next steps

Changes that need C++ in Chromium itself, each as a separate patch you can build
and try:

- **Shape and spacing:** the rounded tabs, address capsule and floating page sheet
  come from Chromium's layout constants and the views for the tab strip, toolbar
  and page area.
- **Defaults:** Rye's search engine, privacy settings and the add-ons above as
  built-ins.
- **Features:** download ETAs, the sliding tab indicator, and other details.

---

## What stays the same

The current Electron version of Rye in this repository keeps working while this
happens. Nothing here changes it.
