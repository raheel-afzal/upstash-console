import { useState } from 'react'

interface Props {
  onConnect: (url: string, token: string) => Promise<void>
}

export default function SetupScreen({ onConnect }: Props) {
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!url.trim() || !token.trim()) { setError('Fill in both fields'); return }
    setLoading(true)
    setError('')
    try {
      await onConnect(url.trim(), token.trim())
    } catch (e: any) {
      setError(e.message || 'Connection failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="setup">
      <div className="setup-card">
        <div className="setup-logo">
          <div className="dot">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z" />
              <path d="M2 12h20" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </div>
          <span>Redis Admin</span>
        </div>
        <h2>Connect to Upstash</h2>
        <p>Enter your REST API credentials to get started</p>
        <div className="field">
          <label>REST API URL</label>
          <input
            type="text"
            placeholder="https://your-db.upstash.io"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
        </div>
        <div className="field">
          <label>REST API Token</label>
          <input
            type="password"
            placeholder="Your token..."
            value={token}
            onChange={e => setToken(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
        </div>
        {error && <div className="setup-error">{error}</div>}
        <button className="btn-connect" disabled={loading} onClick={submit}>
          {loading ? 'Connecting...' : 'Connect'}
        </button>
      </div>
    </div>
  )
}
