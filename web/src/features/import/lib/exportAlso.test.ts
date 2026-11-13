// BR-E (design §11.1, §13): the Export picker's "Also exports Béchamel (Base recipe)". Export adds every Base recipe a selected Recipe
// calls for, transitively, in discovery order (internal/recipefile/export.go), so the picker walks the same graph. Pure; RED until lib/exportAlso.ts exists.
import { describe, expect, it } from 'vitest'
import { alsoExportLabel, alsoExports, type CallGraph } from './exportAlso'

// Lasagne -> Béchamel -> Roux; Moussaka -> Béchamel; Salad -> nothing; Cannelloni -> Béchamel, Pesto
const graph: CallGraph = {
  1: { name: 'Lasagne', calls: [{ id: 10, name: 'Béchamel' }] },
  2: { name: 'Moussaka', calls: [{ id: 10, name: 'Béchamel' }] },
  3: { name: 'Salad', calls: [] },
  4: { name: 'Cannelloni', calls: [{ id: 10, name: 'Béchamel' }, { id: 11, name: 'Pesto' }] },
  10: { name: 'Béchamel', calls: [{ id: 12, name: 'Roux' }] },
  11: { name: 'Pesto', calls: [] },
  12: { name: 'Roux', calls: [] },
}

describe('alsoExports', () => {
  it('is empty when nothing is selected or the Recipes call for no Base recipe', () => {
    expect(alsoExports([], graph)).toEqual([])
    expect(alsoExports([3], graph)).toEqual([])
  })

  it('lists the Base recipes a selected Recipe calls for, transitively (Béchamel, then Roux)', () => {
    expect(alsoExports([1], graph)).toEqual([{ id: 10, name: 'Béchamel' }, { id: 12, name: 'Roux' }])
  })

  it('lists each Base recipe once, breadth first, in the order of the selection', () => {
    expect(alsoExports([2, 4, 1], graph).map((b) => b.name)).toEqual(['Béchamel', 'Pesto', 'Roux'])
  })

  it('leaves out a Base recipe that is itself selected (it is exported anyway)', () => {
    expect(alsoExports([1, 10], graph).map((b) => b.name)).toEqual(['Roux'])
  })

  it('ignores a Recipe the graph does not know yet (still loading)', () => {
    expect(alsoExports([1, 99], graph).map((b) => b.name)).toEqual(['Béchamel', 'Roux'])
  })

  it('does not loop on a cycle', () => {
    const loop: CallGraph = { 1: { name: 'A', calls: [{ id: 2, name: 'B' }] }, 2: { name: 'B', calls: [{ id: 1, name: 'A' }] } }
    expect(alsoExports([1], loop).map((b) => b.name)).toEqual(['B'])
  })

  it('words one line as "Also exports Béchamel (Base recipe)"', () => {
    expect(alsoExportLabel('Béchamel')).toBe('Also exports Béchamel (Base recipe)')
  })
})
