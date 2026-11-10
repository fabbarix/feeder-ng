import { describe, expect, it } from 'vitest'
import { stockTakeMessage } from './stockTakeToast'

describe('stockTakeMessage', () => {
  it('names the action for a pack and the new total', () => {
    expect(stockTakeMessage('plus_pack', 'Passata', '1400 g')).toBe('+1 pack: Passata, 1400 g in Stock')
    expect(stockTakeMessage('minus_pack', 'Passata', '700 g')).toBe('−1 pack: Passata, 700 g in Stock')
  })

  it('set total just states the Stock', () => {
    expect(stockTakeMessage('set_total', 'Passata', '1500 g')).toBe('Passata: 1500 g in Stock')
  })
})
