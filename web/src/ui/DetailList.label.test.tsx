// B9-43: a DetailList with no visible label is named by `aria-label` ("This shop", "Line", "For"); a visible label (aria-labelledby) wins.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DetailList, DetailRow } from './DetailList'

describe('DetailList aria-label', () => {
  it('names the list', () => {
    render(
      <DetailList tone="success" aria-label="This shop">
        <DetailRow label="Lines ticked" state="20" />
      </DetailList>,
    )
    expect(screen.getByRole('list', { name: 'This shop' })).toHaveAttribute('data-tone', 'success')
  })

  it('a visible label wins: aria-label is then left out', () => {
    render(
      <>
        <h3 id="for">For</h3>
        <DetailList aria-labelledby="for" aria-label="ignored">
          <DetailRow label="Sat Dinner" />
        </DetailList>
      </>,
    )
    const list = screen.getByRole('list', { name: 'For' })
    expect(list).not.toHaveAttribute('aria-label')
  })

  it('without either the list has no name', () => {
    render(<DetailList><DetailRow label="x" /></DetailList>)
    expect(screen.getByRole('list')).not.toHaveAttribute('aria-label')
  })
})
