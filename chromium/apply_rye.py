#!/usr/bin/env python3
"""Turn a Chromium checkout into Rye: branding plus Rye's own interface.

Usage (from any folder, with depot_tools' python3):
    python3 apply_rye.py C:\\src\\chromium\\src           apply everything
    python3 apply_rye.py C:\\src\\chromium\\src --check   show what would change
    python3 apply_rye.py C:\\src\\chromium\\src --skip=float,colors
        leave out parts (colors, float, shape, newtab, lean), for tracking down problems

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
RETIRED = []


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
# Rye computes its palette instead of using Material's. Inputs:
#   surface tint  the "rye.surface_color" pref (0 = Rye's warm neutrals)
#   accent        Chromium's own user color (browser.theme.user_color2)
#   light/dark    Chromium's color scheme (browser.theme.color_scheme2)
#   monochrome    Chromium's grayscale setting, also used for incognito
# Each entry: color id -> C++ expression using the helpers in the mixer.

PALETTE = {
    'ui::kColorFrameActive': 'tone(dark ? 0.105 : 0.925)',
    'ui::kColorFrameInactive': 'tone(dark ? 0.125 : 0.945)',
    'ui::kColorSysHeader': 'tone(dark ? 0.105 : 0.925)',
    'ui::kColorSysHeaderInactive': 'tone(dark ? 0.125 : 0.945)',
    'ui::kColorSysHeaderContainer': 'tone(dark ? 0.155 : 0.885)',
    'ui::kColorSysHeaderContainerInactive': 'tone(dark ? 0.14 : 0.905)',
    'ui::kColorSysOnHeaderPrimary': 'text',
    'ui::kColorSysOnHeaderPrimaryInactive': 'text_subtle',
    'ui::kColorSysOnHeaderDivider': 'tone(dark ? 0.2 : 0.86)',
    'ui::kColorSysOnHeaderDividerInactive': 'tone(dark ? 0.17 : 0.89)',
    'ui::kColorSysStateHeaderHover': 'SkColorSetA(overlay, dark ? 0x14 : 0x12)',
    'ui::kColorSysBase': 'base',
    'ui::kColorSysBaseContainer': 'tone(dark ? 0.17 : 0.99)',
    'ui::kColorSysBaseContainerElevated': 'tone(dark ? 0.2 : 1.0)',
    'ui::kColorSysOmniboxContainer': 'tone(dark ? 0.105 : 0.93)',
    'ui::kColorSysSurface': 'tone(dark ? 0.17 : 0.99)',
    'ui::kColorSysSurfaceContainerLowest': 'tone(dark ? 0.1 : 1.0)',
    'ui::kColorSysSurfaceContainerLow': 'tone(dark ? 0.13 : 0.965)',
    'ui::kColorSysSurfaceContainer': 'tone(dark ? 0.17 : 0.95)',
    'ui::kColorSysSurfaceContainerHigh': 'tone(dark ? 0.2 : 0.925)',
    'ui::kColorSysSurfaceContainerHighest': 'tone(dark ? 0.23 : 0.9)',
    'ui::kColorSysSurfaceVariant': 'tone(dark ? 0.2 : 0.925, 0.8)',
    'ui::kColorSysNeutralContainer': 'tone(dark ? 0.2 : 0.925, 0.8)',
    'ui::kColorSysOnSurface': 'text',
    'ui::kColorSysOnSurfaceSubtle': 'text_subtle',
    'ui::kColorSysOnSurfaceSecondary': 'text_subtle',
    'ui::kColorSysOnSurfaceVariant': 'text_subtle',
    'ui::kColorSysPrimary': 'primary',
    'ui::kColorSysOnPrimary': 'on_primary',
    'ui::kColorSysPrimaryContainer': 'primary_container',
    'ui::kColorSysOnPrimaryContainer': 'on_primary_container',
    'ui::kColorSysTonalContainer': 'primary_container',
    'ui::kColorSysOnTonalContainer': 'on_primary_container',
    'ui::kColorSysOutline': 'tone(dark ? 0.42 : 0.62, 0.5)',
    'ui::kColorSysNeutralOutline': 'tone(dark ? 0.28 : 0.82, 0.6)',
    'ui::kColorSysTonalOutline': 'RyeTone(accent, accent.s * 0.4, dark ? 0.35 : 0.78)',
    'ui::kColorSysDivider': 'tone(dark ? 0.21 : 0.885)',
    'ui::kColorSysStateHover': 'SkColorSetA(overlay, dark ? 0x11 : 0x0f)',
    'ui::kColorSysStateHoverOnSubtle': 'SkColorSetA(overlay, dark ? 0x11 : 0x0f)',
    'ui::kColorSysStateFocusRing': 'primary',
    'ui::kColorSysStateTextHighlight': 'SkColorSetA(primary, 0x55)',
    'kColorToolbarTopSeparatorFrameActive': 'base',
    'kColorToolbarTopSeparatorFrameInactive': 'base',
    'kColorToolbarContentAreaSeparator': 'base',
    'kColorTabDividerFrameActive': 'SK_ColorTRANSPARENT',
    'kColorTabDividerFrameInactive': 'SK_ColorTRANSPARENT',
}


def known_color_ids(src):
    ids = set()
    for rel in ('ui/color/color_id.h', 'chrome/browser/ui/color/chrome_color_id.h'):
        with open(os.path.join(src, *rel.split('/')), encoding='utf-8') as f:
            ids.update(re.findall(r'\b(kColor[A-Za-z0-9]+)\b', f.read()))
    return ids


def patch_color_mixers(text, src):
    ids = known_color_ids(src)
    lines = []
    for name, expr in PALETTE.items():
        if name.split('::')[-1] not in ids:
            print(f'  note: {name} is not in this Chromium version, skipped')
            continue
        lines.append(f'  mixer[{name}] = {{{expr}}};')
    assignments = '\n'.join(lines)

    function = f"""// Rye: defined in chrome/browser/ui/layout_constants.cc and set from the
// "rye.surface_color" pref by ThemeService.
uint32_t RyeSurfaceColor();

// Rye: Rye's palette for the whole browser UI, computed from a surface tint,
// an accent (Chromium's user color) and light or dark. Later mixers resolve
// their references against the final colors, so setting the system colors
// here recolors everything derived from them. Steps aside for an installed
// theme, high contrast and forced colors.
namespace {{

// Rye's default surfaces: warm, barely tinted neutrals.
constexpr color_utils::HSL kRyeWarmSurface = {{40.0 / 360.0, 0.07, 0.5}};

SkColor RyeTone(const color_utils::HSL& hsl, double saturation, double lightness) {{
  return color_utils::HSLToSkColor(
      {{hsl.h, std::clamp(saturation, 0.0, 1.0), lightness}}, SK_AlphaOPAQUE);
}}

void AddRyeColorMixer(ui::ColorProvider* provider,
                      const ui::ColorProviderKey& key) {{
  if (key.custom_theme ||
      key.contrast_mode == ui::ColorProviderKey::ContrastMode::kHigh ||
      key.forced_colors != ui::ColorProviderKey::ForcedColors::kNone) {{
    return;
  }}
  const bool dark = key.color_mode == ui::ColorProviderKey::ColorMode::kDark;
  const bool mono = key.user_color_source ==
                    ui::ColorProviderKey::UserColorSource::kGrayscale;

  color_utils::HSL surface = kRyeWarmSurface;
  if (const uint32_t seed = RyeSurfaceColor(); seed != 0) {{
    color_utils::SkColorToHSL(SkColorSetA(seed, SK_AlphaOPAQUE), &surface);
  }}
  if (mono) {{
    surface.s = 0;
  }}
  // Dark surfaces carry the full tint; light ones a gentler version of it.
  const double tint =
      dark ? std::min(surface.s, 0.6) : std::min(surface.s * 0.55, 0.35);
  auto tone = [&](double lightness, double scale = 1.0) {{
    return RyeTone(surface, tint * scale, lightness);
  }};

  color_utils::HSL accent;
  color_utils::SkColorToHSL(
      key.user_color.value_or(dark ? SkColorSetRGB(0x75, 0x93, 0xb4)
                                   : SkColorSetRGB(0x5b, 0x7f, 0xa6)),
      &accent);
  if (mono) {{
    accent.s = 0;
  }}
  // Keep the accent readable on Rye's surfaces in both modes.
  accent.l = dark ? std::clamp(accent.l, 0.62, 0.82)
                  : std::clamp(accent.l, 0.3, 0.5);
  const SkColor primary = color_utils::HSLToSkColor(accent, SK_AlphaOPAQUE);
  const SkColor on_primary = color_utils::IsDark(primary)
                                 ? SK_ColorWHITE
                                 : SkColorSetRGB(0x14, 0x12, 0x10);
  const SkColor primary_container =
      RyeTone(accent, accent.s * 0.5, dark ? 0.27 : 0.88);
  const SkColor on_primary_container =
      RyeTone(accent, accent.s * 0.6, dark ? 0.88 : 0.18);
  const SkColor base = tone(dark ? 0.14 : 0.975);
  const SkColor text = tone(dark ? 0.93 : 0.12, 0.3);
  const SkColor text_subtle = tone(dark ? 0.72 : 0.38, 0.35);
  const SkColor overlay = dark ? SK_ColorWHITE : tone(0.12, 0.3);

  ui::ColorMixer& mixer = provider->AddMixer();
{assignments}
}}

}}  // namespace

"""
    text = insert_before(text, 'void AddChromeColorMixers(ui::ColorProvider* provider,\n', function)
    text = insert_after(text, '  AddNativeChromeColorMixer(provider, key);\n',
                        '  AddRyeColorMixer(provider, key);  // Rye\n')
    headers = ('ui/color/color_mixer.h', 'ui/color/color_provider.h',
               'ui/color/color_provider_key.h', 'ui/color/color_recipe.h',
               'ui/gfx/color_utils.h')
    missing = ''.join(f'#include "{h}"  // Rye\n' for h in headers
                      if f'#include "{h}"' not in text)
    text = insert_after(text, '#include "ui/color/color_provider_utils.h"\n', missing)
    for std_header in ('<algorithm>', '<cstdint>'):
        if f'#include {std_header}' not in text:
            text = insert_before(text, '#include <memory>\n', f'#include {std_header}  // Rye\n')
    return text


# ─── Floating page ───────────────────────────────────────────────────────────

def patch_multi_contents_view(text, src):
    text = insert_before(
        text,
        'MultiContentsView::MultiContentsView(\n    BrowserView* browser_view,\n',
        '// Rye: defined in chrome/browser/ui/layout_constants.cc (0 soft, 1 rounded,\n'
        '// 2 extra round).\n'
        'int RyeShape();\n'
        '\n'
        '// Rye: in normal windows the page floats as a rounded sheet, the way split\n'
        '// view shows its pages, except in fullscreen.\n'
        'namespace {\n'
        'int RyeContentInset() {\n'
        '  return RyeShape() == 0 ? 6 : RyeShape() == 2 ? 10 : 8;\n'
        '}\n'
        '\n'
        'float RyeContentCornerRadius() {\n'
        '  return RyeShape() == 0 ? 8 : RyeShape() == 2 ? 16 : 12;\n'
        '}\n'
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
        '             ? gfx::RoundedCornersF(RyeContentCornerRadius())\n'
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
        '    available_space.Inset(gfx::Insets::TLBR(0, RyeContentInset(),\n'
        '                                            RyeContentInset(),\n'
        '                                            RyeContentInset()));\n'
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

RYE_APPEARANCE = """// Rye: appearance values from Rye's settings. ThemeService copies them from
// the profile's "rye.shape" and "rye.surface_color" prefs; the color mixer,
// tabs, page sheet and corner metrics read them.
int RyeShape();
uint32_t RyeSurfaceColor();
float RyeCornerScale();
void SetRyeAppearance(int shape, uint32_t surface_color);

namespace {
int g_rye_shape = 1;               // 0 soft, 1 rounded, 2 extra round
uint32_t g_rye_surface_color = 0;  // 0 means Rye's warm neutrals
}  // namespace

int RyeShape() {
  return g_rye_shape;
}

uint32_t RyeSurfaceColor() {
  return g_rye_surface_color;
}

float RyeCornerScale() {
  switch (g_rye_shape) {
    case 0:
      return 0.75f;
    case 2:
      return 1.45f;
    default:
      return 1.0f;
  }
}

void SetRyeAppearance(int shape, uint32_t surface_color) {
  g_rye_shape = std::clamp(shape, 0, 2);
  g_rye_surface_color = surface_color;
}

"""


def patch_layout_constants(text, src):
    text = insert_before(text, 'int GetLayoutConstant(LayoutConstant constant) {\n', RYE_APPEARANCE)
    text = insert_after(text, '#include "chrome/browser/ui/layout_constants.h"\n',
                        '\n#include <algorithm>  // Rye\n#include <cstdint>    // Rye\n')
    # A slightly more compact tab strip.
    text = replace_once(
        text,
        '    case LayoutConstant::kTabHeight:\n'
        '      return 34 + GetLayoutConstant(LayoutConstant::kTabstripToolbarOverlap);\n',
        '    case LayoutConstant::kTabHeight:  // Rye: compact\n'
        '      return 32 + GetLayoutConstant(LayoutConstant::kTabstripToolbarOverlap);\n')
    # Corners follow Rye's corner style.
    text = replace_once(
        text,
        '    case LayoutConstant::kMainBackgroundRegionCornerRadius:\n'
        '    case LayoutConstant::kToolbarCornerRadius:\n'
        '    case LayoutConstant::kVerticalTabCornerRadius:\n'
        '      return 8;\n',
        '    case LayoutConstant::kMainBackgroundRegionCornerRadius:\n'
        '    case LayoutConstant::kToolbarCornerRadius:\n'
        '    case LayoutConstant::kVerticalTabCornerRadius:\n'
        '      return RyeShape() == 0 ? 8 : RyeShape() == 2 ? 14 : 10;  // Rye\n')
    text = replace_once(
        text,
        '    case LayoutConstant::kLocationBarChildCornerRadius:\n'
        '      return 12;\n',
        '    case LayoutConstant::kLocationBarChildCornerRadius:\n'
        '      return RyeShape() == 0 ? 8 : 12;  // Rye\n')
    return text


def patch_tab_style(text, src):
    text = insert_after(text, '#include "ui/views/layout/layout_provider.h"\n',
                        '\n// Rye: defined in chrome/browser/ui/layout_constants.cc.\nint RyeShape();\n')
    return replace_once(
        text,
        'int TabStyle::GetTopCornerRadius() const {\n  return 10;\n}\n',
        'int TabStyle::GetTopCornerRadius() const {\n'
        '  return RyeShape() == 0 ? 7 : RyeShape() == 2 ? 14 : 10;  // Rye\n'
        '}\n')


def patch_chrome_layout_provider(text, src):
    text = insert_before(
        text,
        'int ChromeLayoutProvider::GetCornerRadiusMetric(views::ShapeContextToken token,\n',
        '// Rye: defined in chrome/browser/ui/layout_constants.cc.\n'
        'float RyeCornerScale();\n'
        '\n'
        'namespace {\n'
        '// Rye: scales menus, dialogs, fields and buttons for Rye\'s Soft, Rounded\n'
        '// and Extra Round styles. Pills and circles stay as they are.\n'
        'int RyeScaleCorner(int radius, const gfx::Size& size) {\n'
        '  if (radius <= 0) {\n'
        '    return radius;\n'
        '  }\n'
        '  const int half =\n'
        '      size.IsEmpty() ? 0 : std::min(size.width(), size.height()) / 2;\n'
        '  if (half > 0 && radius >= half) {\n'
        '    return radius;\n'
        '  }\n'
        '  const int scaled = static_cast<int>(radius * RyeCornerScale() + 0.5f);\n'
        '  return half > 0 ? std::min(scaled, half) : scaled;\n'
        '}\n'
        '}  // namespace\n'
        '\n')
    text = replace_once(
        text,
        '    return LayoutProvider::GetCornerRadiusMetric(token, size);\n',
        '    return RyeScaleCorner(  // Rye\n'
        '        LayoutProvider::GetCornerRadiusMetric(token, size), size);\n')
    return replace_once(
        text,
        '      return GetCornerRadiusMetric(GetShapeSysToken(token));\n',
        '      return RyeScaleCorner(GetCornerRadiusMetric(GetShapeSysToken(token)),  // Rye\n'
        '                            size);\n')


# ─── Rye's settings, stored as profile prefs ─────────────────────────────────

def patch_theme_service(text, src):
    text = insert_before(
        text,
        '// static\nvoid ThemeService::RegisterProfilePrefs(\n',
        '// Rye: defined in chrome/browser/ui/layout_constants.cc.\n'
        'int RyeShape();\n'
        'uint32_t RyeSurfaceColor();\n'
        'void SetRyeAppearance(int shape, uint32_t surface_color);\n'
        '\n'
        'namespace {\n'
        '// Rye: Rye\'s own appearance prefs, set from Rye\'s setup and Personalize\n'
        '// pages through chrome.settingsPrivate.\n'
        'constexpr char kRyeShapePref[] = "rye.shape";\n'
        'constexpr char kRyeSurfaceColorPref[] = "rye.surface_color";\n'
        '\n'
        '// Copies the profile\'s Rye appearance into the values the UI reads and\n'
        '// drops cached colors when they change, so the next paint uses them.\n'
        'void RyeSyncAppearance(const PrefService* prefs) {\n'
        '  if (!prefs->FindPreference(kRyeShapePref)) {\n'
        '    return;\n'
        '  }\n'
        '  const int shape = prefs->GetInteger(kRyeShapePref);\n'
        '  const uint32_t surface =\n'
        '      static_cast<uint32_t>(prefs->GetInteger(kRyeSurfaceColorPref)) &\n'
        '      0xFFFFFF;\n'
        '  if (shape == RyeShape() && surface == RyeSurfaceColor()) {\n'
        '    return;\n'
        '  }\n'
        '  SetRyeAppearance(shape, surface);\n'
        '  ui::ColorProviderManager::Get().ResetColorProviderCache();\n'
        '}\n'
        '}  // namespace\n'
        '\n')
    text = insert_after(
        text,
        '  registry->RegisterStringPref(prefs::kSavedLocalTheme, "");\n',
        '  // Rye: corner style (0 soft, 1 rounded, 2 extra round) and surface tint\n'
        '  // (0xRRGGBB, 0 for Rye\'s warm neutrals).\n'
        '  registry->RegisterIntegerPref(kRyeShapePref, 1);\n'
        '  registry->RegisterIntegerPref(kRyeSurfaceColorPref, 0);\n')
    text = insert_after(
        text,
        '  pref_change_registrar_.Add(\n'
        '      prefs::kUserColor, base::BindRepeating(&ThemeService::NotifyThemeChanged,\n'
        '                                             base::Unretained(this)));\n',
        '  // Rye: repaint when Rye\'s appearance prefs change.\n'
        '  pref_change_registrar_.Add(\n'
        '      kRyeShapePref, base::BindRepeating(&ThemeService::NotifyThemeChanged,\n'
        '                                         base::Unretained(this)));\n'
        '  pref_change_registrar_.Add(\n'
        '      kRyeSurfaceColorPref,\n'
        '      base::BindRepeating(&ThemeService::NotifyThemeChanged,\n'
        '                          base::Unretained(this)));\n'
        '  RyeSyncAppearance(profile_->GetPrefs());\n')
    text = insert_after(text, 'void ThemeService::NotifyThemeChanged() {\n',
                        '  RyeSyncAppearance(profile_->GetPrefs());  // Rye\n')
    return text


def patch_prefs_util(text, src):
    # Lets Rye's component pages change these through chrome.settingsPrivate.
    return insert_after(
        text,
        '  (*s_allowlist)[::prefs::kCurrentThemeID] = settings_api::PrefType::kString;\n',
        '  // Rye: appearance settings changed from Rye\'s setup and Personalize pages.\n'
        '  (*s_allowlist)[::prefs::kUserColor] = settings_api::PrefType::kNumber;\n'
        '  (*s_allowlist)[::prefs::kBrowserColorScheme] =\n'
        '      settings_api::PrefType::kNumber;\n'
        '  (*s_allowlist)[::prefs::kBrowserColorVariant] =\n'
        '      settings_api::PrefType::kNumber;\n'
        '  (*s_allowlist)[::prefs::kGrayscaleThemeEnabled] =\n'
        '      settings_api::PrefType::kBoolean;\n'
        '  (*s_allowlist)["rye.shape"] = settings_api::PrefType::kNumber;\n'
        '  (*s_allowlist)["rye.surface_color"] = settings_api::PrefType::kNumber;\n')


def patch_ntp_features(text, src):
    # Chromium adds a footer naming the extension under extension new tab pages.
    return replace_once(
        text,
        'BASE_FEATURE(kNtpFooter, base::FEATURE_ENABLED_BY_DEFAULT);\n',
        '// Rye: the new tab page is Rye\'s own, so no extension footer.\n'
        'BASE_FEATURE(kNtpFooter, base::FEATURE_DISABLED_BY_DEFAULT);\n')


# ─── Lighter defaults ────────────────────────────────────────────────────────
# Background work Rye turns off by default to use less memory, the way
# privacy-focused Chromium browsers do. Websites behave the same; each of
# these can be turned back on in chrome://settings or chrome://flags.
# These are optional: if a future Chromium moves one, it's skipped, not fatal.

def disable_feature(text, name):
    pattern = re.compile(r'(BASE_FEATURE\(\s*' + name + r',\s*)base::FEATURE_ENABLED_BY_DEFAULT(\s*\);)')
    new, count = pattern.subn(r'\1base::FEATURE_DISABLED_BY_DEFAULT\2  // Rye: lighter', text)
    if count != 1:
        print(f'  note: {name} not found as an enabled feature, skipped')
        return text
    return new


def optional_replace(text, old, new, what):
    if text.count(old) != 1:
        print(f'  note: {what} not found, skipped')
        return text
    return text.replace(old, new)


def patch_optimization_guide(text, src):
    # Google's page hints, prediction models and on-device AI: background
    # downloads plus models kept in memory.
    for name in ('kOptimizationHints', 'kOptimizationTargetPrediction',
                 'kOptimizationGuideModelExecution', 'kModelQualityLogging'):
        text = disable_feature(text, name)
    return text


def patch_ui_features(text, src):
    # Hover cards keep a screenshot of each tab in memory.
    return optional_replace(
        text,
        'BASE_FEATURE(kTabHoverCardImages,\n'
        '#if BUILDFLAG(IS_MAC)\n'
        '             base::FEATURE_DISABLED_BY_DEFAULT\n'
        '#else\n'
        '             base::FEATURE_ENABLED_BY_DEFAULT\n'
        '#endif\n'
        ');\n',
        '// Rye: lighter; no tab screenshots in hover cards.\n'
        'BASE_FEATURE(kTabHoverCardImages, base::FEATURE_DISABLED_BY_DEFAULT);\n',
        'kTabHoverCardImages')


def patch_memory_saver(text, src):
    # Memory Saver on: tabs you haven't used for a while give their memory back
    # and reload when you return to them.
    text = optional_replace(
        text,
        '  registry->RegisterBooleanPref(kMemorySaverModeEnabled, false);\n',
        '  registry->RegisterBooleanPref(kMemorySaverModeEnabled, true);  // Rye\n',
        'kMemorySaverModeEnabled')
    return optional_replace(
        text,
        '      kMemorySaverModeState, static_cast<int>(MemorySaverModeState::kDisabled));\n',
        '      kMemorySaverModeState,\n'
        '      static_cast<int>(MemorySaverModeState::kEnabled));  // Rye: lighter\n',
        'kMemorySaverModeState')


def patch_preloading(text, src):
    # Preloading starts whole extra page processes in the background for pages
    # you might open next.
    return optional_replace(
        text,
        '      static_cast<int>(NetworkPredictionOptions::kDefault),\n',
        '      static_cast<int>(NetworkPredictionOptions::kDisabled),  // Rye: lighter\n',
        'kNetworkPredictionOptions default')


def patch_omnibox_prefs(text, src):
    # The address bar's "AI Mode" and Google Lens buttons are off by default;
    # both can be turned back on in Settings.
    text = optional_replace(
        text,
        '      kShowAiModeOmniboxButton, true,\n',
        '      kShowAiModeOmniboxButton, false,  // Rye\n',
        'kShowAiModeOmniboxButton')
    return optional_replace(
        text,
        '      kShowGoogleLensShortcut, true,\n',
        '      kShowGoogleLensShortcut, false,  // Rye\n',
        'kShowGoogleLensShortcut')


def patch_omnibox_features(text, src):
    # AI Mode entry point for non-Google search engines.
    return optional_replace(
        text,
        'BASE_FEATURE(kAim3pEntrypoint, ENABLED);\n',
        'BASE_FEATURE(kAim3pEntrypoint, DISABLED);  // Rye: no AI Mode button\n',
        'kAim3pEntrypoint')


# ─── New tab page ────────────────────────────────────────────────────────────

def manifest_literal(folder):
    """The extension's manifest, compacted, as a C++ raw string literal."""
    with open(os.path.join(EXTENSIONS, folder, 'manifest.json'), encoding='utf-8') as f:
        manifest = json.load(f)
    # Component extensions get their ID from this public key; without one
    # Chromium stops at startup (CHECK in component_loader.cc).
    if not manifest.get('key'):
        raise PatchError(f'{folder}/manifest.json needs a "key"')
    text = json.dumps(manifest, separators=(',', ':'), ensure_ascii=True)
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
    ('chrome/browser/ui/layout_constants.cc', patch_layout_constants),
    ('chrome/browser/ui/color/chrome_color_mixers.cc', patch_color_mixers),
    ('chrome/browser/themes/theme_service.cc', patch_theme_service),
    ('chrome/browser/extensions/api/settings_private/prefs_util.cc', patch_prefs_util),
    ('chrome/browser/ui/views/frame/multi_contents_view.cc', patch_multi_contents_view),
    ('chrome/browser/ui/tabs/tab_style.cc', patch_tab_style),
    ('chrome/browser/ui/views/chrome_layout_provider.cc', patch_chrome_layout_provider),
    ('components/search/ntp_features.cc', patch_ntp_features),
    ('components/optimization_guide/core/optimization_guide_features.cc', patch_optimization_guide),
    ('chrome/browser/ui/ui_features.cc', patch_ui_features),
    ('components/performance_manager/user_tuning/prefs.cc', patch_memory_saver),
    ('chrome/browser/preloading/preloading_prefs.cc', patch_preloading),
    ('components/omnibox/browser/omnibox_prefs.cc', patch_omnibox_prefs),
    ('components/omnibox/common/omnibox_features.cc', patch_omnibox_features),
    ('chrome/browser/extensions/component_loader.cc', patch_component_loader),
    ('chrome/installer/mini_installer/chrome.release', patch_release),
]

# Names for --skip=..., to leave a change out (the file goes back to Chromium's).
PARTS = {
    'colors': ['chrome/browser/ui/color/chrome_color_mixers.cc'],
    'float': ['chrome/browser/ui/views/frame/multi_contents_view.cc'],
    'shape': ['chrome/browser/ui/tabs/tab_style.cc',
              'chrome/browser/ui/views/chrome_layout_provider.cc'],
    'newtab': ['chrome/browser/extensions/component_loader.cc',
               'components/search/ntp_features.cc'],
    'lean': ['components/optimization_guide/core/optimization_guide_features.cc',
             'chrome/browser/ui/ui_features.cc',
             'components/performance_manager/user_tuning/prefs.cc',
             'chrome/browser/preloading/preloading_prefs.cc',
             'components/omnibox/browser/omnibox_prefs.cc',
             'components/omnibox/common/omnibox_features.cc'],
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
    skipped_files = {f for p in skip for f in PARTS[p]}
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

    # Every build folder (out\\Rye, out\\RyeLite, ...) gets Rye's pages.
    out_root = os.path.join(src, 'out')
    build_dirs = [os.path.join(out_root, d) for d in sorted(os.listdir(out_root))
                  if os.path.isfile(os.path.join(out_root, d, 'args.gn'))] if os.path.isdir(out_root) else []
    for build_dir in build_dirs or [os.path.join(out_root, 'Rye')]:
        copy_extensions(build_dir, check)
    print('\nDone. Now rebuild: autoninja -C out\\Rye chrome')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
