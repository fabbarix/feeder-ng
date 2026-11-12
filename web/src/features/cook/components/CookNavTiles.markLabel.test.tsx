// CRS F (spec 11): the timeline's last item offers Mark all Cooked; a single-Course view keeps Mark as Cooked.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CookNavTiles } from './CookNavTiles'

describe('CookNavTiles markLabel', () => {
  it('the last item offers the label given', async () => {
    const onMarkCooked = vi.fn()
    render(<CookNavTiles isFirst={false} isLast onBack={() => {}} onNext={() => {}} onMarkCooked={onMarkCooked} markLabel="Mark all Cooked" />)
    expect(screen.queryByRole('button', { name: 'Mark as Cooked' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Mark all Cooked' }))
    expect(onMarkCooked).toHaveBeenCalledTimes(1)
  })

  it('without a label it is Mark as Cooked, as before', () => {
    render(<CookNavTiles isFirst={false} isLast onBack={() => {}} onNext={() => {}} onMarkCooked={() => {}} />)
    expect(screen.getByRole('button', { name: 'Mark as Cooked' })).toBeInTheDocument()
  })
})
