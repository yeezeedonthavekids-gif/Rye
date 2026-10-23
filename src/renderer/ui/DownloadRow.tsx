import type { DownloadEntry } from '../../shared/types';
import { formatBytes, formatEta } from './components';
import { Icon } from './Icon';

function statusLine(e: DownloadEntry & { exists?: boolean }) {
  if (e.state === 'progressing') {
    const size = e.total ? `${formatBytes(e.received)} of ${formatBytes(e.total)}` : formatBytes(e.received);
    if (!e.speed) return size;
    const eta = e.total ? formatEta((e.total - e.received) / e.speed) : '';
    return [size, `${formatBytes(e.speed)}/s`, eta].filter(Boolean).join(' · ');
  }
  if (e.state === 'paused') return `Paused · ${formatBytes(e.received)}${e.total ? ` of ${formatBytes(e.total)}` : ''}`;
  if (e.state === 'completed') return e.exists === false ? 'Deleted' : formatBytes(e.total || e.received);
  if (e.state === 'cancelled') return 'Cancelled';
  return 'Failed';
}

export function DownloadRow({ e, onAction }: { e: DownloadEntry & { exists?: boolean }; onAction: (id: string, action: string) => void }) {
  const active = e.state === 'progressing' || e.state === 'paused';
  const pct = e.total ? Math.min(100, (e.received / e.total) * 100) : 0;
  const done = e.state === 'completed' && e.exists !== false;
  return (
    <div className="dl-row" data-state={e.state}>
      <button type="button" className="dl-main" disabled={!done} onClick={() => onAction(e.id, 'open')} title={done ? 'Open file' : undefined}>
        <span className="dl-file">
          <Icon name="file" size={16} />
        </span>
        <span className="dl-text">
          <span className="dl-name">{e.filename}</span>
          <span className="dl-status">{statusLine(e)}</span>
          {active && (
            <span className="dl-bar">
              <span style={{ width: e.total ? `${pct}%` : '30%' }} data-indeterminate={!e.total} />
            </span>
          )}
        </span>
      </button>
      <div className="dl-actions">
        {e.state === 'progressing' && (
          <button type="button" className="icon-btn sm" title="Pause" onClick={() => onAction(e.id, 'pause')}>
            <Icon name="pause" size={14} />
          </button>
        )}
        {e.state === 'paused' && (
          <button type="button" className="icon-btn sm" title="Resume" onClick={() => onAction(e.id, 'resume')}>
            <Icon name="play" size={14} />
          </button>
        )}
        {active && (
          <button type="button" className="icon-btn sm" title="Cancel" onClick={() => onAction(e.id, 'cancel')}>
            <Icon name="x" size={14} />
          </button>
        )}
        {done && (
          <button type="button" className="icon-btn sm" title="Show in folder" onClick={() => onAction(e.id, 'show')}>
            <Icon name="folder" size={14} />
          </button>
        )}
        {!active && (
          <button type="button" className="icon-btn sm" title="Remove from list" onClick={() => onAction(e.id, 'remove')}>
            <Icon name="trash" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

