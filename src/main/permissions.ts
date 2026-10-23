import { EventEmitter } from 'node:events';
import type { SitePermission } from '../shared/types';
import { JsonStore } from './store';

/** Permissions Rye asks about. Anything not listed is denied unless it is in AUTO_ALLOW. */
export const PROMPTED: Record<string, string> = {
  media: 'Use your camera or microphone',
  'media:video': 'Use your camera',
  'media:audio': 'Use your microphone',
  geolocation: 'Know your location',
  notifications: 'Show notifications',
  midi: 'Use MIDI devices',
  midiSysex: 'Control MIDI devices',
  'clipboard-read': 'See text and images on your clipboard',
  'display-capture': 'Share your screen',
  idleDetection: 'Know when you are actively using this device',
  'storage-access': 'Use cookies and site data while embedded on other sites',
  'top-level-storage-access': 'Use cookies and site data across sites',
  openExternal: 'Open an external application',
  hid: 'Connect to HID devices',
  serial: 'Connect to serial ports',
  usb: 'Connect to USB devices',
};

export const PERMISSION_LABELS: Record<string, string> = {
  media: 'Camera & microphone',
  'media:video': 'Camera',
  'media:audio': 'Microphone',
  geolocation: 'Location',
  notifications: 'Notifications',
  midi: 'MIDI',
  midiSysex: 'MIDI control',
  'clipboard-read': 'Clipboard',
  'display-capture': 'Screen sharing',
  idleDetection: 'Idle detection',
  'storage-access': 'Embedded storage',
  'top-level-storage-access': 'Cross-site storage',
  openExternal: 'External apps',
  hid: 'HID devices',
  serial: 'Serial ports',
  usb: 'USB devices',
  fullscreen: 'Full screen',
  pointerLock: 'Mouse lock',
  'clipboard-sanitized-write': 'Copy to clipboard',
};

/** Harmless capabilities granted without a prompt, as other browsers do. */
export const AUTO_ALLOW = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'keyboardLock', 'window-management', 'speaker-selection']);

class PermissionService extends EventEmitter {
  private store = new JsonStore<{ decisions: SitePermission[] }>('permissions', () => ({ decisions: [] }), (raw) => ({
    decisions: Array.isArray(raw?.decisions) ? raw.decisions.filter((d: any) => d && typeof d.origin === 'string' && (d.decision === 'allow' || d.decision === 'block')) : [],
  }));

  get(origin: string, permission: string): 'allow' | 'block' | undefined {
    return this.store.data.decisions.find((d) => d.origin === origin && d.permission === permission)?.decision;
  }

  set(origin: string, permission: string, decision: 'allow' | 'block' | 'ask') {
    const list = this.store.data.decisions.filter((d) => !(d.origin === origin && d.permission === permission));
    if (decision !== 'ask') list.push({ origin, permission, decision });
    this.store.data.decisions = list;
    this.store.save();
    this.emit('change');
  }

  forOrigin(origin: string): SitePermission[] {
    return this.store.data.decisions.filter((d) => d.origin === origin);
  }

  all(): SitePermission[] {
    return this.store.data.decisions;
  }

  clearOrigin(origin: string) {
    this.store.data.decisions = this.store.data.decisions.filter((d) => d.origin !== origin);
    this.store.save();
    this.emit('change');
  }

  clearAll() {
    this.store.data.decisions = [];
    this.store.save();
    this.emit('change');
  }

  flush() {
    this.store.flush();
  }
}

export const permissions = new PermissionService();
