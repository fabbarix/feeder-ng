// b8-rxweb: the words and the decisions of the background read, pure (docs/dev/design/b8-rxweb.md).
// Pinned API of ./backgroundCopy:
//   readyTitle(changes: number): string              "Receipt read: review 9 changes" / "...1 change" / "Receipt read: nothing to change"
//   rowView(state: BackgroundRead, o: { isAdmin: boolean }): BackgroundRowView
//     BackgroundRowView = { kind: 'reading' | 'ready' | 'failed'; title: string; meta: string; goes: 'photos' | 'review' }
//     reading: title "Reading the receipt…", meta "You can leave. Feeder keeps reading.", goes 'photos' (the progress)
//              connectionLost: meta "Lost the connection. The read continues; come back to see it."
//     ready:   title readyTitle(changes), meta "Nothing changes until you apply.", goes 'review'
//     failed:  title "The receipt could not be read", meta = describeReceiptError(error).message, goes 'photos' (Read it again)
//   finishedToast(state: ready | failed, pathname: string, o: { isAdmin: boolean }): ToastPlan | undefined
//     ToastPlan = { message: string; status: 'success' | 'error'; actionLabel: string; to: '/scan/receipt/review' | '/scan/receipt' }
//     undefined when the User is looking at it already: on /scan (the row) or under /scan/receipt (the photos screen or the review)
//     ready:  { message: readyTitle(changes), status: 'success', actionLabel: "Review", to: '/scan/receipt/review' }
//     failed: { message: the failure's words, status: 'error', actionLabel: "Read it again", to: '/scan/receipt' }
import { describe, expect, it } from 'vitest'
import { SHOP_ID } from '../fixtures.test-helper'
import { finishedToast, readyTitle, rowView } from './backgroundCopy'
import type { BackgroundRead } from './backgroundRead'

const reading: BackgroundRead = { status: 'reading', shopId: SHOP_ID, readId: 'rd-1', startedAt: 0, connectionLost: false }
const ready: BackgroundRead = { status: 'ready', shopId: SHOP_ID, readId: 'rd-1', changes: 9 }
const failed: BackgroundRead = { status: 'failed', shopId: SHOP_ID, error: { code: 'no_receipt_found' } }

describe('readyTitle', () => {
  it.each([
    [9, 'Receipt read: review 9 changes'],
    [2, 'Receipt read: review 2 changes'],
    [1, 'Receipt read: review 1 change'],
    [0, 'Receipt read: nothing to change'],
  ])('%i -> %s', (n, text) => expect(readyTitle(n)).toBe(text))
})

describe('rowView', () => {
  it('reading', () => {
    expect(rowView(reading, { isAdmin: false })).toEqual({ kind: 'reading', title: 'Reading the receipt…', meta: 'You can leave. Feeder keeps reading.', goes: 'photos' })
  })
  it('reading with a lost connection says the read continues', () => {
    expect(rowView({ ...reading, connectionLost: true } as BackgroundRead, { isAdmin: false }).meta).toBe('Lost the connection. The read continues; come back to see it.')
  })
  it('ready opens the review', () => {
    expect(rowView(ready, { isAdmin: false })).toEqual({ kind: 'ready', title: 'Receipt read: review 9 changes', meta: 'Nothing changes until you apply.', goes: 'review' })
  })
  it('failed says why in the words of the failure, and goes back to the photos', () => {
    expect(rowView(failed, { isAdmin: false })).toEqual({ kind: 'failed', title: 'The receipt could not be read', meta: 'No receipt found in the photos. Take it flat, in good light.', goes: 'photos' })
  })
  it('a failure uses the role of the viewer for the assistant being off', () => {
    const off: BackgroundRead = { status: 'failed', shopId: SHOP_ID, error: { code: 'assistant_unavailable', reason: 'no_key' } }
    expect(rowView(off, { isAdmin: false }).meta).toBe('The Recipe Assistant needs an API key. Ask an Admin.')
    expect(rowView(off, { isAdmin: true }).meta).toBe('The Recipe Assistant needs an API key. Add it in Settings.')
  })
})

describe('finishedToast', () => {
  it('ready, elsewhere in the app: a success toast with Review', () => {
    expect(finishedToast(ready, '/plan', { isAdmin: false })).toEqual({ message: 'Receipt read: review 9 changes', status: 'success', actionLabel: 'Review', to: '/scan/receipt/review' })
  })
  it('failed, elsewhere: an error toast with Read it again', () => {
    expect(finishedToast(failed, '/recipes', { isAdmin: false })).toEqual({
      message: 'No receipt found in the photos. Take it flat, in good light.',
      status: 'error',
      actionLabel: 'Read it again',
      to: '/scan/receipt',
    })
  })
  it.each(['/scan', '/scan/receipt', '/scan/receipt/review'])('no toast on %s: the User is looking at it', (path) => {
    expect(finishedToast(ready, path, { isAdmin: false })).toBeUndefined()
    expect(finishedToast(failed, path, { isAdmin: false })).toBeUndefined()
  })
  it('/scanning-like paths are elsewhere', () => {
    expect(finishedToast(ready, '/scanner', { isAdmin: false })).toBeDefined()
  })
})
