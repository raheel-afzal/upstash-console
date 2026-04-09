import { useState, useCallback, useRef } from 'react'
import { configure, redis, scanAll } from './lib/redis'
import type { KeyInfo, ScanProgress } from './lib/redis'
import SetupScreen from './components/SetupScreen'
import LoadingScreen from './components/LoadingScreen'
import Sidebar from './components/Sidebar'
import KeyDetail from './components/KeyDetail'
import AddKeyDialog from './components/AddKeyDialog'

export default function App() {
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [allKeys, setAllKeys] = useState<KeyInfo[]>([])
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }, [])

  const doScan = useCallback(async () => {
    setLoading(true)
    setActiveKey(null)
    try {
      const keys = await scanAll(setProgress)
      setAllKeys(keys)
    } catch (e: any) {
      showToast(e.message, 'err')
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }, [showToast])

  const handleConnect = useCallback(async (url: string, token: string) => {
    configure(url, token)
    await redis(['PING'])
    setConnected(true)
    doScan()
  }, [doScan])

  const handleDisconnect = useCallback(() => {
    setConnected(false)
    setAllKeys([])
    setActiveKey(null)
    setLoading(false)
    setProgress(null)
  }, [])

  const activeKeyInfo = allKeys.find(k => k.key === activeKey) ?? null

  const handleKeyDeleted = useCallback((key: string) => {
    setAllKeys(prev => prev.filter(k => k.key !== key))
    setActiveKey(null)
  }, [])

  const handleKeyUpdated = useCallback((key: string, info: Partial<KeyInfo>) => {
    setAllKeys(prev => prev.map(k => k.key === key ? { ...k, ...info } : k))
  }, [])

  const handleKeyCreated = useCallback((info: KeyInfo) => {
    setAllKeys(prev => [info, ...prev.filter(k => k.key !== info.key)])
    setActiveKey(info.key)
  }, [])

  if (!connected) {
    return <SetupScreen onConnect={handleConnect} />
  }

  if (loading && progress) {
    return <LoadingScreen progress={progress} />
  }

  return (
    <div className="app-shell">
      <nav className="topnav">
        <div className="nav-brand">
          <div className="dot">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z" />
              <path d="M2 12h20" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </div>
          <span>Redis Admin</span>
        </div>
        <div className="nav-tabs">
          <button className="nav-tab active">
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            Data Browser
          </button>
        </div>
        <div className="nav-right">
          <div className="conn-dot" />
          <span className="conn-label">Connected · {allKeys.length} keys</span>
          <button className="btn-sm" onClick={handleDisconnect}>Disconnect</button>
        </div>
      </nav>

      <div className="main">
        <Sidebar
          allKeys={allKeys}
          activeKey={activeKey}
          onSelectKey={setActiveKey}
          onRefresh={doScan}
          onShowAddKey={() => setShowAdd(true)}
        />
        <KeyDetail
          keyInfo={activeKeyInfo}
          onDeleted={handleKeyDeleted}
          onUpdated={handleKeyUpdated}
          onToast={showToast}
        />
      </div>

      {showAdd && (
        <AddKeyDialog
          onCreated={handleKeyCreated}
          onClose={() => setShowAdd(false)}
          onToast={showToast}
        />
      )}

      <div className={`toast ${toast ? 'show' : ''} ${toast?.type ?? ''}`}>
        {toast?.msg}
      </div>
    </div>
  )
}
