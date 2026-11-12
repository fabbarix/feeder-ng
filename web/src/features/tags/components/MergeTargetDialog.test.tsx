// MergeTargetDialog: "Merge fish into…" with the shared Tag select (every other Tag).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { allTags, fish } from '../fixtures'
import { MergeTargetDialog, type MergeTargetDialogProps } from './MergeTargetDialog'

function show(over: Partial<MergeTargetDialogProps> = {}) {
  const props: MergeTargetDialogProps = { state: { source: fish, targetId: null }, tags: allTags, busy: false, onTarget: vi.fn(), onReview: vi.fn(), onClose: vi.fn(), ...over }
  render(<MergeTargetDialog {...props} />)
  return props
}

describe('MergeTargetDialog', () => {
  it('renders nothing while closed', () => {
    show({ state: null })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is a <dialog> named "Merge fish into…" with a Tag select, Cancel and Review merge', () => {
    show()
    const d = screen.getByRole('dialog', { name: 'Merge fish into…' })
    expect(d.tagName).toBe('DIALOG')
    expect(within(d).getByRole('combobox', { name: 'Merge into' })).toBeInTheDocument()
    expect(within(d).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(within(d).getByRole('button', { name: 'Review merge' })).toBeDisabled()
  })

  it('offers every other Tag by name with its Recipe count, never the Tag itself', async () => {
    show()
    await userEvent.click(screen.getByRole('combobox', { name: 'Merge into' }))
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toHaveLength(3)
    expect(options[0]).toContain('Pasta')
    expect(options[0]).toContain('3 Recipes')
    expect(options[1]).toContain('Roast')
    expect(options[1]).toContain('No Recipes yet')
    expect(options[2]).toContain('Seafood')
    expect(options.join(' ')).not.toMatch(/\bfish\b/)
  })

  it('choosing a Tag reports its id', async () => {
    const { onTarget } = show()
    await userEvent.click(screen.getByRole('combobox', { name: 'Merge into' }))
    await userEvent.click(screen.getByRole('option', { name: /Seafood/ }))
    expect(onTarget).toHaveBeenCalledWith(3)
  })

  it('shows the chosen Tag, and Review merge is then enabled and asks to review', async () => {
    const { onReview } = show({ state: { source: fish, targetId: 3 } })
    expect(screen.getByRole('combobox', { name: 'Merge into' })).toHaveTextContent('Seafood')
    await userEvent.click(screen.getByRole('button', { name: 'Review merge' }))
    expect(onReview).toHaveBeenCalledTimes(1)
  })

  it('while busy, Review merge is loading and cannot be pressed twice', async () => {
    const { onReview } = show({ state: { source: fish, targetId: 3 }, busy: true })
    await userEvent.click(screen.getByRole('button', { name: 'Review merge' }))
    expect(onReview).not.toHaveBeenCalled()
  })

  it('Cancel and Escape close it', async () => {
    const { onClose } = show()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
