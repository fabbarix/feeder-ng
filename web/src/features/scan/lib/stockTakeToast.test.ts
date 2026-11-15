import { describe, expect, it } from 'vitest'
import { stockTakeMessage } from './stockTakeToast'

// B9-41 (SAFE-09): "+1 pack of Flour: 1250 g in Stock", "-1 pack of Flour: 750 g in Stock", "Flour set to 750 g" (the chapter's table).
describe('stockTakeMessage', () => {
  it('names the action, the Ingredient and the new total', () => {
    expect(stockTakeMessage('plus_pack', 'Flour', '1250 g')).toBe('+1 pack of Flour: 1250 g in Stock')
    expect(stockTakeMessage('minus_pack', 'Flour', '750 g')).toBe('−1 pack of Flour: 750 g in Stock')
  })

  it('set total says what the Ingredient was set to', () => {
    expect(stockTakeMessage('set_total', 'Flour', '750 g')).toBe('Flour set to 750 g')
  })
})
