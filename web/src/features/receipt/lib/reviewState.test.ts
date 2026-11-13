// RR4: the review's pure state (docs/design/receipt-reading.md 3.4, 7.2). No React, no DOM.
// Pinned API of ./reviewState:
//   initialReview(proposals): ReviewState                       checked = proposal.checked && !proposal.needsInput; no drafts
//   toggle(state, id): ReviewState                              flips a row; an Add without a complete draft stays unchecked
//   setAdd(state, id, draft): ReviewState                       stores the draft; a complete one checks the row, an incomplete one unchecks it
//   addProblems(draft | undefined): AddProblem[]               [] when complete; else 'ingredient' | 'productName' | 'packSize' in that order
//   isAddComplete(draft | undefined): boolean
//   acceptAll(state, proposals) / clearAll(state)               accept all never checks "missing" and never checks an incomplete Add
//   allAccepted(state, proposals): boolean                      every acceptable (not add, not missing) row is checked: the button then reads "Clear all"
//   isChecked(state, proposal): boolean                         checked and, for an Add, complete
//   applyCount(state, proposals): number                        the N of "Apply N changes"
//   buildApplyBody({readId, fingerprint, clientUuids, proposals, state}): ApplyBody
//   buildSections(proposals): ReviewSection[]                   fixed order, empty sections left out
import { describe, expect, it } from 'vitest'
import {
  acceptAll, addProblems, allAccepted, applyCount, buildApplyBody, buildSections, clearAll, initialReview, isAddComplete, isChecked, setAdd, toggle,
} from './reviewState'
import {
  add0, add1, allProposals, completeDraft, date, missing5, name0, newIngredientDraft, packSize1, price0, price1, price2, quantity4, readDone, shop, weight3,
} from '../fixtures.test-helper'

const proposals = readDone().proposals

describe('initialReview', () => {
  it('checks Prices, Weighed Products and Quantities and nothing else (the user answer)', () => {
    const s = initialReview(allProposals)
    const checked = Object.keys(s.checked).filter((id) => s.checked[id])
    expect(checked.sort()).toEqual(['price:0', 'price:1', 'price:2', 'quantity:4', 'weight:3'])
  })
  it('leaves Corrections, Shop and date, Adds and Not on the receipt unchecked', () => {
    const s = initialReview(allProposals)
    for (const id of ['shop', 'date', 'name:0', 'pack_size:1', 'add:0', 'add:1', 'missing:5']) expect(s.checked[id] ?? false).toBe(false)
  })
  it('never checks a proposal that needs input, even if the server flagged it', () => {
    const s = initialReview([{ ...add0, checked: true }])
    expect(s.checked['add:0'] ?? false).toBe(false)
  })
  it('starts with no Add drafts', () => {
    expect(initialReview(proposals).adds).toEqual({})
  })
})

describe('toggle', () => {
  it('flips a row and is pure', () => {
    const a = initialReview(proposals)
    const b = toggle(a, 'price:0')
    expect(b.checked['price:0']).toBe(false)
    expect(a.checked['price:0']).toBe(true)
    expect(toggle(b, 'price:0').checked['price:0']).toBe(true)
  })
  it('checks an unchecked Correction', () => {
    expect(toggle(initialReview(proposals), 'pack_size:1').checked['pack_size:1']).toBe(true)
  })
  it('checks and unchecks Not on the receipt (Remove)', () => {
    const s = toggle(initialReview(proposals), 'missing:5')
    expect(isChecked(s, missing5)).toBe(true)
    expect(isChecked(toggle(s, 'missing:5'), missing5)).toBe(false)
  })
  it('does not check an Add that has no complete draft', () => {
    const s = toggle(initialReview(proposals), 'add:0')
    expect(isChecked(s, add0)).toBe(false)
  })
  it('does check an Add whose draft is complete, and unchecks it again', () => {
    let s = setAdd(initialReview(proposals), 'add:0', completeDraft)
    s = toggle(s, 'add:0')
    expect(isChecked(s, add0)).toBe(false)
    s = toggle(s, 'add:0')
    expect(isChecked(s, add0)).toBe(true)
  })
})

describe('Add drafts', () => {
  it('addProblems names what is missing, in order', () => {
    expect(addProblems(undefined)).toEqual(['ingredient', 'productName', 'packSize'])
    expect(addProblems({ ingredient: null, productName: '', packSize: 0 })).toEqual(['ingredient', 'productName', 'packSize'])
    expect(addProblems({ ingredient: { id: 3 }, productName: '  ', packSize: 450 })).toEqual(['productName'])
    expect(addProblems({ ingredient: { id: 3 }, productName: 'Pane', packSize: 0 })).toEqual(['packSize'])
    expect(addProblems({ ingredient: { id: 3 }, productName: 'Pane', packSize: -1 })).toEqual(['packSize'])
    expect(addProblems({ ingredient: { id: 3 }, productName: 'Pane', packSize: 4.5 })).toEqual(['packSize'])
  })
  it('a new Ingredient needs a name', () => {
    expect(addProblems({ ingredient: { name: ' ', baseUnit: 'g', kind: 'food' }, productName: 'Pane', packSize: 450 })).toEqual(['ingredient'])
    expect(addProblems(newIngredientDraft)).toEqual([])
  })
  it('an existing Ingredient needs a real id', () => {
    expect(addProblems({ ingredient: { id: 0 }, productName: 'Pane', packSize: 450 })).toEqual(['ingredient'])
    expect(addProblems(completeDraft)).toEqual([])
  })
  it('isAddComplete mirrors addProblems', () => {
    expect(isAddComplete(completeDraft)).toBe(true)
    expect(isAddComplete(undefined)).toBe(false)
    expect(isAddComplete({ ...completeDraft, productName: '' })).toBe(false)
  })
  it('a complete draft checks the row ("once filled the row is checked")', () => {
    const s = setAdd(initialReview(proposals), 'add:0', completeDraft)
    expect(s.adds['add:0']).toEqual(completeDraft)
    expect(isChecked(s, add0)).toBe(true)
  })
  it('an incomplete draft is kept but unchecks the row', () => {
    let s = setAdd(initialReview(proposals), 'add:0', completeDraft)
    s = setAdd(s, 'add:0', { ...completeDraft, productName: '' })
    expect(s.adds['add:0']?.productName).toBe('')
    expect(isChecked(s, add0)).toBe(false)
  })
  it('isChecked needs a complete draft for an Add even if the flag is set', () => {
    const s = { checked: { 'add:0': true }, adds: {} }
    expect(isChecked(s, add0)).toBe(false)
  })
})

describe('acceptAll and clearAll', () => {
  it('acceptAll checks Corrections and Shop and date too, but never Not on the receipt', () => {
    const s = acceptAll(initialReview(allProposals), allProposals)
    for (const p of [shop, date, price0, price1, price2, weight3, quantity4, name0, packSize1]) expect(isChecked(s, p)).toBe(true)
    expect(isChecked(s, missing5)).toBe(false)
  })
  it('acceptAll leaves Adds waiting for their form', () => {
    const s = acceptAll(initialReview(allProposals), allProposals)
    expect(isChecked(s, add0)).toBe(false)
    expect(isChecked(s, add1)).toBe(false)
  })
  it('acceptAll keeps a completed Add as the User left it', () => {
    const s = acceptAll(setAdd(initialReview(allProposals), 'add:0', completeDraft), allProposals)
    expect(isChecked(s, add0)).toBe(true)
  })
  it('acceptAll does not drop a checked Not on the receipt row', () => {
    const s = acceptAll(toggle(initialReview(allProposals), 'missing:5'), allProposals)
    expect(isChecked(s, missing5)).toBe(true)
  })
  it('clearAll unchecks every row but keeps the Add drafts', () => {
    const s = clearAll(setAdd(initialReview(allProposals), 'add:0', completeDraft))
    expect(applyCount(s, allProposals)).toBe(0)
    expect(s.adds['add:0']).toEqual(completeDraft)
  })
  it('allAccepted is true when every row that needs no choice is checked (the button reads "Clear all")', () => {
    expect(allAccepted(initialReview(allProposals), allProposals)).toBe(false) // Corrections are unchecked
    expect(allAccepted(acceptAll(initialReview(allProposals), allProposals), allProposals)).toBe(true)
    expect(allAccepted(clearAll(initialReview(allProposals)), allProposals)).toBe(false)
  })
  it('allAccepted ignores Adds and Not on the receipt', () => {
    const only = [price0, add0, missing5]
    expect(allAccepted(initialReview(only), only)).toBe(true)
  })
  it('allAccepted is false when there is nothing to accept', () => {
    expect(allAccepted(initialReview([add0, missing5]), [add0, missing5])).toBe(false)
  })
})

describe('applyCount', () => {
  it('counts the checked rows (the default is 5 on the mock-up receipt)', () => {
    expect(applyCount(initialReview(proposals), proposals)).toBe(5)
  })
  it('counts an Add only once it is complete', () => {
    let s = toggle(initialReview(proposals), 'add:0')
    expect(applyCount(s, proposals)).toBe(5)
    s = setAdd(s, 'add:0', { ...completeDraft, packSize: 0 })
    expect(applyCount(s, proposals)).toBe(5)
    s = setAdd(s, 'add:0', completeDraft)
    expect(applyCount(s, proposals)).toBe(6)
  })
  it('counts a checked Remove', () => {
    expect(applyCount(toggle(initialReview(proposals), 'missing:5'), proposals)).toBe(6)
  })
  it('ignores checked ids that are not proposals', () => {
    expect(applyCount({ checked: { 'price:99': true }, adds: {} }, proposals)).toBe(0)
  })
})

describe('buildApplyBody', () => {
  const base = { readId: 'rd-1', fingerprint: 'fp-abc', clientUuids: ['u1', 'u2'] }
  it('sends the checked ids in review order, with the phone\'s current uuids', () => {
    const body = buildApplyBody({ ...base, proposals, state: initialReview(proposals) })
    expect(body).toEqual({
      readId: 'rd-1', fingerprint: 'fp-abc', clientUuids: ['u1', 'u2'],
      accept: [{ id: 'price:0' }, { id: 'price:1' }, { id: 'price:2' }, { id: 'weight:3' }, { id: 'quantity:4' }],
      adds: [],
    })
  })
  it('has accept and adds as arrays even when nothing is checked', () => {
    const body = buildApplyBody({ ...base, proposals, state: clearAll(initialReview(proposals)) })
    expect(body.accept).toEqual([])
    expect(body.adds).toEqual([])
  })
  it('sends a complete Add in accept and in adds, with an existing Ingredient as {id}', () => {
    const state = setAdd(initialReview(proposals), 'add:0', completeDraft)
    const body = buildApplyBody({ ...base, proposals, state })
    expect(body.accept.map((a) => a.id)).toContain('add:0')
    expect(body.adds).toEqual([{ id: 'add:0', ingredient: { id: 31 }, productName: 'Pane casereccio', packSize: 450 }])
  })
  it('sends a new Ingredient as {name, baseUnit, kind} and passes the scope on', () => {
    const state = setAdd(initialReview(proposals), 'add:1', newIngredientDraft)
    const body = buildApplyBody({ ...base, proposals, state })
    expect(body.adds).toEqual([
      { id: 'add:1', ingredient: { name: 'Bananas', baseUnit: 'g', kind: 'food' }, productName: 'Bananas', packSize: 1000, scope: 'shop' },
    ])
  })
  it('trims the Product name', () => {
    const state = setAdd(initialReview(proposals), 'add:0', { ...completeDraft, productName: '  Pane  ' })
    expect(buildApplyBody({ ...base, proposals, state }).adds[0]?.productName).toBe('Pane')
  })
  it('never sends an incomplete Add, nor a draft of an unchecked Add', () => {
    let state = setAdd(initialReview(proposals), 'add:0', { ...completeDraft, productName: '' })
    state = setAdd(state, 'add:1', newIngredientDraft)
    state = toggle(state, 'add:1') // unchecked again
    const body = buildApplyBody({ ...base, proposals, state })
    expect(body.accept.map((a) => a.id)).not.toContain('add:0')
    expect(body.accept.map((a) => a.id)).not.toContain('add:1')
    expect(body.adds).toEqual([])
  })
  it('sends each id once, and the id count equals applyCount', () => {
    const state = acceptAll(setAdd(initialReview(proposals), 'add:0', completeDraft), proposals)
    const body = buildApplyBody({ ...base, proposals, state })
    expect(new Set(body.accept.map((a) => a.id)).size).toBe(body.accept.length)
    expect(body.accept).toHaveLength(applyCount(state, proposals))
  })
})

describe('buildSections', () => {
  it('groups by kind in the review order and leaves empty sections out', () => {
    const sections = buildSections(allProposals)
    expect(sections.map((s) => s.id)).toEqual(['shopDate', 'prices', 'weighed', 'quantities', 'corrections', 'notScanned', 'notOnReceipt'])
    expect(sections.map((s) => s.title)).toEqual(['Shop and date', 'Prices', 'Weighed Products', 'Quantities', 'Corrections', 'Not scanned', 'Not on the receipt'])
  })
  it('puts shop and date together, pack size and name together', () => {
    const sections = buildSections(allProposals)
    expect(sections[0]?.proposals.map((p) => p.id)).toEqual(['shop', 'date'])
    expect(sections.find((s) => s.id === 'corrections')?.proposals.map((p) => p.id)).toEqual(['name:0', 'pack_size:1'])
  })
  it('keeps the proposals of a section in the order given', () => {
    expect(buildSections([price2, price0, price1])[0]?.proposals.map((p) => p.id)).toEqual(['price:2', 'price:0', 'price:1'])
  })
  it('has no sections for no proposals', () => {
    expect(buildSections([])).toEqual([])
  })
  it('omits the sections the read has nothing for', () => {
    expect(buildSections([price0, missing5]).map((s) => s.id)).toEqual(['prices', 'notOnReceipt'])
  })
})
