import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ScanFeedback } from './ScanFeedback'

function setup(over: Partial<React.ComponentProps<typeof ScanFeedback>> = {}) {
  const props = { text: 'Passata +700 g · $1.59', canEditPrice: true, onEditPrice: vi.fn(), onUndo: vi.fn(), onDismiss: vi.fn(), ...over }
  render(<ScanFeedback {...props} />)
  return props
}

describe('ScanFeedback', () => {
  it('announces the text of the scan', () => {
    setup()
    expect(screen.getByRole('status')).toHaveTextContent('Passata +700 g · $1.59')
  })

  it('edits the price with ✎ and undoes with Undo', async () => {
    const p = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Edit price' }))
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(p.onEditPrice).toHaveBeenCalledTimes(1)
    expect(p.onUndo).toHaveBeenCalledTimes(1)
  })

  it('offers no price edit when there is no price to edit', () => {
    setup({ canEditPrice: false })
    expect(screen.queryByRole('button', { name: 'Edit price' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })

  it('says when the scan is waiting to sync', () => {
    setup({ queued: true })
    expect(screen.getByRole('status')).toHaveTextContent('Waiting to sync')
  })

  it('can be dismissed', async () => {
    const p = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(p.onDismiss).toHaveBeenCalledTimes(1)
  })
})
