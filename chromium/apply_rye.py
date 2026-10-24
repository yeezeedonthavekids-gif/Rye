#!/usr/bin/env python3
"""Turn a Chromium checkout into Rye: branding plus Rye's own interface.

Usage (from any folder, with depot_tools' python3):
    python3 apply_rye.py C:\\src\\chromium\\src           apply everything
    python3 apply_rye.py C:\\src\\chromium\\src --check   show what would change
    python3 apply_rye.py C:\\src\\chromium\\src --skip=float,colors
        leave out parts (colors, float, sizes, newtab), for tracking down problems

What it changes:
  1. Name, strings and icons (apply_branding.py).
  2. Colors: Rye's warm palette is built into Chromium's color pipeline, so the
     frame, tabs, toolbar, address bar, menus, dialogs and settings pages are
     Rye's by default, in light and dark. Picking a theme or color in
     Customize still works; Rye steps aside for it.
  3. Shape: the page floats as a rounded sheet inside the window (except in
     fullscreen), with no line under the toolbar, softer corners and a
     slightly more compact tab strip.
  4. New tab page: Rye's, built in as a component extension (not removable,
     not listed in chrome://extensions), copied next to chrome.dll and added
     to the installer.

Each file is patched fresh from Chromium's original (read with `git show`),
and only written when its contents change, so re-running after `git pull`
always gives the current version without rebuilding more than needed. To
undo everything, run in the checkout:
    git checkout -- chrome
"""
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import apply_branding  # noqa: E402  (lives next to this script)

EXTENSIONS = os.path.join(HERE, 'extensions')
# (folder in this repo, folder name in rye_extensions next to chrome.dll)
BUNDLED = [('rye-newtab', 'newtab')]
MARK = 'Rye:'

# Files an earlier version of this script patched but this one doesn't.
RETIRED = ['chrome/browser/themes/theme_service.cc']


class PatchError(Exception):
    pass


def replace_once(text, old, new):
    if text.count(old) != 1:
        raise PatchError(f'expected exactly one match for:\n{old}')
    return text.replace(old, new)


def insert_after(text, anchor, addition):
    return replace_once(text, anchor, anchor + addition)


def insert_before(text, anchor, addition):
    return replace_once(text, anchor, addition + anchor)


# ─── Colors ──────────────────────────────────────────────────────────────────
# Rye's palette from src/shared/theme.ts (warm tint, default accent). Values are
# RRGGBB, or AARRGGBB for translucent ones.

DARK = {
    'ui::kColorFrameActive': '1c1b19',
    'ui::kColorFrameInactive': '21201e',
    'ui::kColorSysHeader': '1c1b19',
    'ui::kColorSysHeaderInactive': '21201e',
    'ui::kColorSysHeaderContainer': '2a2826',
    'ui::kColorSysHeaderContainerInactive': '262422',
    'ui::kColorSysOnHeaderPrimary': 'eeeded',
    'ui::kColorSysOnHeaderPrimaryInactive': 'b8b5b2',
    'ui::kColorSysOnHeaderDivider': '33302d',
    'ui::kColorSysOnHeaderDividerInactive': '2d2a28',
    'ui::kColorSysStateHeaderHover': '14ffffff',
    'ui::kColorSysBase': '252321',
    'ui::kColorSysBaseContainer': '2d2a28',
    'ui::kColorSysBaseContainerElevated': '34312e',
    'ui::kColorSysOmniboxContainer': '1c1b19',
    'ui::kColorSysSurface': '2d2a28',
    'ui::kColorSysSurfaceContainerLowest': '1c1b19',
    'ui::kColorSysSurfaceContainerLow': '22201e',
    'ui::kColorSysSurfaceContainer': '2d2a28',
    'ui::kColorSysSurfaceContainerHigh': '34312e',
    'ui::kColorSysSurfaceContainerHighest': '3b3835',
    'ui::kColorSysSurfaceVariant': '34312e',
    'ui::kColorSysNeutralContainer': '34312e',
    'ui::kColorSysOnSurface': 'eeeded',
    'ui::kColorSysOnSurfaceSubtle': 'b8b5b2',
    'ui::kColorSysOnSurfaceSecondary': 'b8b5b2',
    'ui::kColorSysOnSurfaceVariant': 'b8b5b2',
    'ui::kColorSysPrimary': '7593b4',
    'ui::kColorSysOnPrimary': '0f1720',
    'ui::kColorSysPrimaryContainer': '33465b',
    'ui::kColorSysOnPrimaryContainer': 'd8e3ef',
    'ui::kColorSysTonalContainer': '33465b',
    'ui::kColorSysOnTonalContainer': 'd8e3ef',
    'ui::kColorSysOutline': '6b6662',
    'ui::kColorSysNeutralOutline': '4a4642',
    'ui::kColorSysTonalOutline': '4a5a6c',
    'ui::kColorSysDivider': '35322f',
    'ui::kColorSysStateHover': '11ffffff',
    'ui::kColorSysStateHoverOnSubtle': '11ffffff',
    'ui::kColorSysStateFocusRing': '7593b4',
    'ui::kColorSysStateTextHighlight': '557593b4',
    'kColorToolbarTopSeparatorFrameActive': '252321',
    'kColorToolbarTopSeparatorFrameInactive': '252321',
    'kColorToolbarContentAreaSeparator': '252321',
    'kColorTabDividerFrameActive': '00000000',
    'kColorTabDividerFrameInactive': '00000000',
}

LIGHT = {
    'ui::kColorFrameActive': 'f1efeb',
    'ui::kColorFrameInactive': 'f5f3f0',
    'ui::kColorSysHeader': 'f1efeb',
    'ui::kColorSysHeaderInactive': 'f5f3f0',
    'ui::kColorSysHeaderContainer': 'e8e5e0',
    'ui::kColorSysHeaderContainerInactive': 'ebe8e3',
    'ui::kColorSysOnHeaderPrimary': '28221b',
    'ui::kColorSysOnHeaderPrimaryInactive': '6d614f',
    'ui::kColorSysOnHeaderDivider': 'dcd7cf',
    'ui::kColorSysOnHeaderDividerInactive': 'e3dfd8',
    'ui::kColorSysStateHeaderHover': '1228221b',
    'ui::kColorSysBase': 'fbfaf8',
    'ui::kColorSysBaseContainer': 'fdfdfd',
    'ui::kColorSysBaseContainerElevated': 'ffffff',
    'ui::kColorSysOmniboxContainer': 'efece7',
    'ui::kColorSysSurface': 'fdfdfd',
    'ui::kColorSysSurfaceContainerLowest': 'ffffff',
    'ui::kColorSysSurfaceContainerLow': 'f7f5f2',
    'ui::kColorSysSurfaceContainer': 'f3f1ed',
    'ui::kColorSysSurfaceContainerHigh': 'ece9e4',
    'ui::kColorSysSurfaceContainerHighest': 'e5e1db',
    'ui::kColorSysSurfaceVariant': 'ece9e4',
    'ui::kColorSysNeutralContainer': 'ece9e4',
    'ui::kColorSysOnSurface': '28221b',
    'ui::kColorSysOnSurfaceSubtle': '6d614f',
    'ui::kColorSysOnSurfaceSecondary': '6d614f',
    'ui::kColorSysOnSurfaceVariant': '6d614f',
    'ui::kColorSysPrimary': '5b7fa6',
    'ui::kColorSysOnPrimary': 'ffffff',
    'ui::kColorSysPrimaryContainer': 'dbe5f0',
    'ui::kColorSysOnPrimaryContainer': '1c2f44',
    'ui::kColorSysTonalContainer': 'dbe5f0',
    'ui::kColorSysOnTonalContainer': '1c2f44',
    'ui::kColorSysOutline': 'a39a8e',
    'ui::kColorSysNeutralOutline': 'd8d2c9',
    'ui::kColorSysTonalOutline': 'b9c7d6',
    'ui::kColorSysDivider': 'e6e1da',
    'ui::kColorSysStateHover': '0e28221b',
    'ui::kColorSysStateHoverOnSubtle': '0e28221b',
    'ui::kColorSysStateFocusRing': '5b7fa6',
    'ui::kColorSysStateTextHighlight': '445b7fa6',
    'kColorToolbarTopSeparatorFrameActive': 'fbfaf8',
    'kColorToolbarTopSeparatorFrameInactive': 'fbfaf8',
    'kColorToolbarContentAreaSeparator': 'fbfaf8',
    'kColorTabDividerFrameActive': '00000000',
    'kColorTabDividerFrameInactive': '00000000',
}


def known_color_ids(src):
    ids = set()
    for rel in ('ui/color/color_id.h', 'chrome/browser/ui/color/chrome_color_id.h'):
        with open(os.path.join(src, *rel.split('/')), encoding='utf-8') as f:
            ids.update(re.findall(r'\b(kColor[A-Za-z0-9]+)\b', f.read()))
    return ids


def sk_color(value):
    if len(value) == 6:
        value = 'ff' + value
    a, r, g, b = (value[i:i + 2] for i in range(0, 8, 2))
    return f'SkColorSetARGB(0x{a}, 0x{r}, 0x{g}, 0x{b})'


def mixer_lines(palette, ids, skipped):
    lines = []
    for name, value in palette.items():
        if name.split('::')[-1] not in ids:
            skipped.add(name)
            continue
        lines.append(f'    mixer[{name}] = {{{sk_color(value)}}};')
    return '\n'.join(lines)


def patch_color_mixers(text, src):
    ids = known_color_ids(src)
    skipped = set()
    dark = mixer_lines(DARK, ids, skipped)
    light = mixer_lines(LIGHT, ids, skipped)
    for name in sorted(skipped):
        print(f'  note: {name} is not in this Chromium version, skipped')

    function = f'''// Rye: Rye's palette for the whole browser UI. Later mixers resolve their
// references against the final colors, so setting the system colors here
// recolors everything derived from them. Steps aside for a theme or color the
// user picked, incognito and high contrast.
namespace {{
void AddRyeColorMixer(ui::ColorProvider* provider,
                      const ui::ColorProviderKey& key) {{
  if (key.custom_theme || key.user_color.has_value() ||
      key.user_color_source ==
          ui::ColorProviderKey::UserColorSource::kGrayscale ||
      key.contrast_mode == ui::ColorProviderKey::ContrastMode::kHigh ||
      key.forced_colors != ui::ColorProviderKey::ForcedColors::kNone) {{
    return;
  }}
  ui::ColorMixer& mixer = provider->AddMixer();
  if (key.color_mode == ui::ColorProviderKey::ColorMode::kDark) {{
{dark}
  }} else {{
{light}
  }}
}}
}}  // namespace

'''
    text = insert_before(text, 'void AddChromeColorMixers(ui::ColorProvider* provider,\n', function)
    text = insert_after(text, '  AddNativeChromeColorMixer(provider, key);\n',
                        '  AddRyeColorMixer(provider, key);  // Rye\n')
    headers = ('ui/color/color_mixer.h', 'ui/color/color_provider.h',
               'ui/color/color_provider_key.h', 'ui/color/color_recipe.h')
    missing = ''.join(f'#include "{h}"  // Rye\n' for h in headers
                      if f'#include "{h}"' not in text)
    return insert_after(text, '#include "ui/color/color_provider_utils.h"\n', missing)


# ─── Floating page ───────────────────────────────────────────────────────────

def patch_multi_contents_view(text, src):
    text = insert_before(
        text,
        'MultiContentsView::MultiContentsView(\n    BrowserView* browser_view,\n',
        '// Rye: in normal windows the page floats as a rounded sheet, the way split\n'
        '// view shows its pages, except in fullscreen.\n'
        'namespace {\n'
        'constexpr int kRyeContentInset = 8;\n'
        'constexpr float kRyeContentCornerRadius = 10;\n'
        '\n'
        'bool RyeFloatsContents(const BrowserView* browser_view) {\n'
        '  // Layout can run before the window exists or after it closes, so ask\n'
        '  // the widget directly rather than BrowserView::IsFullscreen().\n'
        '  const views::Widget* widget =\n'
        '      browser_view ? browser_view->GetWidget() : nullptr;\n'
        '  return widget && browser_view->browser() &&\n'
        '         browser_view->browser()->GetType() ==\n'
        '             BrowserWindowInterface::TYPE_NORMAL &&\n'
        '         !widget->IsFullscreen();\n'
        '}\n'
        '\n'
        'gfx::RoundedCornersF RyeContentCorners(const BrowserView* browser_view,\n'
        '                                       const gfx::RoundedCornersF& other) {\n'
        '  return RyeFloatsContents(browser_view)\n'
        '             ? gfx::RoundedCornersF(kRyeContentCornerRadius)\n'
        '             : other;\n'
        '}\n'
        '}  // namespace\n'
        '\n')

    # Paint the background around the sheet and inset the page.
    text = replace_once(
        text,
        '  const bool show_background =\n'
        '      drop_target_view_->GetVisible() || IsInSplitView();\n',
        '  const bool show_background = drop_target_view_->GetVisible() ||\n'
        '                               IsInSplitView() ||\n'
        '                               RyeFloatsContents(browser_view_);  // Rye\n')
    text = replace_once(
        text,
        '  if (IsInSplitView()) {\n'
        '    available_space.Inset(split_view_insets_);\n'
        '  }\n',
        '  if (IsInSplitView()) {\n'
        '    available_space.Inset(split_view_insets_);\n'
        '  } else if (RyeFloatsContents(browser_view_)) {  // Rye\n'
        '    available_space.Inset(gfx::Insets::TLBR(0, kRyeContentInset,\n'
        '                                            kRyeContentInset,\n'
        '                                            kRyeContentInset));\n'
        '  }\n')

    # No separator lines around a floating sheet.
    text = replace_once(
        text,
        '    views::ProposedLayout::ChildLayoutList& child_layouts) const {\n'
        '  if (IsInSplitView()) {\n'
        '    child_layouts.emplace_back(contents_separators_.top_separator.get(), false,\n',
        '    views::ProposedLayout::ChildLayoutList& child_layouts) const {\n'
        '  if (IsInSplitView() || RyeFloatsContents(browser_view_)) {  // Rye\n'
        '    child_layouts.emplace_back(contents_separators_.top_separator.get(), false,\n')

    # Rounded corners, and square again in fullscreen.
    text = replace_once(
        text,
        '  if (!IsInSplitView()) {\n'
        '    GetActiveContentsContainerView()->SetRoundedCorners(radii);\n',
        '  if (!IsInSplitView()) {\n'
        '    GetActiveContentsContainerView()->SetRoundedCorners(\n'
        '        RyeContentCorners(browser_view_, radii));  // Rye\n')
    text = replace_once(
        text,
        '            : (is_active ? GetBackgroundRadii() : gfx::RoundedCornersF()));\n',
        '            : (is_active ? RyeContentCorners(browser_view_,  // Rye\n'
        '                                             GetBackgroundRadii())\n'
        '                         : gfx::RoundedCornersF()));\n')
    text = insert_after(
        text,
        'void MultiContentsView::BeforeApplyLayout(const views::ProposedLayout& layout) {\n',
        '  // Rye: corners follow fullscreen on and off.\n'
        '  if (!IsInSplitView()) {\n'
        '    GetActiveContentsContainerView()->SetRoundedCorners(\n'
        '        RyeContentCorners(browser_view_, GetBackgroundRadii()));\n'
        '  }\n\n')
    if '#include "ui/views/widget/widget.h"' not in text:
        text = insert_after(
            text, '#include "chrome/browser/ui/views/frame/browser_view.h"\n',
            '#include "ui/views/widget/widget.h"  // Rye\n')
    if '#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"' not in text:
        text = insert_after(
            text, '#include "chrome/browser/ui/views/frame/browser_view.h"\n',
            '#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"  // Rye\n')
    return text


# ─── Sizes and corners ───────────────────────────────────────────────────────

def patch_layout_constants(text, src):
    # A slightly more compact tab strip.
    text = replace_once(
        text,
        '    case LayoutConstant::kTabHeight:\n'
        '      return 34 + GetLayoutConstant(LayoutConstant::kTabstripToolbarOverlap);\n',
        '    case LayoutConstant::kTabHeight:  // Rye: compact\n'
        '      return 32 + GetLayoutConstant(LayoutConstant::kTabstripToolbarOverlap);\n')
    # Softer corners, matching the floating page.
    text = replace_once(
        text,
        '    case LayoutConstant::kMainBackgroundRegionCornerRadius:\n'
        '    case LayoutConstant::kToolbarCornerRadius:\n'
        '    case LayoutConstant::kVerticalTabCornerRadius:\n'
        '      return 8;\n',
        '    case LayoutConstant::kMainBackgroundRegionCornerRadius:\n'
        '    case LayoutConstant::kToolbarCornerRadius:\n'
        '    case LayoutConstant::kVerticalTabCornerRadius:\n'
        '      return 10;  // Rye\n')
    return text


# ─── New tab page ────────────────────────────────────────────────────────────

def manifest_literal(folder):
    """The extension's manifest, compacted, as a C++ raw string literal."""
    with open(os.path.join(EXTENSIONS, folder, 'manifest.json'), encoding='utf-8') as f:
        text = json.dumps(json.load(f), separators=(',', ':'), ensure_ascii=True)
    if ')RYE_JSON' in text:
        raise PatchError(f'{folder}/manifest.json contains the literal delimiter')
    return f'R"RYE_JSON({text})RYE_JSON"'


def patch_component_loader(text, src):
    text = insert_before(
        text,
        'void ComponentLoader::AddDefaultComponentExtensions(\n',
        '// Rye: the built-in new tab page. Its files live in rye_extensions/ next\n'
        '// to chrome.dll; the manifest is written here by apply_rye.py.\n'
        'namespace {\n'
        f'constexpr char kRyeNewTabManifest[] = {manifest_literal("rye-newtab")};\n'
        '}  // namespace\n\n')
    text = insert_after(
        text,
        '  if (!skip_session_components) {\n    AddWebStoreApp();\n',
        '    // Rye: built-in new tab page.\n'
        '    base::FilePath rye_dir;\n'
        '    if (base::PathService::Get(base::DIR_MODULE, &rye_dir)) {\n'
        '      Add(std::string_view(kRyeNewTabManifest),\n'
        '          rye_dir.AppendASCII("rye_extensions").AppendASCII("newtab"),\n'
        '          /*skip_allowlist=*/true);\n'
        '    }\n')
    if '#include "base/base_paths.h"' not in text:
        text = insert_before(text, '#include "base/path_service.h"\n',
                             '#include "base/base_paths.h"  // Rye\n')
    return text


def bundle_dirs(folder):
    """Subfolders of a bundled extension that hold files ('' for the top)."""
    root = os.path.join(EXTENSIONS, folder)
    out = set()
    for dirpath, _, files in os.walk(root):
        if any(not f.startswith('.') for f in files):
            rel = os.path.relpath(dirpath, root)
            out.add('' if rel == '.' else rel.replace(os.sep, '\\'))
    return out


def patch_release(text, src):
    lines = ['#', '# Rye: built-in extensions, next to chrome.dll.', '#']
    for folder, name in BUNDLED:
        for sub in sorted(bundle_dirs(folder)):
            path = '\\'.join(['rye_extensions', name] + ([sub] if sub else []))
            lines.append(f'{path}\\*.*: %(VersionDir)s\\{path}\\')
    return insert_after(text, 'locales\\*.pak: %(VersionDir)s\\Locales\n',
                        '\n'.join(lines) + '\n')


def copy_extensions(out_dir, check):
    dest_root = os.path.join(out_dir, 'rye_extensions')
    if check:
        print(f'would copy the new tab page to {dest_root}')
        return
    for folder, name in BUNDLED:
        shutil.copytree(os.path.join(EXTENSIONS, folder), os.path.join(dest_root, name),
                        ignore=shutil.ignore_patterns('.*', 'Cached Theme.pak'),
                        dirs_exist_ok=True)
    print(f'copied the new tab page to {dest_root}')


def unchanged(text, src):
    return text


PATCHES = [
    ('chrome/browser/ui/color/chrome_color_mixers.cc', patch_color_mixers),
    ('chrome/browser/ui/views/frame/multi_contents_view.cc', patch_multi_contents_view),
    ('chrome/browser/ui/layout_constants.cc', patch_layout_constants),
    ('chrome/browser/extensions/component_loader.cc', patch_component_loader),
    ('chrome/installer/mini_installer/chrome.release', patch_release),
]

# Names for --skip=..., to leave a change out (the file goes back to Chromium's).
PARTS = {
    'colors': 'chrome/browser/ui/color/chrome_color_mixers.cc',
    'float': 'chrome/browser/ui/views/frame/multi_contents_view.cc',
    'sizes': 'chrome/browser/ui/layout_constants.cc',
    'newtab': 'chrome/browser/extensions/component_loader.cc',
}


# ─── Driver ──────────────────────────────────────────────────────────────────

def read(path):
    with open(path, encoding='utf-8', newline='') as f:
        return f.read()


def original(src, rel):
    """Chromium's own version of a file, without any earlier Rye edits."""
    path = os.path.join(src, *rel.split('/'))
    text = read(path)
    if MARK not in text:
        return text
    result = subprocess.run(['git', 'show', f'HEAD:{rel}'], cwd=src, capture_output=True,
                            shell=os.name == 'nt')
    if result.returncode != 0:
        raise PatchError(f'could not read the original from git: {result.stderr.decode(errors="replace").strip()}')
    text = result.stdout.decode('utf-8')
    return text.replace('\r\n', '\n').replace('\n', '\r\n') if '\r\n' in read(path) else text


def write_if_changed(path, text, rel, check):
    """Only touch files whose contents change, so rebuilds stay small."""
    if read(path) == text:
        print(f'up to date {rel}')
    elif check:
        print(f'would patch {rel}')
    else:
        with open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(text)
        print(f'patched {rel}')


def main(argv):
    args = [a for a in argv[1:] if not a.startswith('--')]
    check = '--check' in argv
    skip = set()
    for a in argv[1:]:
        if a.startswith('--skip='):
            skip.update(x for x in a[len('--skip='):].split(',') if x)
    if skip - PARTS.keys():
        print(f'unknown --skip part(s): {", ".join(sorted(skip - PARTS.keys()))}; '
              f'choose from {", ".join(PARTS)}')
        return 2
    skipped_files = {PARTS[p] for p in skip}
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

    ok = True
    for rel in RETIRED + [rel for rel, _ in PATCHES]:
        path = os.path.join(src, *rel.split('/'))
        try:
            before = original(src, rel)
            patch = dict(PATCHES).get(rel)
            if rel in skipped_files:
                print(f'skipping {rel} (--skip)')
                patch = unchanged
            if patch:
                crlf = '\r\n' in before
                after = patch(before.replace('\r\n', '\n'), src)
                before = after.replace('\n', '\r\n') if crlf else after
        except PatchError as e:
            print(f'FAILED {rel}: {e}')
            ok = False
            continue
        write_if_changed(path, before, rel, check)
    if not ok:
        print('\nSome files did not match. Paste this output to get an updated script.')
        return 1

    copy_extensions(os.path.join(src, 'out', 'Rye'), check)
    print('\nDone. Now rebuild: autoninja -C out\\Rye chrome')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
