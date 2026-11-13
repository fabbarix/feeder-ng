// SR3: the Scan API's Price calls (SR1 contract: PATCH /api/scan/prices and PATCH /api/scan/{uuid}).
import { describe, expect, it, vi } from 'vitest'
import { ApiError, createHttpClient } from '../../lib/http'
import { createScanApi } from './api'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const result = (uuid: string, priceCents: number) => ({
  clientUuid: uuid,
  status: 'applied',
  scan: { ingredientId: 2, ingredientName: 'Passata', ingredientKind: 'food', baseUnit: 'g', productId: 7, productName: 'Mutti', quantity: 700, lotId: 1, priceCents, onList: false, remaining: 0, ticked: false, productCreated: false },
})

describe('createScanApi.setPrices', () => {
  it('PATCHes /api/scan/prices with the uuids and the pack Price, and answers the results', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ results: [result('a', 145), result('b', 145)] }))
    const results = await createScanApi(createHttpClient({ fetch })).setPrices({ clientUuids: ['a', 'b'], priceCents: 145 })
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('/api/scan/prices')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ clientUuids: ['a', 'b'], priceCents: 145 })
    expect(results.map((r) => [r.clientUuid, r.scan?.priceCents])).toEqual([['a', 145], ['b', 145]])
  })

  it('sends pricePerKgCents when there is one', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ results: [result('a', 140)] }))
    await createScanApi(createHttpClient({ fetch })).setPrices({ clientUuids: ['a'], priceCents: 140, pricePerKgCents: 200 })
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ clientUuids: ['a'], priceCents: 140, pricePerKgCents: 200 })
  })

  it.each([
    [404, 'not_found'],
    [409, 'already_undone'],
    [409, 'not_undoable'],
    [422, 'invalid_price'],
  ])('raises %i %s as an ApiError with that code', async (status, code) => {
    const fetch = vi.fn().mockResolvedValue(json({ error: { code, message: 'no' } }, status))
    const err = await createScanApi(createHttpClient({ fetch })).setPrices({ clientUuids: ['a'], priceCents: 0 }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status, code })
  })
})

describe('createScanApi.setPrice (one scan)', () => {
  it('still sends only priceCents when there is no Price per kg', async () => {
    const fetch = vi.fn().mockResolvedValue(json(result('a', 150)))
    await createScanApi(createHttpClient({ fetch })).setPrice('a', 150)
    expect(fetch.mock.calls[0]![0]).toBe('/api/scan/a')
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ priceCents: 150 })
  })

  it('also sends pricePerKgCents when given', async () => {
    const fetch = vi.fn().mockResolvedValue(json(result('a', 140)))
    await createScanApi(createHttpClient({ fetch })).setPrice('a', 140, 200)
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ priceCents: 140, pricePerKgCents: 200 })
  })
})

describe('createScanApi.offlineData', () => {
  it('passes lastPriceDate and ingredientKind of the Products through', async () => {
    const product = { id: 7, name: 'Mutti', ingredientId: 2, ingredientName: 'Passata', ingredientKind: 'food', baseUnit: 'g', packSize: 700, lastPriceCents: 129, lastPriceDate: '2026-11-03' }
    const fetch = vi.fn().mockResolvedValue(json({ shopId: 1, shopName: 'Coop', catalog: { globalBarcodes: {}, weightRules: [], weightProducts: {} }, products: [product] }))
    const data = await createScanApi(createHttpClient({ fetch })).offlineData(1)
    expect(data.products[0]).toMatchObject({ lastPriceDate: '2026-11-03', ingredientKind: 'food' })
  })
})
