// Preload attached to every tab. It only exposes a bridge when the document is
// one of Rye's internal rye:// pages; ordinary websites get nothing. The main
// process additionally verifies the sending frame's URL for every call.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { PAGE_CHANNEL, type RyeBridge } from '../shared/ipc';

if (location.protocol === 'rye:' && window.top === window) {
  const check = (channel: string) => {
    if (typeof channel !== 'string' || !PAGE_CHANNEL.test(channel)) throw new Error(`Blocked channel: ${channel}`);
  };
  const bridge: RyeBridge = {
    send(channel, ...args) {
      check(channel);
      ipcRenderer.send(channel, ...args);
    },
    invoke(channel, ...args) {
      check(channel);
      return ipcRenderer.invoke(channel, ...args);
    },
    on(channel, listener) {
      check(channel);
      const wrapped = (_e: IpcRendererEvent, ...args: unknown[]) => listener(...args);
      ipcRenderer.on(channel, wrapped);
      return () => ipcRenderer.removeListener(channel, wrapped);
    },
    platform: process.platform,
  };
  contextBridge.exposeInMainWorld('rye', bridge);
}

// Google refuses sign-in from browsers it identifies as embedded frameworks. On
// its sign-in host, Rye already sends a Firefox user agent (see main/compat.ts);
// here the Chromium-only JavaScript surface is made consistent with it before
// any page script runs. No other site is touched.
if (location.hostname === 'accounts.google.com') {
  contextBridge.executeInMainWorld({
    func: () => {
      const nav = Navigator.prototype as any;
      const fixed = (obj: any, prop: string, value: unknown) => {
        try {
          Object.defineProperty(obj, prop, { get: () => value, configurable: true });
        } catch {
          /* ignore */
        }
      };
      try {
        delete nav.userAgentData;
      } catch {
        /* ignore */
      }
      fixed(nav, 'vendor', '');
      fixed(nav, 'productSub', '20100101');
      fixed(nav, 'webdriver', false);
      try {
        delete (window as any).chrome;
      } catch {
        /* ignore */
      }
    },
  });
}
