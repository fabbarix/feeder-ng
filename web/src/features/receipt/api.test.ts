// RR4: the typed calls of /api/scan/receipt (design 7), against a fake fetch that answers with the backend's exact JSON.
// Pinned API of ./api:
//   createReceiptApi(fetch): ReceiptApi            (and `receiptApi`, the same over the global fetch)
//   startRead(body: StartReadBody): Promise<{ id: string }>                       POST /api/scan/receipt/reads; rejects ApiError
//   getRead(id, opts?: { signal }): Promise<ReadView>                             GET  /api/scan/receipt/reads/{id}; rejects ApiError (404 = lost)
//   cancelRead(id, opts?: { keepalive }): Promise<void>                           DELETE (204)
//   apply(body: ApplyBody): Promise<ApplyOutcome>                                 POST /api/scan/receipt/apply; never rejects
// A refusal of startRead is an ApiError whose `code` is the error code and whose `details` hold `reason` (409 assistant_unavailable)
// and `retryAfterSeconds` (429 too_many_reads).
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../lib/http'
import { createReceiptApi } from './api'
import { readDone, scanResult } from './fixtures.test-helper'
import type { ApplyBody, StartReadBody } from './types'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const fake = (res: Response | (() => Response | Promise<Response>)) => vi.fn(async (_url: string, _init?: RequestInit) => (typeof res === 'function' ? res() : res))

const start: StartReadBody = { shopId: 7, clientUuids: ['u1', 'u2'], photos: [{ dataUrl: 'data:image/jpeg;base64,AAAA' }] }
const applyBody: ApplyBody = { readId: 'rd-1', fingerprint: 'fp', clientUuids: ['u1'], accept: [{ id: 'price:0' }], adds: [] }

describe('startRead', () => {
  it('posts the body as JSON and answers the id', async () => {
    const f = fake(json(202, { id: 'rd-1', status: 'running' }))
    const out = await createReceiptApi(f).startRead(start)
    expect(out.id).toBe('rd-1')
    const [url, init] = f.mock.calls[0]!
    expect(url).toBe('/api/scan/receipt/reads')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual(start)
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })
  it('rejects 409 assistant_unavailable with the reason in details', async () => {
    const f = fake(json(409, { error: { code: 'assistant_unavailable', message: 'x', reason: 'no_key' } }))
    const err = await createReceiptApi(f).startRead(start).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 409, code: 'assistant_unavailable', details: { reason: 'no_key' } })
  })
  it('rejects 429 too_many_reads with retryAfterSeconds', async () => {
    const f = fake(json(429, { error: { code: 'too_many_reads', message: 'x', retryAfterSeconds: 720 } }))
    await expect(createReceiptApi(f).startRead(start)).rejects.toMatchObject({ status: 429, code: 'too_many_reads', details: { retryAfterSeconds: 720 } })
  })
  it('200 without undone (an older server): undone is []', async () => {
    const out = await createReceiptApi(fake(json(200, { applied: 1, results: [] }))).apply(applyBody)
    expect(out).toEqual({ ok: true, applied: 1, results: [], undone: [] })
  })
  it.each([
    [409, 'read_in_progress'],
    [422, 'scans_empty'],
    [422, 'photos_empty'],
    [422, 'too_many_photos'],
    [422, 'photo_too_large'],
    [422, 'photo_unsupported'],
  ])('rejects %i %s with its code', async (status, code) => {
    const f = fake(json(status, { error: { code, message: 'x' } }))
    await expect(createReceiptApi(f).startRead(start)).rejects.toMatchObject({ status, code })
  })
  it('rejects a lost connection as ApiError status 0 "network"', async () => {
    const f = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    await expect(createReceiptApi(f).startRead(start)).rejects.toMatchObject({ status: 0, code: 'network' })
  })
})

describe('getRead and cancelRead', () => {
  it('gets a read by its encoded id, with the signal', async () => {
    const f = fake(json(200, readDone()))
    const ctl = new AbortController()
    const out = await createReceiptApi(f).getRead('a/b', { signal: ctl.signal })
    expect(out.status).toBe('done')
    const [url, init] = f.mock.calls[0]!
    expect(url).toBe('/api/scan/receipt/reads/a%2Fb')
    expect(init?.method).toBe('GET')
    expect(init?.signal).toBe(ctl.signal)
  })
  it('answers the running and failed shapes as they are', async () => {
    expect(await createReceiptApi(fake(json(200, { status: 'running' }))).getRead('x')).toEqual({ status: 'running' })
    const failed = { status: 'failed', error: { code: 'no_receipt_found', message: 'm' } }
    expect(await createReceiptApi(fake(json(200, failed))).getRead('x')).toEqual(failed)
  })
  it('rejects 404 as ApiError (the read is lost)', async () => {
    await expect(createReceiptApi(fake(json(404, { error: { code: 'not_found', message: 'Not found' } }))).getRead('x')).rejects.toMatchObject({ status: 404 })
  })
  it('cancels with DELETE, optionally keepalive', async () => {
    const f = fake(new Response(null, { status: 204 }))
    await createReceiptApi(f).cancelRead('rd-1', { keepalive: true })
    const [url, init] = f.mock.calls[0]!
    expect(url).toBe('/api/scan/receipt/reads/rd-1')
    expect(init?.method).toBe('DELETE')
    expect(init?.keepalive).toBe(true)
  })
})

describe('apply', () => {
  it('200: ok with the count, the results and the undone uuids', async () => {
    const results = [scanResult('receipt:rd-1:0')]
    const f = fake(json(200, { applied: 3, results, undone: ['u2', 'u3'] }))
    const out = await createReceiptApi(f).apply(applyBody)
    expect(out).toEqual({ ok: true, applied: 3, results, undone: ['u2', 'u3'] })
    const [url, init] = f.mock.calls[0]!
    expect(url).toBe('/api/scan/receipt/apply')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual(applyBody)
  })
  it.each([
    [409, 'receipt_session_changed'],
    [409, 'receipt_read_not_done'],
    [409, 'assistant_unavailable'],
    [410, 'receipt_read_gone'],
  ])('%i %s: not ok, with the code and message and no results', async (status, code) => {
    const out = await createReceiptApi(fake(json(status, { error: { code, message: 'server words' } }))).apply(applyBody)
    expect(out).toEqual({ ok: false, status, code, message: 'server words', results: [] })
  })
  it.each(['unknown_proposal', 'add_incomplete'])('422 %s carries the proposal id', async (code) => {
    const out = await createReceiptApi(fake(json(422, { error: { code, message: 'm', id: 'add:0' } }))).apply(applyBody)
    expect(out).toEqual({ ok: false, status: 422, code, message: 'm', id: 'add:0', results: [] })
  })
  it('500 receipt_apply_failed keeps the results the put-back wrote', async () => {
    const results = [scanResult('receipt:rd-1:undo:u2')]
    const out = await createReceiptApi(fake(json(500, { error: { code: 'receipt_apply_failed', message: 'm' }, results }))).apply(applyBody)
    expect(out).toEqual({ ok: false, status: 500, code: 'receipt_apply_failed', message: 'm', results })
  })
  it('500 with an empty put-back has results []', async () => {
    const out = await createReceiptApi(fake(json(500, { error: { code: 'receipt_apply_failed', message: 'm' }, results: [] }))).apply(applyBody)
    expect(out).toMatchObject({ ok: false, results: [] })
  })
  it('a lost connection is ok: false, status 0, code network', async () => {
    const out = await createReceiptApi(vi.fn(async () => { throw new TypeError('Failed to fetch') })).apply(applyBody)
    expect(out).toMatchObject({ ok: false, status: 0, code: 'network', results: [] })
  })
  it('an answer that is not the error shape is a plain failure, never a throw', async () => {
    const out = await createReceiptApi(fake(new Response('<html>bad gateway</html>', { status: 502 }))).apply(applyBody)
    expect(out).toMatchObject({ ok: false, status: 502, results: [] })
  })
})
