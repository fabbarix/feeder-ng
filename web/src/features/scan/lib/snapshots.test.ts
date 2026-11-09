import { describe, expect, it } from 'vitest'
import { createMemorySnapshotStore, snapshotKeys } from './snapshots'

describe('createMemorySnapshotStore', () => {
  it('stores, reads and deletes values', async () => {
    const s = createMemorySnapshotStore()
    expect(await s.get('a')).toBeUndefined()
    await s.set('a', { n: 1 })
    expect(await s.get('a')).toEqual({ n: 1 })
    await s.set('a', { n: 2 })
    expect(await s.get('a')).toEqual({ n: 2 })
    await s.delete('a')
    expect(await s.get('a')).toBeUndefined()
  })

  it('hands out copies, so a caller cannot change what is stored', async () => {
    const s = createMemorySnapshotStore()
    const value = { list: [1, 2] }
    await s.set('a', value)
    value.list.push(3)
    const read = await s.get<{ list: number[] }>('a')
    read?.list.push(4)
    expect(await s.get('a')).toEqual({ list: [1, 2] })
  })
})

describe('snapshotKeys', () => {
  it('keys lists by Shop and range and bundles by Shop', () => {
    expect(snapshotKeys.list(2, '2026-11-15')).toBe('list:2:2026-11-15')
    expect(snapshotKeys.list(null, '2026-11-15')).toBe('list:home:2026-11-15')
    expect(snapshotKeys.bundle(2)).toBe('bundle:2')
    expect(snapshotKeys.bundle(null)).toBe('bundle:home')
  })
})
