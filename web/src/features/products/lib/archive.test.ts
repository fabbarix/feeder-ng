import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/http'
import { applyArchivedFilter, deleteOutcome, productActions } from './archive'

describe('deleteOutcome', () => {
  it('reads 409 product_bought as bought', () => {
    expect(deleteOutcome(new ApiError(409, 'product_bought', 'archive it'))).toBe('bought')
  })
  it('does not treat other errors as bought', () => {
    expect(deleteOutcome(new ApiError(409, 'in_use', 'x'))).toBe('other')
    expect(deleteOutcome(new ApiError(500, 'internal', 'x'))).toBe('other')
    expect(deleteOutcome(new Error('offline'))).toBe('other')
  })
})

describe('applyArchivedFilter', () => {
  const list = [{ id: 1, archived: false }, { id: 2, archived: true }, { id: 3 }, { id: 4, archived: true }]
  it('off keeps active Products (missing flag = active), in order', () => {
    expect(applyArchivedFilter(list, false).map((p) => p.id)).toEqual([1, 3])
  })
  it('on keeps only archived Products, in order', () => {
    expect(applyArchivedFilter(list, true).map((p) => p.id)).toEqual([2, 4])
  })
})

describe('productActions', () => {
  it('offers Archive and Delete while active', () => {
    expect(productActions({ archived: false })).toEqual(['archive', 'delete'])
    expect(productActions({})).toEqual(['archive', 'delete'])
  })
  it('offers Unarchive and Delete once archived', () => {
    expect(productActions({ archived: true })).toEqual(['unarchive', 'delete'])
  })
})
