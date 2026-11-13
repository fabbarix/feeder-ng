// RR4: the Receipt review's state and the apply, with a mocked api (design 3.4, 7.2, 9).
// Pinned API of ./useReceiptReview:
//   useReceiptReview(opts: { onApplied: (applied: number) => void }): UseReceiptReview
//   UseReceiptReview = {
//     stored?: StoredRead                    the read kept for the review (lib/readStore); undefined when nothing is kept or it expired
//     rows: ReceiptRow[]; sections: ReviewSection[]; state: ReviewState
//     applyCount: number                     lib/reviewState.applyCount
//     allAccepted: boolean                   "Clear all" instead of "Accept all"
//     hasChecked: boolean                    something is checked, so leaving asks "Leave without applying?"
//     toggle(id), setAdd(id, draft), acceptAll(), clearAll()
//     applying: boolean
//     apply(): Promise<void>                 posts lib/reviewState.buildApplyBody with the phone's CURRENT session uuids (lib/receiptSession), or the read's own when none is published
//     error?: { code: string; message: string; action: ReceiptErrorAction; id?: string }   the last refused or failed apply
//     highlightId?: string                   error.id (422 unknown_proposal / add_incomplete): the row to point at
//     dismissError(): void
//     readAgain(): void                      forgets the kept read (the screen then goes to /scan/receipt)
//   }
// On 200: emitReceiptApplied({ readId, applied (the SERVER's count), failed: false, results }), forgetRead(), onApplied(applied).
// On 500 receipt_apply_failed: emitReceiptApplied({ readId, applied: 0, failed: true, results }) so the phone re-keys its rows; error is set; onApplied is not called.
// On any other refusal nothing is emitted and the read stays kept.
// The User's role comes from useMe().data?.isAdmin (the words of assistant_unavailable).
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { takePendingReceiptApplied } from '../lib/appliedEvents'
import { forgetRead, recallRead, rememberRead } from '../lib/readStore'
import { publishReceiptSession } from '../lib/receiptSession'
import { completeDraft, FINGERPRINT, READ_ID, readDone, scanResult, SHOP_ID, UUIDS } from '../fixtures.test-helper'

const api = vi.hoisted(() => ({ startRead: vi.fn(), getRead: vi.fn(), cancelRead: vi.fn(), apply: vi.fn() }))
vi.mock('../api', () => ({ receiptApi: api }))
const me = vi.hoisted(() => ({ isAdmin: false }))
vi.mock('../../../app/useMe', () => ({ useMe: () => ({ data: { id: 1, email: 'a@b.c', displayName: 'A', isAdmin: me.isAdmin } }) }))

import { useReceiptReview } from './useReceiptReview'

const refused = (status: number, code: string, extra: Record<string, unknown> = {}, results: unknown[] = []) => ({ ok: false, status, code, message: 'server words', results, ...extra })

function setup() {
  const onApplied = vi.fn()
  const h = renderHook(() => useReceiptReview({ onApplied }))
  return { ...h, onApplied }
}

beforeEach(() => {
  vi.clearAllMocks()
  forgetRead()
  takePendingReceiptApplied()
  publishReceiptSession(undefined)
  me.isAdmin = false
  rememberRead({ readId: READ_ID, shopId: SHOP_ID, clientUuids: UUIDS, read: readDone() })
})

describe('the review', () => {
  it('has nothing when no read is kept', () => {
    forgetRead()
    expect(setup().result.current.stored).toBeUndefined()
  })
  it('opens with the defaults: 5 checked, in the sections of the read', () => {
    const { result } = setup()
    expect(result.current.stored?.readId).toBe(READ_ID)
    expect(result.current.rows).toHaveLength(6)
    expect(result.current.sections.map((s) => s.id)).toEqual(['prices', 'weights', 'quantities', 'corrections', 'notScanned', 'notOnReceipt'])
    expect(result.current).toMatchObject({ applyCount: 5, allAccepted: false, hasChecked: true, applying: false, error: undefined })
  })
  it('toggle, acceptAll and clearAll change the count', () => {
    const { result } = setup()
    act(() => result.current.toggle('missing:5'))
    expect(result.current.applyCount).toBe(6)
    act(() => result.current.acceptAll())
    expect(result.current.applyCount).toBe(7) // 5 + Remove + the pack size correction; Adds wait
    expect(result.current.allAccepted).toBe(true)
    act(() => result.current.clearAll())
    expect(result.current).toMatchObject({ applyCount: 0, hasChecked: false })
  })
  it('an Add counts once its draft is complete', () => {
    const { result } = setup()
    act(() => result.current.setAdd('add:0', { ...completeDraft, packSize: 0 }))
    expect(result.current.applyCount).toBe(5)
    act(() => result.current.setAdd('add:0', completeDraft))
    expect(result.current.applyCount).toBe(6)
  })
})

describe('apply: success', () => {
  it('posts the body with the current session uuids, then hands the results over', async () => {
    const results = [scanResult('receipt:rd-1:0')]
    api.apply.mockResolvedValue({ ok: true, applied: 6, results })
    publishReceiptSession({ shopId: SHOP_ID, clientUuids: [...UUIDS, 'u8'] })
    const { result, onApplied } = setup()
    act(() => result.current.setAdd('add:0', completeDraft))
    await act(async () => { await result.current.apply() })
    expect(api.apply).toHaveBeenCalledTimes(1)
    expect(api.apply).toHaveBeenCalledWith({
      readId: READ_ID,
      fingerprint: FINGERPRINT,
      clientUuids: [...UUIDS, 'u8'],
      accept: [{ id: 'price:0' }, { id: 'price:1' }, { id: 'price:2' }, { id: 'weight:3' }, { id: 'quantity:4' }, { id: 'add:0' }],
      adds: [{ id: 'add:0', ingredient: { id: 31 }, productName: 'Pane casereccio', packSize: 450 }],
    })
    expect(takePendingReceiptApplied()).toEqual({ readId: READ_ID, applied: 6, failed: false, results })
    expect(onApplied).toHaveBeenCalledWith(6)
    expect(recallRead()).toBeUndefined()
  })
  it('uses the read\'s own uuids when no session was published', async () => {
    api.apply.mockResolvedValue({ ok: true, applied: 5, results: [] })
    const { result } = setup()
    await act(async () => { await result.current.apply() })
    expect(api.apply.mock.calls[0]?.[0].clientUuids).toEqual(UUIDS)
  })
  it('says the SERVER\'s count (a repeated id is one proposal)', async () => {
    api.apply.mockResolvedValue({ ok: true, applied: 4, results: [] })
    const { result, onApplied } = setup()
    await act(async () => { await result.current.apply() })
    expect(onApplied).toHaveBeenCalledWith(4)
  })
  it('is busy while posting, and a second press is ignored', async () => {
    let release!: (v: unknown) => void
    api.apply.mockReturnValue(new Promise((r) => { release = r }))
    const { result } = setup()
    let p!: Promise<void>
    act(() => { p = result.current.apply() })
    expect(result.current.applying).toBe(true)
    await act(async () => { await result.current.apply() })
    expect(api.apply).toHaveBeenCalledTimes(1)
    await act(async () => { release({ ok: true, applied: 5, results: [] }); await p })
    expect(result.current.applying).toBe(false)
  })
  it('does not post with nothing checked', async () => {
    const { result } = setup()
    act(() => result.current.clearAll())
    await act(async () => { await result.current.apply() })
    expect(api.apply).not.toHaveBeenCalled()
  })
})

describe('apply: refusals (design 7.2, 9)', () => {
  const run = async (outcome: unknown) => {
    api.apply.mockResolvedValue(outcome)
    const h = setup()
    await act(async () => { await h.result.current.apply() })
    return h
  }
  it('409 receipt_session_changed: says so and offers Read again; nothing handed over; the read stays kept', async () => {
    const { result, onApplied } = await run(refused(409, 'receipt_session_changed'))
    expect(result.current.error).toMatchObject({ code: 'receipt_session_changed', action: 'readAgain' })
    expect(result.current.error?.message).toContain('Your scans changed since the receipt was read')
    expect(onApplied).not.toHaveBeenCalled()
    expect(takePendingReceiptApplied()).toBeUndefined()
    expect(recallRead()).toBeDefined()
    expect(result.current.applying).toBe(false)
  })
  it('410 receipt_read_gone', async () => {
    const { result } = await run(refused(410, 'receipt_read_gone'))
    expect(result.current.error).toMatchObject({ code: 'receipt_read_gone', action: 'readAgain', message: 'This read is no longer kept (10 minutes).' })
  })
  it('409 receipt_read_not_done', async () => {
    const { result } = await run(refused(409, 'receipt_read_not_done'))
    expect(result.current.error).toMatchObject({ code: 'receipt_read_not_done', message: 'The receipt is still being read.' })
  })
  it('409 assistant_unavailable (the apply names no reason)', async () => {
    const { result } = await run(refused(409, 'assistant_unavailable'))
    expect(result.current.error).toMatchObject({ code: 'assistant_unavailable', message: "The Recipe Assistant isn't working. An Admin can check it in Settings.", action: 'none' })
  })
  it('an Admin is offered the settings link', async () => {
    me.isAdmin = true
    const { result } = await run(refused(409, 'assistant_unavailable'))
    expect(result.current.error?.action).toBe('settings')
  })
  it('422 add_incomplete points at the row', async () => {
    const { result } = await run(refused(422, 'add_incomplete', { id: 'add:0' }))
    expect(result.current.error).toMatchObject({ code: 'add_incomplete', id: 'add:0', action: 'none' })
    expect(result.current.highlightId).toBe('add:0')
  })
  it('422 unknown_proposal points at the row', async () => {
    const { result } = await run(refused(422, 'unknown_proposal', { id: 'price:0' }))
    expect(result.current).toMatchObject({ highlightId: 'price:0', error: { code: 'unknown_proposal', action: 'readAgain' } })
  })
  it('a lost connection: Try again is possible and nothing is lost', async () => {
    const { result } = await run(refused(0, 'network'))
    expect(result.current.error).toMatchObject({ code: 'network', action: 'retry' })
    expect(result.current.applyCount).toBe(5)
    api.apply.mockResolvedValue({ ok: true, applied: 5, results: [] })
    await act(async () => { await result.current.apply() })
    expect(api.apply).toHaveBeenCalledTimes(2)
    expect(result.current.error).toBeUndefined()
  })
  it('dismissError clears the error and the highlight', async () => {
    const { result } = await run(refused(422, 'add_incomplete', { id: 'add:0' }))
    act(() => result.current.dismissError())
    expect(result.current).toMatchObject({ error: undefined, highlightId: undefined })
  })
  it('starting an apply again clears the old error', async () => {
    const { result } = await run(refused(409, 'receipt_session_changed'))
    api.apply.mockResolvedValue({ ok: true, applied: 5, results: [] })
    await act(async () => { await result.current.apply() })
    expect(result.current.error).toBeUndefined()
  })
})

describe('apply: 500 receipt_apply_failed still hands the results over', () => {
  it('re-keys: the put-back scans go to the Scanned session even though the apply failed', async () => {
    const results = [scanResult('receipt:rd-1:undo:u2'), scanResult('receipt:rd-1:undo:u5#2')]
    api.apply.mockResolvedValue(refused(500, 'receipt_apply_failed', {}, results))
    const { result, onApplied } = setup()
    await act(async () => { await result.current.apply() })
    expect(takePendingReceiptApplied()).toEqual({ readId: READ_ID, applied: 0, failed: true, results })
    expect(result.current.error).toMatchObject({ code: 'receipt_apply_failed', message: 'The receipt could not be applied. Check the Scanned list and try again.' })
    expect(onApplied).not.toHaveBeenCalled()
    expect(result.current.applying).toBe(false)
  })
  it('hands over an empty list too (the put-back wrote nothing)', async () => {
    api.apply.mockResolvedValue(refused(500, 'receipt_apply_failed', {}, []))
    const { result } = setup()
    await act(async () => { await result.current.apply() })
    expect(takePendingReceiptApplied()).toEqual({ readId: READ_ID, applied: 0, failed: true, results: [] })
  })
})

describe('readAgain', () => {
  it('forgets the kept read', () => {
    const { result } = setup()
    act(() => result.current.readAgain())
    expect(recallRead()).toBeUndefined()
  })
})
