import { useMemo, useState } from 'react'
import type { KeyInfo, KeyGroup } from '../lib/redis'
import { groupKeys } from '../lib/redis'

const TYPE_ABBR: Record<string, string> = { string: 'S', hash: 'H', list: 'L', set: 'SE', zset: 'Z' }

interface Props {
  allKeys: KeyInfo[]
  activeKey: string | null
  onSelectKey: (key: string) => void
  onRefresh: () => void
  onShowAddKey: () => void
}

export default function Sidebar({ allKeys, activeKey, onSelectKey, onRefresh, onShowAddKey }: Props) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [selectedPrefix, setSelectedPrefix] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return allKeys.filter(k => {
      if (typeFilter && k.type !== typeFilter) return false
      if (q && !k.key.toLowerCase().includes(q)) return false
      return true
    })
  }, [allKeys, search, typeFilter])

  const groups: KeyGroup[] = useMemo(() => groupKeys(filtered), [filtered])

  const effectiveSelectedPrefix = useMemo(() => {
    if (selectedPrefix && groups.some(g => g.prefix === selectedPrefix)) return selectedPrefix
    if (!groups.length) return null
    return groups[0].prefix
  }, [groups, selectedPrefix])

  const selectedGroup = groups.find(g => g.prefix === effectiveSelectedPrefix) ?? null

  const typeCounts = (keys: KeyInfo[]): Record<string, number> => {
    const counts: Record<string, number> = {}
    for (const k of keys) counts[k.type] = (counts[k.type] || 0) + 1
    return counts
  }

  return (
    <div className="sidebar">
      <div className="sidebar-top">
        <div className="filter-row">
          <select
            className="type-select"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
          >
            <option value="">All Types</option>
            <option value="string">String</option>
            <option value="hash">Hash</option>
            <option value="list">List</option>
            <option value="set">Set</option>
            <option value="zset">ZSet</option>
          </select>
          <div className="search-wrap">
            <svg className="search-icon" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Filter keys..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="scan-info">
          <span className="scan-count">
            {filtered.length !== allKeys.length
              ? `${filtered.length} / ${allKeys.length} keys`
              : `${allKeys.length} keys`}
            {groups.length > 0 && ` · ${groups.length} groups`}
          </span>
          <div className="scan-actions">
            <button className="btn-sm btn-icon" onClick={onRefresh} title="Reload all keys">
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M8 16H3v5" />
              </svg>
            </button>
            <button className="btn-sm btn-add" onClick={onShowAddKey}>+ Key</button>
          </div>
        </div>
      </div>

      <div className="sidebar-list">
        {groups.length === 0 && (
          <div className="sidebar-empty">
            {allKeys.length ? 'No keys match filter' : 'No keys found'}
          </div>
        )}
        {groups.length > 0 && (
          <div className="sidebar-panels">
            <div className="prefix-panel">
              {groups.map(g => {
                const counts = typeCounts(g.keys)
                const isActive = g.prefix === effectiveSelectedPrefix
                return (
                  <button
                    key={g.prefix}
                    className={`group-header ${isActive ? 'active' : ''}`}
                    onClick={() => setSelectedPrefix(g.prefix)}
                  >
                    <span className="group-name">{g.prefix}</span>
                    <span className="group-count">{g.keys.length}</span>
                    <span className="group-types">
                      {Object.entries(counts).map(([t, c]) => (
                        <span key={t} className={`type-micro ${t}`}>{TYPE_ABBR[t]}{c}</span>
                      ))}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="keys-panel">
              {selectedGroup ? (
                <>
                  <div className="keys-panel-header">
                    <span className="keys-panel-title">{selectedGroup.prefix}</span>
                    <span className="keys-panel-count">{selectedGroup.keys.length} keys</span>
                  </div>
                  <div className="keys-panel-list">
                    {selectedGroup.keys.map(k => (
                      <div
                        key={k.key}
                        className={`key-item ${activeKey === k.key ? 'active' : ''}`}
                        onClick={() => onSelectKey(k.key)}
                      >
                        <div className={`type-icon ${k.type}`}>{TYPE_ABBR[k.type]}</div>
                        <span className="key-item-name" title={k.key}>{k.key}</span>
                        <span className="key-item-arrow">›</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="sidebar-empty">Select a prefix</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
