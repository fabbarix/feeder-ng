import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeLot } from '../testData'
import { LotList } from './LotList'

describe('LotList', () => {
  it('shows amount, purchase date, go-off wording and source for each lot', () => {
    render(
      <LotList
        today="2026-11-09"
        lots={[
          makeLot({ id: 1, quantity: 500, goesOff: '2026-11-12', source: 'scan', spoiled: false, useSoon: true }),
          makeLot({ id: 2, quantity: 300, goesOff: null, source: 'stock_take', purchased: '2026-11-09', spoiled: false }),
        ]}
      />,
    )
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]!).getByText('500 g')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('Goes off in 3 days')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('Scanned')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('No go-off date')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('Stock-take')).toBeInTheDocument()
  })

  it('marks a lot that is going off with the spoil tone', () => {
    render(<LotList today="2026-11-09" lots={[makeLot({ goesOff: '2026-11-05' })]} />)
    expect(screen.getByText('Went off 4 days ago').closest('[data-tone]')).toHaveAttribute('data-tone', 'spoil')
  })
})
