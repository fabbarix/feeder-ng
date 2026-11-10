import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UnarchiveProductSheet } from './UnarchiveProductSheet'

function setup(over: Partial<React.ComponentProps<typeof UnarchiveProductSheet>> = {}) {
  const props = { open: true, onClose: vi.fn(), productName: 'Old passata 500 g', onUnarchive: vi.fn(), onCreateNew: vi.fn(), ...over }
  render(<UnarchiveProductSheet {...props} />)
  return props
}

describe('UnarchiveProductSheet', () => {
  it('names the Product and explains why', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Unarchive Old passata 500 g?' })).toBeInTheDocument()
    expect(screen.getByText('This barcode belongs to an archived Product.')).toBeInTheDocument()
  })

  it('Unarchive is the primary action, creating a new Product the secondary', async () => {
    const p = setup()
    const unarchive = screen.getByRole('button', { name: 'Unarchive Old passata 500 g' })
    const create = screen.getByRole('button', { name: 'Create a new Product instead' })
    expect(unarchive).toHaveAttribute('data-variant', 'primary')
    expect(create).toHaveAttribute('data-variant', 'secondary')
    await userEvent.click(unarchive)
    await userEvent.click(create)
    expect(p.onUnarchive).toHaveBeenCalledTimes(1)
    expect(p.onCreateNew).toHaveBeenCalledTimes(1)
  })

  it('disables both while the unarchive is under way', () => {
    setup({ busy: true })
    expect(screen.getByRole('button', { name: 'Unarchive Old passata 500 g' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Create a new Product instead' })).toBeDisabled()
  })

  it('renders nothing when closed', () => {
    setup({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
