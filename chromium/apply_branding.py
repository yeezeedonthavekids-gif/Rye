#!/usr/bin/env python3
"""Rebrand a Chromium checkout as Rye: product name, strings and icons.

Usage (from any folder, with depot_tools' python3):
    python3 apply_branding.py C:\\src\\chromium\\src           apply
    python3 apply_branding.py C:\\src\\chromium\\src --check   show what would change

Only files that already exist in the checkout are touched, so the script is
safe to re-run. To undo everything, run in the checkout:
    git checkout -- chrome/app
"""
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PNG = os.path.join(HERE, 'branding', 'png')

BRANDING = """COMPANY_FULLNAME=Rye
COMPANY_SHORTNAME=Rye
PRODUCT_FULLNAME=Rye
PRODUCT_SHORTNAME=Rye
PRODUCT_INSTALLER_FULLNAME=Rye Installer
PRODUCT_INSTALLER_SHORTNAME=Rye Installer
COPYRIGHT=Copyright @LASTCHANGE_YEAR@ Rye and The Chromium Authors. All rights reserved.
MAC_BUNDLE_ID=app.rye.Rye
MAC_CREATOR_CODE=Rye1
MAC_TEAM_ID=
"""

# (source in branding/, destination in the checkout)
ICONS = [
    ('png/logo_16.png', 'chrome/app/theme/chromium/product_logo_16.png'),
    ('png/logo_24.png', 'chrome/app/theme/chromium/product_logo_24.png'),
    ('png/logo_48.png', 'chrome/app/theme/chromium/product_logo_48.png'),
    ('png/logo_64.png', 'chrome/app/theme/chromium/product_logo_64.png'),
    ('png/logo_128.png', 'chrome/app/theme/chromium/product_logo_128.png'),
    ('png/logo_256.png', 'chrome/app/theme/chromium/product_logo_256.png'),
    ('png/mono_22.png', 'chrome/app/theme/chromium/product_logo_22_mono.png'),
    ('png/logo_16.png', 'chrome/app/theme/default_100_percent/chromium/product_logo_16.png'),
    ('png/logo_32.png', 'chrome/app/theme/default_100_percent/chromium/product_logo_32.png'),
    ('png/logo_32.png', 'chrome/app/theme/default_200_percent/chromium/product_logo_16.png'),
    ('png/logo_64.png', 'chrome/app/theme/default_200_percent/chromium/product_logo_32.png'),
    ('rye.ico', 'chrome/app/theme/chromium/win/chromium.ico'),
    ('png/logo_150.png', 'chrome/app/theme/chromium/win/tiles/Logo.png'),
    ('png/logo_70.png', 'chrome/app/theme/chromium/win/tiles/SmallLogo.png'),
]

# "Chromium" as the product name, but not "The Chromium Authors" credits.
NAME = re.compile(r'(?<!The )\bChromium\b(?! Authors)')
MESSAGE = re.compile(r'(<message\b[^>]*>)(.*?)(</message>)', re.S)
TRANSLATION = re.compile(r'(<translation\b[^>]*>)(.*?)(</translation>)', re.S)


def rename_in(text, pattern):
    count = 0

    def fix(m):
        nonlocal count
        body, n = NAME.subn('Rye', m.group(2))
        count += n
        return m.group(1) + body + m.group(3)

    return pattern.sub(fix, text), count


def read(path):
    with open(path, encoding='utf-8', newline='') as f:
        return f.read()


def write(path, text):
    # Leave identical files alone: a new timestamp makes the build redo
    # everything that depends on them.
    if os.path.exists(path) and read(path) == text:
        return
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(text)


def copy_if_changed(src, dst):
    with open(src, 'rb') as a, open(dst, 'rb') as b:
        if a.read() == b.read():
            return
    shutil.copyfile(src, dst)


def main(argv=None):
    argv = sys.argv if argv is None else argv
    if len(argv) < 2:
        print(__doc__)
        return 2
    src = os.path.abspath(argv[1])
    check = '--check' in argv
    if not os.path.isfile(os.path.join(src, 'chrome', 'app', 'chromium_strings.grd')):
        print(f'{src} does not look like chromium/src (chrome/app/chromium_strings.grd not found).')
        return 1

    # 1. Product name used by the build and the installer.
    branding = os.path.join(src, 'chrome', 'app', 'theme', 'chromium', 'BRANDING')
    print(('would write ' if check else 'writing ') + os.path.relpath(branding, src))
    if not check:
        write(branding, BRANDING)

    # 2. Icons.
    for rel_src, rel_dst in ICONS:
        dst = os.path.join(src, *rel_dst.split('/'))
        if not os.path.exists(dst):
            print(f'  skip (not in this Chromium version): {rel_dst}')
            continue
        print(('  would copy ' if check else '  copy ') + rel_dst)
        if not check:
            copy_if_changed(os.path.join(HERE, 'branding', *rel_src.split('/')), dst)

    # 3. User-visible strings, in English and every translation.
    total = 0
    grd = os.path.join(src, 'chrome', 'app', 'chromium_strings.grd')
    text, n = rename_in(read(grd), MESSAGE)
    total += n
    if not check and n:
        write(grd, text)
    xtb_dir = os.path.join(src, 'chrome', 'app', 'resources')
    for name in sorted(os.listdir(xtb_dir)):
        if name.startswith('chromium_strings_') and name.endswith('.xtb'):
            path = os.path.join(xtb_dir, name)
            text, n = rename_in(read(path), TRANSLATION)
            total += n
            if not check and n:
                write(path, text)
    print(f'{"would rename" if check else "renamed"} {total} mentions of "Chromium" to "Rye" in strings')

    if __name__ == '__main__':
        print('\nDone.' if not check else '\nNothing was changed (--check).')
        if not check:
            print('Rebuild with:  autoninja -C out\\Rye chrome')
    return 0


if __name__ == '__main__':
    sys.exit(main())
