// B9-47 (TB-08, TB-04): one vocabulary on Today and the board. The board's strings never say "Tonight" (the hero's heading is Today's eyebrow)
// and never write a lowercase "use by". The board's own new copy: the Close control and its Use by.
import { describe, expect, it } from 'vitest'
import { boardStrings } from './strings'

const values = (o: unknown): string[] =>
  typeof o === 'string' ? [o] : typeof o === 'function' ? [String((o as (...a: never[]) => unknown)(1 as never, 'Tue' as never))] : o && typeof o === 'object' ? Object.values(o).flatMap(values) : []

describe('boardStrings (guard of TB-08)', () => {
  it('no string says Tonight, whatever its case', () => {
    expect(values(boardStrings).filter((v) => /tonight/i.test(v))).toEqual([])
  })
  it('no string says a lowercase "use by" (Today\'s words are "Use by Tue")', () => {
    expect(values(boardStrings).filter((v) => /use by/.test(v))).toEqual([])
  })
  it('useBy(when) is "Use by <when>"', () => {
    expect(boardStrings.useBy('Tue')).toBe('Use by Tue')
  })
  it('the Close control is named "Close kitchen board" (TB-04)', () => {
    expect(boardStrings.close).toBe('Close kitchen board')
  })
  it('the hero\'s Course list is named "Courses", not "Tonight\'s Courses"', () => {
    expect(boardStrings.courses).toBe('Courses')
  })
  it('keeps the words the chapters did not change', () => {
    expect(boardStrings.nextAdvance).toBe('Next Advance Step')
    expect(boardStrings.documentTitle).toBe('Kitchen board')
    expect(boardStrings.streakDays(0)).toBe('0 days')
    expect(boardStrings.loadError).toBe('The kitchen board could not be loaded')
  })
})
