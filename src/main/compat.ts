// Site compatibility. Google refuses sign-in from browsers it identifies as an
// embedded framework (Electron), so on its sign-in host only, Rye presents a
// Firefox identity — the approach other Electron-based browsers use.

const SIGN_IN_HOSTS = new Set(['accounts.google.com']);
// Lets the automated tests exercise this path against a local server.
if (process.env.RYE_TEST && process.env.RYE_COMPAT_HOST) SIGN_IN_HOSTS.add(process.env.RYE_COMPAT_HOST);

export function needsCompatUA(url: string): boolean {
  try {
    return SIGN_IN_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function compatUserAgent(): string {
  const os =
    process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10.15' : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${os}; rv:140.0) Gecko/20100101 Firefox/140.0`;
}
