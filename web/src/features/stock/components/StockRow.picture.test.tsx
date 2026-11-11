// PE: a Stock row leads with the Ingredient's Picture through the shared ui/Thumb (an empty slot when none, so names line up).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeTotal } from '../testData'
import { StockRow } from './StockRow'

const url = `/api/images/${'a'.repeat(32)}`
const row = (over: Parameters<typeof makeTotal>[0]) => {
  render(<ul><StockRow today="2026-11-09" item={makeTotal(over)} onOpen={() => {}} /></ul>)
  return screen.getByRole('listitem').querySelector('.list-row__leading')!
}

describe('StockRow: Picture', () => {
  it('draws the Ingredient picture as a decorative 40 px Thumb', () => {
    const lead = row({ name: 'flour', imageUrl: url })
    expect(lead.firstElementChild).toHaveClass('thumb')
    expect(lead.firstElementChild).toHaveAttribute('data-size', '40')
    expect(lead.querySelector('img')).toHaveAttribute('src', url)
    expect(lead.querySelector('img')).toHaveAttribute('alt', '')
  })

  it('without a Picture keeps the empty slot', () => {
    const lead = row({ name: 'salt', imageUrl: '' })
    expect(lead.firstElementChild).toHaveClass('thumb')
    expect(lead.querySelector('img')).toBeNull()
  })

  it('a row with no imageUrl field at all (older server) keeps the slot too', () => {
    expect(row({ name: 'salt' }).firstElementChild).toHaveClass('thumb')
  })
})
