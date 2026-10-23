import type { TabState } from '../../shared/types';
import { hostOf } from '../../shared/url';
import { rye } from '../ui/bridge';
import { Icon } from '../ui/Icon';

interface Copy {
  icon: string;
  title: string;
  body: string;
}

function describe(code: number, host: string, description: string): Copy {
  if (description === 'crashed') return { icon: 'warning', title: 'This tab stopped working', body: 'Something went wrong while displaying this page. Reloading usually fixes it.' };
  if (description === 'unresponsive') return { icon: 'gauge', title: 'This page isn’t responding', body: 'You can wait for it to recover or reload it.' };
  if (code === -106) return { icon: 'wifi-off', title: 'You’re offline', body: 'Check your network connection, then try again.' };
  if (code === -105 || code === -137) return { icon: 'globe', title: `Can’t find ${host || 'this site'}`, body: 'Check the address for typos. If it’s correct, the site may be down or your DNS may be unavailable.' };
  if (code <= -200 && code > -300) return { icon: 'shield-alert', title: 'This connection isn’t private', body: `${host || 'This site'} presented a certificate Rye can’t trust. Someone could be trying to intercept your information.` };
  if (code === -310) return { icon: 'rotate-cw', title: 'Too many redirects', body: `${host || 'This site'} redirected too many times. Clearing its cookies can help.` };
  if (code === -102) return { icon: 'unplug', title: `${host || 'This site'} refused to connect`, body: 'The server is reachable but isn’t accepting connections.' };
  if (code === -118 || code === -7) return { icon: 'clock', title: `${host || 'This site'} took too long to respond`, body: 'The server may be busy or unreachable from your network.' };
  if (code === -101 || code === -100 || code === -21) return { icon: 'unplug', title: 'The connection was interrupted', body: 'The connection was reset before the page finished loading.' };
  if (code === -6) return { icon: 'file', title: 'File not found', body: 'It may have been moved, renamed or deleted.' };
  if (code === -10) return { icon: 'ban', title: 'Access denied', body: 'Rye doesn’t have permission to open this resource.' };
  if (code === -300 || code === -301 || code === -302) return { icon: 'alert', title: 'This address isn’t valid', body: 'Rye can’t open this kind of link.' };
  return { icon: 'alert', title: 'This page isn’t available', body: `Rye couldn’t load ${host || 'the page'}.` };
}

export function ErrorView({ tab }: { tab: TabState }) {
  const err = tab.error;
  if (!err) return null;
  const host = hostOf(err.url);
  const copy = describe(err.code, host, err.description);
  const cert = err.code <= -200 && err.code > -300;
  const crash = err.description === 'crashed' || err.description === 'unresponsive';
  return (
    <div className="error-view" role="alert">
      <div className="error-card">
        <div className="error-icon">
          <Icon name={copy.icon} size={22} />
        </div>
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        {err.upgraded && !cert && (
          <p className="error-note">
            Rye tried a secure connection first. If this site only supports HTTP, you can continue without encryption.
          </p>
        )}
        <div className="error-actions">
          {cert ? (
            <button type="button" className="btn primary" onClick={() => rye.send('nav:command', 'back')} disabled={!tab.canGoBack}>
              Go back to safety
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={() => rye.send('nav:command', 'reload')}>
              {tab.loading ? <span className="spinner light" /> : <Icon name="rotate-cw" size={15} />}
              {crash ? 'Reload' : 'Try again'}
            </button>
          )}
          {err.upgraded && !cert && (
            <button type="button" className="btn ghost" onClick={() => rye.send('nav:http-fallback')}>
              Continue with HTTP
            </button>
          )}
        </div>
        {cert && (
          <button type="button" className="btn link error-proceed" onClick={() => rye.send('nav:cert-proceed')}>
            Proceed to {host} anyway (unsafe)
          </button>
        )}
        {!crash && <div className="error-code">{err.description || `Error ${err.code}`}</div>}
      </div>
    </div>
  );
}
