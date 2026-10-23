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

Rye's changes are kept as small patch files in this repository under `chromium/`,
applied on top of a pinned Chromium version. Brave and ungoogled-chromium work the
same way, and it keeps updating Chromium manageable.

This phase changes:
- **Product name:** `chrome/app/theme/chromium/BRANDING` and the product strings in
  `chrome/app/chromium_strings.grd` ("Chromium" → "Rye").
- **Icons:** `chrome/app/theme/chromium/` (the PNG logos and the Windows `.ico`),
  generated from `build/icon.svg` in this repo.
- **Installer:** `autoninja -C out\Rye mini_installer` produces
  `mini_installer.exe`, Rye's Windows installer.

I'll write these patches against the exact Chromium version you built in Phase 1.

## Phase 3 — Rye's look and features

Chromium's interface is written in C++ (the "Views" toolkit), not React, so Rye's
design is rebuilt there instead of copied over:

- **Colors and surfaces:** Rye's warm palette, accent and dark mode become
  Chromium color mixers, its equivalent of Rye's design tokens.
- **Shape and spacing:** the rounded tabs, address capsule and floating page sheet
  come from Chromium's layout constants and the views for the tab strip, toolbar
  and page area.
- **New tab page:** Rye's new tab page, including shortcuts, background and
  customize panel, ported as a built-in page.
- **Features:** download ETAs, the sliding tab indicator, and other details,
  reapplied one at a time.

Each item is a separate patch you can build and try. This is the long part of the
project, and we'll go through it in small steps.

---

## What stays the same

The current Electron version of Rye in this repository keeps working while this
happens. Nothing here changes it.
