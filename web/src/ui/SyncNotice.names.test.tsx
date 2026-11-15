// B9-54 (P38, every button on a page has its own accessible name): two notices both offer Dismiss, so an action may carry an `ariaLabel`
// ("Dismiss: Carrot was ticked twice"); it must contain the visible label. Without one the button is named by its text, as before.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SyncNotice } from './SyncNotice'

describe('SyncNotice action names', () => {
  it('an action with an ariaLabel is named by it; the visible text stays the label', () => {
    render(<SyncNotice tone="info" title="Carrot was ticked twice" actions={[{ label: 'Dismiss', ariaLabel: 'Dismiss: Carrot was ticked twice', onClick: () => {} }]} />)
    const b = screen.getByRole('button', { name: 'Dismiss: Carrot was ticked twice' })
    expect(b).toHaveTextContent(/^Dismiss$/)
  })
  it('without one the button is named by its text', () => {
    render(<SyncNotice tone="info" title="x" actions={[{ label: 'Dismiss', onClick: () => {} }]} />)
    expect(screen.getByRole('button', { name: 'Dismiss' })).not.toHaveAttribute('aria-label')
  })
})
