// TG-PW: a rule names a Tag by key; the pill takes the Tag's name and colour by that key, and is neutral for a Tag that is gone.
import { describe, expect, it } from 'vitest'
import type { Tag } from '../../../lib/tags'
import { tagPill } from './tagPill'

const tag = (over: Partial<Tag>): Tag => ({ id: 1, name: 'Fish', key: 'fish', colour: 'teal', recipes: 0, slotRules: 0, varietyRule: false, ...over })
const tags = [tag({}), tag({ id: 2, name: 'Fish Pie', key: 'fish pie', colour: 'plum' })]

describe('tagPill', () => {
  it('finds the Tag by key: its name (as spelt) and its colour', () => {
    expect(tagPill(tags, 'fish')).toEqual({ label: 'Fish', colour: 'teal' })
  })

  it('matches by the Tag key rule: case and inner spaces do not matter', () => {
    expect(tagPill(tags, '  FISH   pie ')).toEqual({ label: 'Fish Pie', colour: 'plum' })
  })

  it('a Tag that is gone (or not loaded yet) falls back to the key given, with no colour', () => {
    expect(tagPill(tags, 'soup')).toEqual({ label: 'soup' })
    expect(tagPill([], 'fish')).toEqual({ label: 'fish' })
  })
})
