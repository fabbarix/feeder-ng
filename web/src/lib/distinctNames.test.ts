import { describe, expect, it } from 'vitest'
import { distinctNames } from './distinctNames'

describe('distinctNames (B9-55, P38)', () => {
  const items = [
    { id: 1, name: 'Stew', time: '3 h' },
    { id: 2, name: 'Soup', time: '30 min' },
    { id: 3, name: 'Stew', time: '8 h' },
  ]
  it('a name of its own stays as it is; a shared one adds the fact that tells them apart', () => {
    const m = distinctNames(items, (i) => i.time)
    expect([...m.entries()]).toEqual([[1, 'Stew, 3 h'], [3, 'Stew, 8 h'], [2, 'Soup']])
  })
  it('with no fact, or facts that do not differ, the place among them: "Stew, 1 of 2"', () => {
    expect(distinctNames(items).get(3)).toBe('Stew, 2 of 2')
    expect(distinctNames(items, () => 'same').get(1)).toBe('Stew, 1 of 2')
  })
})
