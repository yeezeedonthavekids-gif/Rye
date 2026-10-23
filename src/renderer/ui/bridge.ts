import { useEffect, useState } from 'react';
import type { RyeBridge } from '../../shared/ipc';
import { applyTheme } from '../../shared/theme';
import type { ThemePayload } from '../../shared/types';

declare global {
  interface Window {
    rye: RyeBridge;
  }
}

export const rye: RyeBridge =
  window.rye ??
  ({
    send() {},
    invoke: async () => undefined as any,
    on: () => () => {},
    platform: 'web',
  } as RyeBridge);

/** Applies the theme to this document whenever the main process pushes one. */
export function useThemePayload(channel: string, initial?: () => Promise<ThemePayload>) {
  const [payload, setPayload] = useState<ThemePayload | null>(null);
  useEffect(() => {
    const apply = (p: ThemePayload) => {
      applyTheme(document, p.settings.appearance, p.dark, p.private);
      document.documentElement.dataset.platform = p.platform;
      document.documentElement.dataset.layout = p.settings.appearance.tabLayout;
      setPayload(p);
    };
    const off = rye.on(channel, apply);
    initial?.().then((p) => p && apply(p));
    return off;
  }, [channel]);
  return payload;
}

export function px(name: string, fallback = 0): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
}
