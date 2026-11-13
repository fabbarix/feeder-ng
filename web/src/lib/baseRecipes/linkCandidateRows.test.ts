import { describe, expect, it } from 'vitest'
import { linkCandidateRows, linkHeading, linkLabel, linkedToast, tickedLineIds, toggleTick } from './linkCandidateRows'
import type { LinkCandidate } from './types'

const cand = (over: Partial<LinkCandidate>): LinkCandidate => ({
  lineId: 1, recipeId: 10, recipeName: 'Lasagne', archived: false, ingredientId: 5, ingredientName: 'béchamel', quantity: 500, unit: 'ml', linkable: true, reason: '', ...over,
})
const lines = [
  cand({ lineId: 1, recipeId: 10, recipeName: 'Cannelloni', quantity: 2, unit: 'cup', linkable: false, reason: 'unit_unconvertible' }),
  cand({ lineId: 2, recipeId: 11, recipeName: 'Lasagne' }),
  cand({ lineId: 3, recipeId: 12, recipeName: 'Moussaka', archived: true, quantity: 300 }),
  cand({ lineId: 4, recipeId: 13, recipeName: 'Roux pie', linkable: false, reason: 'cycle' }),
]
const ctx = { baseName: 'Béchamel', baseUnit: 'ml' }

describe('linkCandidateRows (design §3.8)', () => {
  it('lists each Recipe with its line, in the server order, with nothing ticked at first', () => {
    const rows = linkCandidateRows(lines, ctx, new Set())
    expect(rows.map((r) => r.label)).toEqual(['Cannelloni · 2 cup béchamel', 'Lasagne · 500 ml béchamel', 'Moussaka · 300 ml béchamel', 'Roux pie · 500 ml béchamel'])
    expect(rows.every((r) => !r.checked)).toBe(true)
  })
  it('disables the unconvertible and the cycle rows with their reasons', () => {
    const rows = linkCandidateRows(lines, ctx, new Set())
    expect(rows[0]).toMatchObject({ disabled: true, reason: 'cup cannot be converted to ml yet: link it from Cannelloni' })
    expect(rows[3]).toMatchObject({ disabled: true, reason: 'Béchamel already calls for Roux pie' })
    expect(rows[1]).toMatchObject({ disabled: false })
    expect(rows[1]?.reason).toBeUndefined()
  })
  it('keeps archived Recipes listed and flags them', () => {
    expect(linkCandidateRows(lines, ctx, new Set())[2]).toMatchObject({ archived: true, disabled: false })
  })
  it('checks the ticked rows, but never a disabled one', () => {
    const rows = linkCandidateRows(lines, ctx, new Set([1, 2]))
    expect(rows.map((r) => r.checked)).toEqual([false, true, false, false])
  })
})

describe('headings, counts and toggling', () => {
  it('words the heading for several Recipes and for one', () => {
    expect(linkHeading(3, 'béchamel')).toBe('3 Recipes use an Ingredient named béchamel. Link them to this Base recipe?')
    expect(linkHeading(1, 'béchamel')).toBe('1 Recipe uses an Ingredient named béchamel. Link it to this Base recipe?')
  })
  it('labels the button "Link" with nothing ticked and "Link 2" with two', () => {
    expect(linkLabel(0)).toBe('Link')
    expect(linkLabel(2)).toBe('Link 2')
  })
  it('words the toast by distinct Recipes', () => {
    expect(linkedToast(2)).toBe('Linked 2 Recipes')
    expect(linkedToast(1)).toBe('Linked 1 Recipe')
  })
  it('toggles a tick on and off without mutating, and ignores a disabled row', () => {
    const rows = linkCandidateRows(lines, ctx, new Set())
    const first = new Set<number>()
    const on = toggleTick(first, 2, rows)
    expect([...on]).toEqual([2])
    expect(first.size).toBe(0)
    expect([...toggleTick(on, 2, rows)]).toEqual([])
    expect([...toggleTick(on, 1, rows)]).toEqual([2])
    expect([...toggleTick(on, 99, rows)]).toEqual([2])
  })
  it('lists the ticked line ids in row order', () => {
    const rows = linkCandidateRows(lines, ctx, new Set([3, 2]))
    expect(tickedLineIds(rows)).toEqual([2, 3])
  })
})
