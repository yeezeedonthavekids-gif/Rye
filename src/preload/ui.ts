// Preload for Rye's own UI documents (the browser chrome and the overlay layer).
// Exposes a narrow, channel-filtered bridge; no Node or Electron objects leak.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { UI_CHANNEL, type RyeBridge } from '../shared/ipc';

function check(channel: string) {
  if (typeof channel !== 'string' || !UI_CHANNEL.test(channel)) throw new Error(`Blocked channel: ${channel}`);
}

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
