// B9-50 (SSP-08): the review's state with the existing-Product Add and the truthful Accept all. Pure.
//   acceptableCount(proposals): the rows that need no choice (every kind but an Add and Not on the receipt): the N of "Accept all N".
//   An AddDraft with `productId` > 0 is complete on its own (no Ingredient, name or pack size); it is sent as { id, productId } and nothing else.
import { describe, expect, it } from 'vitest'
import { allProposals, FINGERPRINT, READ_ID, UUIDS, add0, add1, completeDraft, missing5, price0, readDone } from '../fixtures.test-helper'
import type { AddDraft } from '../types'
import { acceptableCount, addProblems, buildApplyBody, initialReview, isAddComplete, isChecked, setAdd, toggle } from './reviewState'

const productDraft = (productId: number): AddDraft => ({ ingredient: null, productName: '', packSize: 0, productId })
const proposals = readDone().proposals
const base = { readId: READ_ID, fingerprint: FINGERPRINT, clientUuids: UUIDS }

describe('acceptableCount', () => {
  it('counts every row that needs no choice, checked or not', () => {
    expect(acceptableCount(proposals)).toBe(6) // price x3, weight, quantity, pack size
    expect(acceptableCount(allProposals)).toBe(9) // and shop, date and a name correction
  })
  it('does not count an Add or Not on the receipt', () => {
    expect(acceptableCount([add0, add1, missing5])).toBe(0)
  })
  it('is 0 for no proposals', () => {
    expect(acceptableCount([])).toBe(0)
  })
  it('one row is one', () => {
    expect(acceptableCount([price0, add0])).toBe(1)
  })
})

describe('an Add of an existing Product', () => {
  it('is complete with a Product id and nothing else', () => {
    expect(isAddComplete(productDraft(77))).toBe(true)
    expect(addProblems(productDraft(77))).toEqual([])
  })
  it('a Product id of 0 or less is not a Product', () => {
    expect(isAddComplete(productDraft(0))).toBe(false)
    expect(isAddComplete(productDraft(-3))).toBe(false)
  })
  it('saving it checks the row, and the row can be unchecked and checked again', () => {
    let state = setAdd(initialReview(proposals), 'add:0', productDraft(77))
    expect(isChecked(state, add0)).toBe(true)
    state = toggle(state, 'add:0')
    expect(isChecked(state, add0)).toBe(false)
    state = toggle(state, 'add:0')
    expect(isChecked(state, add0)).toBe(true)
  })
  it('goes to the apply as { id, productId }, with no Ingredient, name, pack size or scope', () => {
    const state = setAdd(initialReview(proposals), 'add:0', productDraft(77))
    const body = buildApplyBody({ ...base, proposals, state })
    expect(body.accept.map((a) => a.id)).toContain('add:0')
    expect(body.adds).toEqual([{ id: 'add:0', productId: 77 }])
  })
  it('sits beside a new-Product Add of another line', () => {
    let state = setAdd(initialReview(proposals), 'add:0', productDraft(77))
    state = setAdd(state, 'add:1', { ...completeDraft, productName: 'Bananas' })
    const body = buildApplyBody({ ...base, proposals, state })
    expect(body.adds).toEqual([
      { id: 'add:0', productId: 77 },
      { id: 'add:1', ingredient: { id: 31 }, productName: 'Bananas', packSize: 450 },
    ])
  })
  it('a Product id wins over the other fields of the same draft', () => {
    const state = setAdd(initialReview(proposals), 'add:0', { ...completeDraft, productId: 77 })
    expect(buildApplyBody({ ...base, proposals, state }).adds).toEqual([{ id: 'add:0', productId: 77 }])
  })
})
