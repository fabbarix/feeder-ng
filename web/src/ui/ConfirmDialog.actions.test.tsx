// B9-01 / DS-12 R-A, R-B: ConfirmDialog's Cancel is an outline secondary Button (through Dialog `onCancel`), first in the row;
// the confirm is primary or danger; there is no Close; a danger confirm still focuses Cancel.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

const base = { open: true, title: 'Freeze Lasagne?', confirmLabel: 'Freeze', onConfirm: () => {}, onCancel: () => {} }

describe('ConfirmDialog actions (B9-01)', () => {
  it('Cancel is the first button, secondary; Freeze is the primary', () => {
    render(<ConfirmDialog {...base} />)
    const row = document.querySelector('.dialog__actions') as HTMLElement
    const [cancel, confirm] = within(row).getAllByRole('button')
    expect(cancel).toHaveAccessibleName('Cancel')
    expect(cancel).toHaveAttribute('data-variant', 'secondary')
    expect(confirm).toHaveAttribute('data-variant', 'primary')
  })

  it('has no Close button', () => {
    render(<ConfirmDialog {...base} />)
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('a danger confirm: Cancel (secondary) holds the focus, confirm is danger', () => {
    render(<ConfirmDialog {...base} tone="danger" confirmLabel="Delete" />)
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('data-variant', 'secondary')
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute('data-variant', 'danger')
  })

  it('an alternate choice sits between Cancel and the confirm, also secondary', () => {
    render(<ConfirmDialog {...base} alternateLabel="Archive instead" onAlternate={() => {}} />)
    const names = within(document.querySelector('.dialog__actions') as HTMLElement).getAllByRole('button').map((b) => b.textContent)
    expect(names).toEqual(['Cancel', 'Archive instead', 'Freeze'])
    expect(screen.getByRole('button', { name: 'Archive instead' })).toHaveAttribute('data-variant', 'secondary')
  })
})
