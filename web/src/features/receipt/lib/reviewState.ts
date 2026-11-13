// The Receipt review's pure state (docs/design/receipt-reading.md 3.4, 7.2). No React, no DOM.
import type { AddDraft, AddIngredient, AddProblem, ApplyAdd, ApplyBody, Proposal, ProposalKind, ReviewSection, ReviewState, SectionId } from '../types'
import { receiptStrings as t } from '../strings'

const isAddId = (id: string) => id.startsWith('add:')

/** The kinds the review sorts into sections, in the order they show. */
const SECTION_OF: Record<ProposalKind, SectionId> = {
  shop: 'shopDate',
  date: 'shopDate',
  price: 'prices',
  weight: 'weighed',
  quantity: 'quantities',
  name: 'corrections',
  pack_size: 'corrections',
  add: 'notScanned',
  missing: 'notOnReceipt',
}
const SECTION_ORDER: SectionId[] = ['shopDate', 'prices', 'weighed', 'quantities', 'corrections', 'notScanned', 'notOnReceipt']

/** Prices, Weighed Products and Quantities are checked; Adds need their form; the rest is the User's choice. */
export function initialReview(proposals: Proposal[]): ReviewState {
  const checked: Record<string, boolean> = {}
  for (const p of proposals) if (p.checked && !p.needsInput) checked[p.id] = true
  return { checked, adds: {} }
}

function ingredientOk(ingredient: AddIngredient | null): boolean {
  if (!ingredient) return false
  if ('id' in ingredient) return Number.isInteger(ingredient.id) && ingredient.id > 0
  return ingredient.name.trim() !== ''
}

/** What a draft still lacks, in the order the form asks for it. [] when it is complete. */
export function addProblems(draft: AddDraft | undefined): AddProblem[] {
  if (!draft) return ['ingredient', 'productName', 'packSize']
  const out: AddProblem[] = []
  if (!ingredientOk(draft.ingredient)) out.push('ingredient')
  if (draft.productName.trim() === '') out.push('productName')
  if (!Number.isInteger(draft.packSize) || draft.packSize <= 0) out.push('packSize')
  return out
}

export const isAddComplete = (draft: AddDraft | undefined): boolean => addProblems(draft).length === 0

/** Flips a row. An Add without a complete draft cannot be checked. */
export function toggle(state: ReviewState, id: string): ReviewState {
  const next = !state.checked[id]
  if (isAddId(id) && next && !isAddComplete(state.adds[id])) return state
  return { ...state, checked: { ...state.checked, [id]: next } }
}

/** Stores an Add's draft; a complete one checks the row, an incomplete one unchecks it. */
export function setAdd(state: ReviewState, id: string, draft: AddDraft): ReviewState {
  return { adds: { ...state.adds, [id]: draft }, checked: { ...state.checked, [id]: isAddComplete(draft) } }
}

/** A row that Accept all checks: never an Add (its form comes first) and never Not on the receipt (removing Stock is not a default). */
const acceptable = (p: Proposal) => p.kind !== 'add' && p.kind !== 'missing'

export function isChecked(state: ReviewState, p: Proposal): boolean {
  return state.checked[p.id] === true && (p.kind !== 'add' || isAddComplete(state.adds[p.id]))
}

export function acceptAll(state: ReviewState, proposals: Proposal[]): ReviewState {
  const checked = { ...state.checked }
  for (const p of proposals) if (acceptable(p)) checked[p.id] = true
  return { ...state, checked }
}

/** Unchecks every row; the Add drafts are kept. */
export function clearAll(state: ReviewState): ReviewState {
  return { ...state, checked: {} }
}

/** Every row that needs no choice is checked: the button then reads "Clear all". */
export function allAccepted(state: ReviewState, proposals: Proposal[]): boolean {
  const rows = proposals.filter(acceptable)
  return rows.length > 0 && rows.every((p) => isChecked(state, p))
}

/** The N of "Apply N changes". */
export function applyCount(state: ReviewState, proposals: Proposal[]): number {
  return proposals.filter((p) => isChecked(state, p)).length
}

function ingredientOf(ingredient: AddIngredient | null): ApplyAdd['ingredient'] {
  // An Add is sent only when complete, so the ingredient is set here.
  if (ingredient === null) return { name: '', baseUnit: 'g', kind: 'food' }
  if ('id' in ingredient) return { id: ingredient.id }
  return { name: ingredient.name.trim(), baseUnit: ingredient.baseUnit, kind: ingredient.kind }
}

function toApplyAdd(id: string, draft: AddDraft): ApplyAdd {
  return {
    id,
    ingredient: ingredientOf(draft.ingredient),
    productName: draft.productName.trim(),
    packSize: draft.packSize,
    ...(draft.scope !== undefined ? { scope: draft.scope } : {}),
  }
}

export interface ApplyBodyInput {
  readId: string
  fingerprint: string
  clientUuids: string[]
  proposals: Proposal[]
  state: ReviewState
}

/** The apply's body: the checked ids in review order, and each checked Add with its choices. */
export function buildApplyBody({ readId, fingerprint, clientUuids, proposals, state }: ApplyBodyInput): ApplyBody {
  const checked = proposals.filter((p) => isChecked(state, p))
  return {
    readId,
    fingerprint,
    clientUuids,
    accept: checked.map((p) => ({ id: p.id })),
    adds: checked.filter((p) => p.kind === 'add').map((p) => toApplyAdd(p.id, state.adds[p.id] as AddDraft)),
  }
}

const TITLES: Record<SectionId, string> = {
  shopDate: t.sections.shopDate,
  prices: t.sections.prices,
  weighed: t.sections.weighed,
  quantities: t.sections.quantities,
  corrections: t.sections.corrections,
  notScanned: t.sections.notScanned,
  notOnReceipt: t.sections.notOnReceipt,
}

/** The proposals grouped in the review order; a section the read has nothing for is left out. */
export function buildSections(proposals: Proposal[]): ReviewSection[] {
  return SECTION_ORDER.flatMap((id) => {
    const list = proposals.filter((p) => SECTION_OF[p.kind] === id)
    return list.length > 0 ? [{ id, title: TITLES[id], proposals: list }] : []
  })
}
