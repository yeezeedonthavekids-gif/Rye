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
