// tagKey: the same table as Go's tag.NameKey (internal/tag/tag_test.go) and courseNameKey.
import { describe, expect, it } from 'vitest'
import { courseNameKey } from '../courses'
import { tagKey } from './keys'

const TABLE: [string, string][] = [
  ['fish', 'fish'],
  ['Fish', 'fish'],
  ['  Fish   Pie ', 'fish pie'],
  ['FISH\tPIE\n', 'fish pie'],
  ['Purée', 'purée'],
  ['Puree', 'puree'],
  ['', ''],
  ['   ', ''],
]

describe('tagKey', () => {
  it.each(TABLE)('%j -> %j', (name, key) => expect(tagKey(name)).toBe(key))
  it('counts accents: "Purée" and "Puree" are two Tags', () => expect(tagKey('Purée')).not.toBe(tagKey('Puree')))
  it('is the same rule as courseNameKey', () => {
    for (const [name] of TABLE) expect(tagKey(name)).toBe(courseNameKey(name))
  })
  it('is idempotent', () => {
    for (const [name] of TABLE) expect(tagKey(tagKey(name))).toBe(tagKey(name))
  })
})
