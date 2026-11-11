// nextColour: the same table as Go's tag.NextColour (tg-plan 4.3). The first ten Tags differ; colours repeat from the eleventh.
import { describe, expect, it } from 'vitest'
import { colourCounts, nextColour } from './nextColour'
import { REFERENCE_PALETTE } from './palette.fixture'

const IDS = REFERENCE_PALETTE.map((r) => r.id)
const allAt = (n: number) => Object.fromEntries(IDS.map((id) => [id, n]))

describe('nextColour', () => {
  it('no Tags: tomato', () => expect(nextColour({})).toBe('tomato'))
  it('tomato has one: apricot', () => expect(nextColour({ tomato: 1 })).toBe('apricot'))
  it('the first ten Tags get ten different colours, in palette order', () => {
    const counts: Record<string, number> = {}
    const got = IDS.map(() => {
      const next = nextColour(counts)
      counts[next] = (counts[next] ?? 0) + 1
      return next
    })
    expect(got).toEqual(IDS)
  })
  it('all ten at one: back to tomato (colours repeat after 10)', () => expect(nextColour(allAt(1))).toBe('tomato'))
  it('the eleventh and twelfth Tags are tomato and apricot', () => {
    const counts: Record<string, number> = allAt(1)
    const eleventh = nextColour(counts)
    counts[eleventh] = (counts[eleventh] ?? 0) + 1
    expect([eleventh, nextColour(counts)]).toEqual(['tomato', 'apricot'])
  })
  it('all at two but rose at one: rose', () => expect(nextColour({ ...allAt(2), rose: 1 })).toBe('rose'))
  it('ties go to the first in palette order', () => expect(nextColour({ ...allAt(3), sage: 1, plum: 1 })).toBe('sage'))
  it('a colour absent from the counts counts as zero', () => expect(nextColour({ ...allAt(1), olive: undefined as unknown as number })).toBe('olive'))
  it('ids outside the palette in the counts are ignored', () => {
    expect(nextColour({ tomato: 1, chartreuse: 5 })).toBe('apricot')
    expect(nextColour({ chartreuse: 0 })).toBe('tomato')
  })
})

describe('colourCounts', () => {
  it('counts Tags per colour, unknown ids under their own key', () => {
    expect(colourCounts([{ colour: 'sage' }, { colour: 'sage' }, { colour: 'rose' }, { colour: 'chartreuse' }])).toEqual({ sage: 2, rose: 1, chartreuse: 1 })
    expect(colourCounts([])).toEqual({})
  })
  it('feeds nextColour', () => {
    expect(nextColour(colourCounts([{ colour: 'tomato' }, { colour: 'apricot' }]))).toBe('mustard')
  })
})
