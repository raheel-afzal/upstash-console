import { useState } from 'react'
import type { KeyInfo, RedisKeyType } from '../lib/redis'
import { pipeline } from '../lib/redis'

const VALUE_HINTS: Record<string, string> = {
  string: 'e.g. hello world',
  hash: '{"field":"value","name":"Alice"}',
  list: '["item1","item2","item3"]',
  set: '["a","b","c"]',
  zset: '[{"score":1,"member":"a"},{"score":2,"member":"b"}]',
}

const VALUE_LABELS: Record<string, string> = {
  string: 'Value',
  hash: 'Value (JSON object)',
  list: 'Values (JSON array)',
  set: 'Members (JSON array)',
  zset: 'Members (JSON array of {score, member})',
}

interface Props {
  onCreated: (info: KeyInfo) => void
  onClose: () => void
  onToast: (msg: string, type?: 'ok' | 'err') => void
}

export default function AddKeyDialog({ onCreated, onClose, onToast }: Props) {
  const [key, setKey] = useState('')
  const [type, setType] = useState<RedisKeyType>('string')
  const [val, setVal] = useState('')
  const [ttl, setTtl] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!key.trim()) { onToast('Key name required', 'err'); return }
    setBusy(true)
    try {
      const cmds: (string | number)[][] = []

      if (type === 'string') {
        cmds.push(['SET', key, val])
      } else if (type === 'hash') {
        const obj = JSON.parse(val || '{}')
        const a: (string | number)[] = ['HSET', key]
        Object.entries(obj).forEach(([k, v]) => a.push(k, String(v)))
        cmds.push(a)
      } else if (type === 'list') {
        cmds.push(['RPUSH', key, ...JSON.parse(val || '[]').map(String)])
      } else if (type === 'set') {
        cmds.push(['SADD', key, ...JSON.parse(val || '[]').map(String)])
      } else if (type === 'zset') {
        const arr: { score: number; member: string }[] = JSON.parse(val || '[]')
        arr.forEach(({ score, member }) => cmds.push(['ZADD', key, String(score), String(member)]))
      }

      if (ttl.trim()) cmds.push(['EXPIRE', key, ttl.trim()])
      await pipeline(cmds)

      const [t, ex] = await pipeline([['TYPE', key], ['TTL', key]])
      const info: KeyInfo = { key, type: t as RedisKeyType, ttl: ex }
      onCreated(info)
      onClose()
      onToast('Key created!')
    } catch (e: any) {
      onToast(e.message, 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="add-key-panel">
        <h3>Add New Key</h3>
        <div className="add-field">
          <label>Key name</label>
          <input
            type="text"
            placeholder="e.g. user:1234"
            value={key}
            onChange={e => setKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            autoFocus
          />
        </div>
        <div className="add-field">
          <label>Type</label>
          <select value={type} onChange={e => setType(e.target.value as RedisKeyType)}>
            <option value="string">String</option>
            <option value="hash">Hash</option>
            <option value="list">List</option>
            <option value="set">Set</option>
            <option value="zset">ZSet</option>
          </select>
        </div>
        <div className="add-field">
          <label>{VALUE_LABELS[type]}</label>
          <textarea
            placeholder={VALUE_HINTS[type]}
            value={val}
            onChange={e => setVal(e.target.value)}
          />
        </div>
        <div className="add-field">
          <label>TTL (seconds, optional)</label>
          <input type="number" min={1} placeholder="leave empty = no expiry" value={ttl} onChange={e => setTtl(e.target.value)} />
        </div>
        <div className="add-btns">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button className="btn-create" disabled={busy} onClick={submit}>
            {busy ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </>
  )
}
