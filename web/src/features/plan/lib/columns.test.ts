import { describe, expect, it } from 'vitest'
import { planColumns } from './columns'

describe('planColumns', () => {
  it('2 on phones, 4 from 768 px, 7 from 1200 px', () => {
    expect(planColumns(390)).toBe(2)
    expect(planColumns(767)).toBe(2)
    expect(planColumns(768)).toBe(4)
    expect(planColumns(1199)).toBe(4)
    expect(planColumns(1200)).toBe(7)
    expect(planColumns(1440)).toBe(7)
  })
})
