import { describe, expect, it } from 'vitest'
import { formatQuantity } from '../../../lib/units'
import { baseStockLine } from './stockLine'

// BR-D round 4: the Stock line of a Base recipe's detail. Pure.
describe('baseStockLine', () => {
  it('"In the Pantry: 300 ml" from the Stock row of the Base recipe\'s Ingredient', () => {
    expect(baseStockLine({ total: 300, baseUnit: 'ml' }, 'metric')).toBe('In the Pantry: 300 ml')
  })
  it('formats the amount as the household reads units', () => {
    expect(baseStockLine({ total: 1500, baseUnit: 'ml' }, 'imperial')).toBe(`In the Pantry: ${formatQuantity(1500, 'ml', 'imperial')}`)
    expect(baseStockLine({ total: 80, baseUnit: 'g' }, 'metric')).toBe('In the Pantry: 80 g')
  })
  it('"In the Pantry: none" for no row or a total of zero', () => {
    expect(baseStockLine(undefined, 'metric')).toBe('In the Pantry: none')
    expect(baseStockLine({ total: 0, baseUnit: 'ml' }, 'metric')).toBe('In the Pantry: none')
  })
})
