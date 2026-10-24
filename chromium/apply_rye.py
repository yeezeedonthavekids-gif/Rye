#!/usr/bin/env python3
"""Turn a Chromium checkout into Rye: branding plus Rye's built-in look.

Usage (from any folder, with depot_tools' python3):
    python3 apply_rye.py C:\\src\\chromium\\src           apply everything
    python3 apply_rye.py C:\\src\\chromium\\src --check   show what would change

What it does:
  1. Runs apply_branding.py (name, strings, icons).
  2. Builds Rye's new tab page and dark theme into the browser as component
     extensions: always on, nothing to install, hidden from chrome://extensions.
  3. Makes the theme a default: it applies on a fresh profile and whenever the
     user is on the default theme, but never replaces a theme the user picked.
  4. Copies the extension files next to chrome.dll (out\\Rye\\rye_extensions)
     and adds them to the installer.

Every edit is marked "Rye:" and is skipped if already present, so the script
is safe to re-run after `git pull`. To undo the code changes, run in the
checkout:
    git checkout -- chrome/browser/extensions/component_loader.cc chrome/browser/themes/theme_service.cc chrome/installer/mini_installer/chrome.release
"""
import json
import os
import shutil
import sys

import apply_branding

HERE = os.path.dirname(os.path.abspath(__file__))
EXTENSIONS = os.path.join(HERE, 'extensions')
# (folder in this repo, folder name next to chrome.dll)
BUNDLED = [('rye-newtab', 'newtab'), ('rye-theme-dark', 'theme')]
MARK = 'Rye:'


class PatchError(Exception):
    pass


def manifest_literal(folder):
    """The extension's manifest, compacted, as a C++ raw string literal."""
    with open(os.path.join(EXTENSIONS, folder, 'manifest.json'), encoding='utf-8') as f:
        text = json.dumps(json.load(f), separators=(',', ':'), ensure_ascii=True)
    if ')RYE_JSON' in text:
        raise PatchError(f'{folder}/manifest.json contains the literal delimiter')
    return f'R"RYE_JSON({text})RYE_JSON"'


def insert_once(text, anchor, addition, where='after'):
    if text.count(anchor) != 1:
        raise PatchError(f'expected exactly one match for:\n{anchor}')
    if where == 'after':
        return text.replace(anchor, anchor + addition)
    return text.replace(anchor, addition + anchor)


def drop_previous(text, begin, end):
    """Remove a block written by an earlier run, so manifests stay current."""
    start = text.find(begin)
    if start < 0:
        return text
    stop = text.index(end, start) + len(end)
    while text.startswith('\n', stop):
        stop += 1
    return text[:start] + text[stop:]


# ─── chrome/browser/extensions/component_loader.cc ──────────────────────────

LOADER_CONSTANTS_BEGIN = '// Rye: manifests of the built-in extensions'
LOADER_CONSTANTS_END = '// Rye: end of manifests.\n'


def patch_component_loader(text):
    text = drop_previous(text, LOADER_CONSTANTS_BEGIN, LOADER_CONSTANTS_END)
    constants = (
        f'{LOADER_CONSTANTS_BEGIN}, written by apply_rye.py from\n'
        '// chromium/extensions in the Rye repository. The files themselves live in\n'
        '// rye_extensions/ next to chrome.dll.\n'
        'namespace {\n'
        f'constexpr char kRyeNewTabManifest[] = {manifest_literal("rye-newtab")};\n'
        f'constexpr char kRyeThemeManifest[] = {manifest_literal("rye-theme-dark")};\n'
        '}  // namespace\n'
        f'{LOADER_CONSTANTS_END}\n'
    )
    text = insert_once(text, 'void ComponentLoader::AddDefaultComponentExtensions(\n',
                       constants, where='before')

    if 'Rye: built-in new tab page and theme' not in text:
        text = insert_once(
            text,
            '  if (!skip_session_components) {\n    AddWebStoreApp();\n',
            '    // Rye: built-in new tab page and theme.\n'
            '    base::FilePath rye_dir;\n'
            '    if (base::PathService::Get(base::DIR_MODULE, &rye_dir)) {\n'
            '      rye_dir = rye_dir.AppendASCII("rye_extensions");\n'
            '      Add(std::string_view(kRyeNewTabManifest),\n'
            '          rye_dir.AppendASCII("newtab"), /*skip_allowlist=*/true);\n'
            '      Add(std::string_view(kRyeThemeManifest),\n'
            '          rye_dir.AppendASCII("theme"), /*skip_allowlist=*/true);\n'
            '    }\n')

    if '#include "base/base_paths.h"' not in text:  # path_service.h may pull it in
        text = insert_once(text, '#include "base/path_service.h"\n',
                           '#include "base/base_paths.h"  // Rye\n', where='before')
    return text


# ─── chrome/browser/themes/theme_service.cc ─────────────────────────────────

def patch_theme_service(text):
    # A built-in (component) theme loads on every start. Only let it take over
    # while the user is on the default theme, or it's already the current one.
    if 'Rye: the built-in theme only' not in text:
        text = insert_once(
            text,
            '    if (!extension->is_theme() || theme_service_->UsingPolicyTheme()) {\n'
            '      return;\n'
            '    }\n',
            '\n'
            '    // Rye: the built-in theme only fills in for the default theme; it never\n'
            '    // replaces a theme or color the user picked.\n'
            '    if (extensions::Manifest::IsComponentLocation(extension->location()) &&\n'
            '        theme_service_->GetThemeID() != ThemeHelper::kDefaultThemeID &&\n'
            '        theme_service_->GetThemeID() != extension->id()) {\n'
            '      return;\n'
            '    }\n')

    # The extension system may finish loading before ThemeService starts
    # watching it, so also check once it's ready.
    if 'Rye: apply the built-in theme' not in text:
        text = insert_once(
            text,
            'void ThemeService::OnExtensionServiceReady() {\n'
            '  if (!ready_) {\n'
            '    // If the ThemeService is not ready yet, the custom theme data pack needs to\n'
            '    // be recreated from the extension.\n'
            '    MigrateTheme();\n'
            '    set_ready();\n'
            '  }\n',
            '\n'
            '  // Rye: apply the built-in theme while the user is on the default theme.\n'
            '  if (GetThemeID() == ThemeHelper::kDefaultThemeID && !UsingPolicyTheme()) {\n'
            '    for (const auto& extension :\n'
            '         extensions::ExtensionRegistry::Get(profile_)->enabled_extensions()) {\n'
            '      if (extension->is_theme() &&\n'
            '          extensions::Manifest::IsComponentLocation(extension->location())) {\n'
            '        DoSetTheme(extension.get(), /*suppress_infobar=*/true);\n'
            '        break;\n'
            '      }\n'
            '    }\n'
            '  }\n')

    # Unused themes get uninstalled after startup; the built-in one stays.
    if 'Rye: keep the built-in theme' not in text:
        text = insert_once(
            text,
            '    if (extension->is_theme() && extension->id() != current_theme &&\n',
            '    // Rye: keep the built-in theme installed.\n'
            '    if (extensions::Manifest::IsComponentLocation(extension->location())) {\n'
            '      continue;\n'
            '    }\n',
            where='before')
    return text


# ─── chrome/installer/mini_installer/chrome.release ─────────────────────────

def patch_release(text):
    if 'rye_extensions' in text:
        return text
    lines = ['#', '# Rye: built-in extensions, next to chrome.dll.', '#']
    for _, name in BUNDLED:
        for sub in sorted(bundle_dirs(name)):
            src = '\\'.join(['rye_extensions', name] + ([sub] if sub else []))
            lines.append(f'{src}\\*.*: %(VersionDir)s\\{src}\\')
    block = '\n'.join(lines) + '\n'
    anchor = 'locales\\*.pak: %(VersionDir)s\\Locales\n'
    return insert_once(text, anchor, block)


def bundle_dirs(name):
    """Subfolders (relative, '' for the top) of a bundled extension."""
    folder = dict((n, f) for f, n in BUNDLED)[name]
    root = os.path.join(EXTENSIONS, folder)
    out = set()
    for dirpath, _, files in os.walk(root):
        if any(f != 'Cached Theme.pak' for f in files):
            rel = os.path.relpath(dirpath, root)
            out.add('' if rel == '.' else rel.replace(os.sep, '\\'))
    return out


def copy_extensions(out_dir, check):
    dest_root = os.path.join(out_dir, 'rye_extensions')
    if check:
        print(f'would copy extensions to {dest_root}')
        return
    for folder, name in BUNDLED:
        dest = os.path.join(dest_root, name)
        if os.path.isdir(dest):
            shutil.rmtree(dest)
        shutil.copytree(os.path.join(EXTENSIONS, folder), dest,
                        ignore=shutil.ignore_patterns('Cached Theme.pak', '.gitignore'))
    print(f'copied extensions to {dest_root}')


PATCHES = [
    ('chrome/browser/extensions/component_loader.cc', patch_component_loader),
    ('chrome/browser/themes/theme_service.cc', patch_theme_service),
    ('chrome/installer/mini_installer/chrome.release', patch_release),
]


def main(argv):
    args = [a for a in argv[1:] if not a.startswith('--')]
    check = '--check' in argv
    if len(args) != 1:
        print(__doc__)
        return 2
    src = os.path.abspath(args[0])
    if not os.path.isfile(os.path.join(src, 'chrome', 'VERSION')):
        print(f'{src} does not look like a Chromium src folder')
        return 2

    status = apply_branding.main([argv[0], src] + (['--check'] if check else []))
    if status:
        return status

    failed = False
    for rel, patch in PATCHES:
        path = os.path.join(src, *rel.split('/'))
        with open(path, encoding='utf-8', newline='') as f:
            before = f.read()
        crlf = '\r\n' in before
        try:
            after = patch(before.replace('\r\n', '\n'))
        except PatchError as e:
            print(f'FAILED {rel}: {e}')
            failed = True
            continue
        if crlf:
            after = after.replace('\n', '\r\n')
        if after == before:
            print(f'up to date {rel}')
        elif check:
            print(f'would patch {rel}')
        else:
            with open(path, 'w', encoding='utf-8', newline='') as f:
                f.write(after)
            print(f'patched {rel}')
    if failed:
        print('\nSome files did not match. Paste this output to get an updated script.')
        return 1

    copy_extensions(os.path.join(src, 'out', 'Rye'), check)
    print('\nDone. Now rebuild: autoninja -C out\\Rye chrome')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
