// B9-29 (SAFE-09, SSP-10, SSP-17) against the routes B9-05 built (B9-API-NOTES, "B9-05 stock-undo-api"):
//   keep(lotId, goodUntil?)   POST /api/stock/lots/{id}/keep, no body for "Good until today", {goodUntil} for Change (past date: 422)
//   undoThrowOut(wasteId)     POST /api/stock/waste/{id}/undo -> the Lot as it was (404 unknown or already undone, 409 not_undoable | undo_window_over)
//   putAway(moves)            POST /api/stock/lots/put-away {moves:[{lotId,storagePlaceId}]} -> {lots, skipped}
import { describe, expect, it, vi } from 'vitest'
import type { HttpClient } from '../../lib/http'
import { createStockApi } from './api'

describe('createStockApi (beta.9 Stock Undo, Keep with a date, Put away)', () => {
  it('keep without a date sends no body (the server says today)', async () => {
    const post = vi.fn().mockResolvedValue({ id: 4 })
    await createStockApi({ post } as unknown as HttpClient).keep(4)
    expect(post).toHaveBeenCalledWith('/api/stock/lots/4/keep')
  })
  it('keep with a date sends {goodUntil}', async () => {
    const post = vi.fn().mockResolvedValue({ id: 4 })
    await createStockApi({ post } as unknown as HttpClient).keep(4, '2026-11-12')
    expect(post).toHaveBeenCalledWith('/api/stock/lots/4/keep', { goodUntil: '2026-11-12' })
  })
  it('undoThrowOut posts to the waste record and returns the Lot that came back', async () => {
    const post = vi.fn().mockResolvedValue({ id: 31, ingredientName: 'basil' })
    const lot = await createStockApi({ post } as unknown as HttpClient).undoThrowOut(9)
    expect(post).toHaveBeenCalledWith('/api/stock/waste/9/undo')
    expect(lot).toEqual({ id: 31, ingredientName: 'basil' })
  })
  it('putAway posts the moves and returns {lots, skipped}', async () => {
    const post = vi.fn().mockResolvedValue({ lots: [{ id: 5 }], skipped: [6] })
    const moves = [
      { lotId: 5, storagePlaceId: 3 },
      { lotId: 6, storagePlaceId: 3 },
    ]
    expect(await createStockApi({ post } as unknown as HttpClient).putAway(moves)).toEqual({ lots: [{ id: 5 }], skipped: [6] })
    expect(post).toHaveBeenCalledWith('/api/stock/lots/put-away', { moves })
  })
})
