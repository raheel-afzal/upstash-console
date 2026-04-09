import { useEffect, useState, useRef, useCallback } from 'react'
import type { KeyInfo } from '../lib/redis'
import { getValue as fetchValue, redis, saveValue as redisSave } from '../lib/redis'

interface Props {
  keyInfo: KeyInfo | null
  onDeleted: (key: string) => void
  onUpdated: (key: string, info: Partial<KeyInfo>) => void
  onToast: (msg: string, type?: 'ok' | 'err') => void
}

export default function KeyDetail({ keyInfo, onDeleted, onUpdated, onToast }: Props) {
  const [loading, setLoading] = useState(false)
  const [value, setValue] = useState<any>(null)
  const [editorText, setEditorText] = useState('')
  const [ttlEdit, setTtlEdit] = useState(false)
  const [ttlInput, setTtlInput] = useState('')
  const [view, setView] = useState<'table' | 'json'>('table')
  const prevKey = useRef<string | null>(null)
  const TreeNode = useCallback(({ label, value: nodeVal, depth = 0 }: { label: string; value: any; depth?: number }) => {
    const [open, setOpen] = useState(depth < 2)
    const isObj = nodeVal !== null && typeof nodeVal === 'object' && !Array.isArray(nodeVal)
    const isArr = Array.isArray(nodeVal)
    const isExpandable = isObj || isArr

    if (!isExpandable) {
      const display = nodeVal === null ? 'null' : nodeVal === undefined ? 'undefined' : String(nodeVal)
      const isLong = display.length > 120
      return (
        <div className="tree-row">
          <span className="tree-key">{label}</span>
          <span className={`tree-val ${isLong ? 'tree-val-long' : ''}`}>{display}</span>
        </div>
      )
    }

    const entries = isArr
      ? nodeVal.map((v: any, i: number) => [`[${i}]`, v] as [string, any])
      : Object.entries(nodeVal)
    const count = entries.length
    const typeLabel = isArr ? `Array(${count})` : `Object(${count})`

    return (
      <div className={`tree-node depth-${Math.min(depth, 4)}`}>
        <button className="tree-toggle" onClick={() => setOpen(o => !o)}>
          <svg className={`tree-chevron ${open ? 'open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 6 6 6-6 6" /></svg>
          <span className="tree-key">{label}</span>
          <span className="tree-type-badge">{typeLabel}</span>
        </button>
        {open && (
          <div className="tree-children">
            {entries.map(([k, v]: [string, any]) => (
              <TreeNode key={k} label={k} value={v} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }, [])

  useEffect(() => {
    if (!keyInfo) return
    if (prevKey.current === keyInfo.key) return
    prevKey.current = keyInfo.key
    setView('table')
    setTtlEdit(false)
    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        const val = await fetchValue(keyInfo.key, keyInfo.type)
        if (cancelled) return
        setValue(val)
        setEditorText(
          keyInfo.type === 'string' ? String(val ?? '') : JSON.stringify(val, null, 2),
        )
        const ttl = await redis(['TTL', keyInfo.key])
        if (!cancelled) onUpdated(keyInfo.key, { ttl })
      } catch (e: any) {
        if (!cancelled) onToast(e.message, 'err')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [keyInfo?.key])

  if (!keyInfo) {
    return (
      <div className="detail">
        <div className="detail-empty">
          <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path d="M20 13V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7" />
            <path d="M4 17c0 1.1 3.58 2 8 2s8-.9 8-2" />
            <ellipse cx="12" cy="17" rx="8" ry="2" />
          </svg>
          <p>Select a key to view its value</p>
        </div>
      </div>
    )
  }

  const { key, type, ttl } = keyInfo
  const ttlStr = ttl === -1 ? 'No TTL' : ttl === -2 ? 'Expired' : `${ttl}s`

  const byteSize = typeof value === 'string'
    ? new Blob([value]).size
    : value ? new Blob([JSON.stringify(value)]).size : 0

  const getHashEntries = (input: any): [string, string][] => {
    if (!input) return []
    if (Array.isArray(input)) {
      const pairs: [string, string][] = []
      for (let i = 0; i < input.length; i += 2) {
        const field = input[i]
        const fieldValue = input[i + 1]
        if (field === undefined) continue
        pairs.push([String(field), fieldValue === undefined ? '' : String(fieldValue)])
      }
      return pairs
    }
    if (typeof input === 'object') {
      return Object.entries(input).map(([field, fieldValue]) => [field, String(fieldValue)])
    }
    return []
  }

  const hashEntries = type === 'hash' ? getHashEntries(value) : []

  const parseNestedJson = (input: any, depth = 0): any => {
    if (depth > 8 || input === null || input === undefined) return input

    if (typeof input === 'string') {
      const trimmed = input.trim()
      if (!trimmed) return input
      const startsLikeJson =
        trimmed.startsWith('{') ||
        trimmed.startsWith('[') ||
        trimmed.startsWith('"')
      if (!startsLikeJson) return input
      try {
        const parsed = JSON.parse(trimmed)
        if (parsed === input) return input
        return parseNestedJson(parsed, depth + 1)
      } catch {
        return input
      }
    }

    if (Array.isArray(input)) {
      return input.map(item => parseNestedJson(item, depth + 1))
    }

    if (typeof input === 'object') {
      const out: Record<string, any> = {}
      for (const [k, v] of Object.entries(input)) out[k] = parseNestedJson(v, depth + 1)
      return out
    }

    return input
  }

  const length = typeof value === 'string'
    ? value.length
    : type === 'hash' ? hashEntries.length
    : Array.isArray(value) ? value.length
    : value ? Object.keys(value).length : 0

  const handleDelete = async () => {
    if (!confirm(`Delete "${key}"?`)) return
    try {
      await redis(['DEL', key])
      onDeleted(key)
      onToast(`Deleted: ${key}`)
    } catch (e: any) {
      onToast(e.message, 'err')
    }
  }

  const handleSave = async () => {
    try {
      await redisSave(key, type, editorText, ttl > 0 ? ttl : -1)
      onToast('Saved successfully')
      prevKey.current = null
    } catch (e: any) {
      onToast(e.message, 'err')
    }
  }

  const handleTtl = async () => {
    const v = parseInt(ttlInput)
    if (isNaN(v)) { onToast('Enter a valid number', 'err'); return }
    try {
      if (v === -1) await redis(['PERSIST', key])
      else await redis(['EXPIRE', key, v])
      onUpdated(key, { ttl: v })
      setTtlEdit(false)
      onToast('TTL updated')
    } catch (e: any) {
      onToast(e.message, 'err')
    }
  }

  const renderHashTable = () => {
    if (type !== 'hash') return null
    if (!hashEntries.length) return <div className="loading-row">No hash fields found.</div>
    return (
      <div className="tree-root">
        {hashEntries.map(([field, fieldValue]) => (
          <TreeNode key={field} label={field} value={parseNestedJson(fieldValue)} depth={0} />
        ))}
      </div>
    )
  }

  const renderTable = () => {
    if (type === 'string') {
      const parsed = parseNestedJson(value)
      const isStructured = parsed !== null && typeof parsed === 'object'
      if (isStructured) {
        const entries = Array.isArray(parsed)
          ? parsed.map((v: any, i: number) => [`[${i}]`, v] as [string, any])
          : Object.entries(parsed)
        return (
          <div className="tree-root">
            {entries.map(([k, v]: [string, any]) => (
              <TreeNode key={k} label={k} value={v} depth={0} />
            ))}
          </div>
        )
      }
      return (
        <div className="tree-root">
          <TreeNode label="value" value={String(value ?? '')} depth={0} />
        </div>
      )
    }
    if (type === 'hash') return renderHashTable()
    if ((type === 'list' || type === 'set') && Array.isArray(value)) {
      return (
        <div className="tree-root">
          {value.map((v, i) => (
            <TreeNode key={i} label={`[${i}]`} value={parseNestedJson(v)} depth={0} />
          ))}
        </div>
      )
    }
    if (type === 'zset' && Array.isArray(value)) {
      const pairs: [string, string][] = []
      for (let i = 0; i < value.length; i += 2) pairs.push([value[i], value[i + 1]])
      return (
        <div className="tree-root">
          {pairs.map(([m, s], i) => (
            <div key={i} className="tree-row">
              <span className="tree-key">{m}</span>
              <span className="tree-val tree-score">{s}</span>
            </div>
          ))}
        </div>
      )
    }
    return null
  }

  const hasTable = true

  return (
    <div className="detail">
      <div className="detail-inner">
        <div className="detail-header">
          <div className="detail-key-name">{key}</div>
          <div className="detail-meta">
            <span className={`meta-badge ${type}`}>{type.toUpperCase()}</span>
            <span className="meta-tag">Size: {byteSize} B</span>
            <span className="meta-tag">Length: {length}</span>

            {!ttlEdit ? (
              <button className="ttl-tag" onClick={() => { setTtlEdit(true); setTtlInput(ttl > 0 ? String(ttl) : '') }}>
                TTL: {ttlStr}
                <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
              </button>
            ) : (
              <div className="ttl-edit">
                <input
                  type="number"
                  min={-1}
                  value={ttlInput}
                  onChange={e => setTtlInput(e.target.value)}
                  placeholder="seconds or -1"
                  onKeyDown={e => e.key === 'Enter' && handleTtl()}
                />
                <button className="apply-btn" onClick={handleTtl}>Apply</button>
                <button className="cancel-btn" onClick={() => setTtlEdit(false)}>✕</button>
              </div>
            )}

            <div className="detail-actions">
              <button className="btn-del" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="loading-row"><span className="spinner" /> Loading value...</div>
        ) : (
          <div className="detail-body">
            {hasTable && (
              <div className="view-tabs">
                <button className={`view-tab ${view === 'table' ? 'active' : ''}`} onClick={() => setView('table')}>Table</button>
                <button className={`view-tab ${view === 'json' ? 'active' : ''}`} onClick={() => setView('json')}>JSON Editor</button>
              </div>
            )}

            {(!hasTable || view === 'json') && (
              <div className="value-area">
                <textarea
                  className="value-textarea"
                  value={editorText}
                  onChange={e => setEditorText(e.target.value)}
                />
              </div>
            )}

            {hasTable && view === 'table' && <div className="table-area">{renderTable()}</div>}
          </div>
        )}

        <div className="detail-footer">
          <button className="btn-save" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}
