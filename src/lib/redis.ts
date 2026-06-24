export type RedisKeyType = 'string' | 'hash' | 'list' | 'set' | 'zset'

export interface KeyInfo {
  key: string
  type: RedisKeyType
  ttl: number
}

export interface ScanProgress {
  phase: 'scanning' | 'fetching-meta' | 'done'
  keysFound: number
  totalEstimate: number
  metaFetched: number
}

export interface KeyGroup {
  prefix: string
  keys: KeyInfo[]
}

let apiUrl = ''
let apiToken = ''

export function configure(url: string, token: string) {
  apiUrl = url.replace(/\/$/, '')
  apiToken = token
}

export async function redis(cmd: (string | number)[]): Promise<any> {
  const r = await fetch(
    apiUrl + '/' + cmd.map(c => encodeURIComponent(String(c))).join('/'),
    { headers: { Authorization: 'Bearer ' + apiToken } },
  )
  if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + (await r.text()))
  const d = await r.json()
  if (d.error) throw new Error(d.error)
  return d.result
}

export async function pipeline(cmds: (string | number)[][]): Promise<any[]> {
  if (!cmds.length) return []
  const r = await fetch(apiUrl + '/pipeline', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cmds),
  })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  const d = await r.json()
  return d.map((x: any) => x.result)
}

export async function scanAll(
  onProgress: (progress: ScanProgress) => void,
): Promise<KeyInfo[]> {
  const totalEstimate: number = await redis(['DBSIZE'])
  onProgress({ phase: 'scanning', keysFound: 0, totalEstimate, metaFetched: 0 })

  let cursor = '0'
  const keys: string[] = []
  do {
    const res = await redis(['SCAN', cursor, 'MATCH', '*', 'COUNT', '1000'])
    const next = res[0]
    const batch: string[] = res[1] || []
    keys.push(...batch)
    cursor = String(next)
    onProgress({ phase: 'scanning', keysFound: keys.length, totalEstimate, metaFetched: 0 })
  } while (cursor !== '0')

  const uniqueKeys = [...new Set(keys)]

  onProgress({ phase: 'fetching-meta', keysFound: uniqueKeys.length, totalEstimate, metaFetched: 0 })

  const keyInfos: KeyInfo[] = []
  const BATCH = 100
  for (let i = 0; i < uniqueKeys.length; i += BATCH) {
    const batch = uniqueKeys.slice(i, i + BATCH)
    const [types, ttls] = await Promise.all([
      pipeline(batch.map(k => ['TYPE', k])),
      pipeline(batch.map(k => ['TTL', k])),
    ])
    batch.forEach((k, j) => {
      keyInfos.push({ key: k, type: types[j] as RedisKeyType, ttl: ttls[j] })
    })
    onProgress({
      phase: 'fetching-meta',
      keysFound: uniqueKeys.length,
      totalEstimate,
      metaFetched: Math.min(i + BATCH, uniqueKeys.length),
    })
  }

  onProgress({ phase: 'done', keysFound: keyInfos.length, totalEstimate, metaFetched: keyInfos.length })
  return keyInfos
}

export function groupKeys(keys: KeyInfo[]): KeyGroup[] {
  const groups = new Map<string, KeyInfo[]>()
  for (const k of keys) {
    const idx = k.key.indexOf(':')
    const prefix = idx > 0 ? k.key.substring(0, idx) : ''
    if (!groups.has(prefix)) groups.set(prefix, [])
    groups.get(prefix)!.push(k)
  }
  return Array.from(groups.entries())
    .sort((a, b) => {
      if (a[0] === '') return 1
      if (b[0] === '') return -1
      return a[0].localeCompare(b[0])
    })
    .map(([prefix, gkeys]) => ({
      prefix: prefix || '(ungrouped)',
      keys: gkeys.sort((a, b) => a.key.localeCompare(b.key)),
    }))
}

export async function getValue(key: string, type: RedisKeyType): Promise<any> {
  switch (type) {
    case 'string': return redis(['GET', key])
    case 'hash': return redis(['HGETALL', key])
    case 'list': return redis(['LRANGE', key, '0', '-1'])
    case 'set': return redis(['SMEMBERS', key])
    case 'zset': return redis(['ZRANGE', key, '0', '-1', 'WITHSCORES'])
    default: return redis(['GET', key])
  }
}

export async function saveValue(
  key: string,
  type: RedisKeyType,
  raw: string,
  ttl: number,
): Promise<void> {
  const cmds: (string | number)[][] = []

  if (type === 'string') {
    cmds.push(['SET', key, raw])
  } else if (type === 'hash') {
    const obj = JSON.parse(raw)
    cmds.push(['DEL', key])
    const hset: (string | number)[] = ['HSET', key]
    for (const [f, v] of Object.entries(obj)) hset.push(f, String(v))
    cmds.push(hset)
  } else if (type === 'list') {
    const arr: string[] = JSON.parse(raw)
    cmds.push(['DEL', key])
    cmds.push(['RPUSH', key, ...arr.map(String)])
  } else if (type === 'set') {
    const arr: string[] = JSON.parse(raw)
    cmds.push(['DEL', key])
    cmds.push(['SADD', key, ...arr.map(String)])
  } else if (type === 'zset') {
    const arr: any[] = JSON.parse(raw)
    cmds.push(['DEL', key])
    const zadd: (string | number)[] = ['ZADD', key]
    for (let i = 0; i < arr.length; i += 2) zadd.push(arr[i + 1], arr[i])
    cmds.push(zadd)
  }

  if (ttl > 0) cmds.push(['EXPIRE', key, ttl])
  await pipeline(cmds)
}
