// B9-32 (PC-06): which chips a row's chip line shows. Whole chips only, in priority order; the rest is counted in "+N"; a Leftover
// chip is never cut (it goes first when it would be hidden); only a lone chip wider than the whole line may be cut.
// `widths[i]` is the natural width of chips[i] in px; `available` the line's width; defaults: gap 4 px, the "+N" chip 36 px.
// TEST-AUTHOR tests: fitChips is a stub that throws.
import { describe, expect, it } from 'vitest'
import { fitChips, type RowChip } from './rowChips'

const chip = (label: string, over: Partial<RowChip> = {}): RowChip => ({ key: `k:${label}`, kind: 'why', label, ...over })
const leftover = (label: string): RowChip => chip(label, { kind: 'status', status: 'leftover' })
const labels = (cs: RowChip[]) => cs.map((c) => c.label)

describe('fitChips', () => {
  it('nothing in, nothing out', () => {
    expect(fitChips([], [], 300)).toEqual({ shown: [], more: null, cut: false })
  })

  it('every chip that fits whole is shown, and there is no "+N"', () => {
    const r = fitChips([chip('A'), chip('B'), chip('C')], [80, 80, 80], 400)
    expect(labels(r.shown)).toEqual(['A', 'B', 'C'])
    expect(r.more).toBeNull()
    expect(r.cut).toBe(false)
  })

  it('exactly full: three chips of 80 and two gaps of 4 fit in 248', () => {
    expect(fitChips([chip('A'), chip('B'), chip('C')], [80, 80, 80], 248).more).toBeNull()
    expect(fitChips([chip('A'), chip('B'), chip('C')], [80, 80, 80], 247).more).not.toBeNull()
  })

  it('what does not fit is counted in "+N", and the "+N" chip itself needs room (36 px and a gap)', () => {
    const chips = [chip('A'), chip('B'), chip('C')]
    // two chips are 164 wide; with "+1" that is 204.
    const fits = fitChips(chips, [80, 80, 80], 204)
    expect(labels(fits.shown)).toEqual(['A', 'B'])
    expect(fits.more).toEqual({ label: '+1', title: 'C', count: 1 })
    // 203 is one px short: only the first chip stays, with "+2".
    const tight = fitChips(chips, [80, 80, 80], 203)
    expect(labels(tight.shown)).toEqual(['A'])
    expect(tight.more).toEqual({ label: '+2', title: 'B, C', count: 2 })
  })

  it('never shows half a chip: no shown chip is cut when more than one chip is there', () => {
    const r = fitChips([chip('Anna and Ben’s favourite'), chip('Again soon: had Sat')], [150, 120], 200)
    expect(r.cut).toBe(false)
    expect(labels(r.shown)).toEqual(['Anna and Ben’s favourite'])
    expect(r.more?.label).toBe('+1')
  })

  it('the "+N" names the hidden chips by their labels, in order', () => {
    const r = fitChips(['A', 'B', 'C', 'D', 'E'].map((l) => chip(l)), [100, 100, 100, 100, 100], 150)
    expect(r.more).toEqual({ label: '+4', title: 'B, C, D, E', count: 4 })
  })

  it('a Leftover chip that would be hidden goes first, and the other chip becomes "+1"', () => {
    const r = fitChips([chip('A'), chip('B'), leftover('Leftover from Sat')], [100, 100, 100], 250)
    expect(labels(r.shown)).toEqual(['Leftover from Sat', 'A'])
    expect(r.more).toEqual({ label: '+1', title: 'B', count: 1 })
  })

  it('a Leftover chip that already shows keeps its place', () => {
    const r = fitChips([leftover('Leftover from Sat'), chip('A'), chip('B')], [100, 100, 100], 250)
    expect(labels(r.shown)).toEqual(['Leftover from Sat', 'A'])
    expect(r.more?.title).toBe('B')
  })

  it('"Leftover for" (the outlined one) is a Leftover chip too', () => {
    const r = fitChips([chip('A'), chip('B'), chip('Leftover for Fri', { kind: 'status', status: 'leftover', outline: true })], [100, 100, 100], 250)
    expect(r.shown[0]!.label).toBe('Leftover for Fri')
  })

  it('a lone chip wider than the whole line is shown and marked cut (it may end in an ellipsis)', () => {
    const r = fitChips([chip('A very long reason that does not fit the row at all')], [500], 300)
    expect(labels(r.shown)).toEqual(['A very long reason that does not fit the row at all'])
    expect(r.more).toBeNull()
    expect(r.cut).toBe(true)
  })

  it('a lone chip that fits is not cut', () => {
    expect(fitChips([chip('A')], [300], 300).cut).toBe(false)
  })

  it('a line of zero width shows the first chip cut rather than nothing (the row is not measured yet)', () => {
    const r = fitChips([chip('A'), chip('B')], [80, 80], 0)
    expect(labels(r.shown)).toEqual(['A'])
    expect(r.cut).toBe(true)
  })

  it('takes the gap and the "+N" width as options', () => {
    const chips = [chip('A'), chip('B'), chip('C')]
    expect(fitChips(chips, [80, 80, 80], 240, { gap: 0 }).more).toBeNull()
    expect(labels(fitChips(chips, [80, 80, 80], 130, { gap: 0, moreWidth: 50 }).shown)).toEqual(['A'])
  })

  it('never changes its input', () => {
    const chips = [chip('A'), chip('B'), leftover('Leftover from Sat')]
    const copy = [...chips]
    fitChips(chips, [100, 100, 100], 250)
    expect(chips).toEqual(copy)
  })
})
