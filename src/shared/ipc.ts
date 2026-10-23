// Channel allowlists. Each preload only forwards channels matching its own
// pattern, and the main process re-validates the sender of every message.

/** Channels the browser chrome and overlay layer may use. */
export const UI_CHANNEL = /^(ui|tab|nav|win|menu|suggest|tooltip|find|settings|bookmarks|downloads|history|site|zoom|overlay|perm|app):[a-z-]+$/;

/** Channels internal rye:// pages may use. Never exposed to web content. */
export const PAGE_CHANNEL = /^(page|settings|bookmarks|history|downloads|site|ntp|app|data|ext):[a-z-]+$/;

export interface RyeBridge {
  send(channel: string, ...args: unknown[]): void;
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>;
  on(channel: string, listener: (...args: any[]) => void): () => void;
  platform: string;
}
