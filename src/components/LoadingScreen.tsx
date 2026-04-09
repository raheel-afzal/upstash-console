import type { ScanProgress } from '../lib/redis'

interface Props {
  progress: ScanProgress
}

export default function LoadingScreen({ progress }: Props) {
  const { phase, keysFound, totalEstimate, metaFetched } = progress

  const scanPct = totalEstimate > 0
    ? Math.min(100, Math.round((keysFound / totalEstimate) * 100))
    : 0

  const metaPct = keysFound > 0
    ? Math.round((metaFetched / keysFound) * 100)
    : 0

  return (
    <div className="loading-screen">
      <div className="loading-card">
        <div className="loading-icon">
          <div className="spinner-lg" />
        </div>
        <h2>Loading your database</h2>
        <p className="loading-sub">Scanning all keys and fetching metadata...</p>

        <div className="progress-section">
          <div className="progress-row">
            <div className="progress-label">
              <span className={`phase-dot ${phase === 'scanning' ? 'active' : phase === 'fetching-meta' || phase === 'done' ? 'done' : ''}`} />
              <span>Scanning keys</span>
            </div>
            <span className="progress-value">
              {keysFound.toLocaleString()}
              {totalEstimate > 0 && ` / ~${totalEstimate.toLocaleString()}`}
            </span>
          </div>
          <div className="progress-bar">
            <div
              className={`progress-fill ${phase !== 'scanning' ? 'complete' : ''}`}
              style={{ width: phase === 'scanning' ? `${scanPct}%` : '100%' }}
            />
          </div>
        </div>

        <div className="progress-section">
          <div className="progress-row">
            <div className="progress-label">
              <span className={`phase-dot ${phase === 'fetching-meta' ? 'active' : phase === 'done' ? 'done' : ''}`} />
              <span>Fetching metadata</span>
            </div>
            <span className="progress-value">
              {phase === 'scanning'
                ? 'Waiting...'
                : `${metaFetched.toLocaleString()} / ${keysFound.toLocaleString()}`}
            </span>
          </div>
          <div className="progress-bar">
            <div
              className={`progress-fill ${phase === 'done' ? 'complete' : ''}`}
              style={{ width: phase === 'fetching-meta' || phase === 'done' ? `${metaPct}%` : '0%' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
