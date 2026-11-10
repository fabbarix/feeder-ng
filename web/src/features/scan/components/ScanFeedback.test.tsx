import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ScanFeedback } from './ScanFeedback'

function setup(over: Partial<React.ComponentProps<typeof ScanFeedback>> = {}) {
  const props = { text: 'Passata +700 g · $1.59', canEditPrice: true, onEditPrice: vi.fn(), onUndo: vi.fn(), onDismiss: vi.fn(), ...over }
  const view = render(<ScanFeedback {...props} />)
  return { ...props, view }
}

describe('ScanFeedback', () => {
  it('announces the text of the scan', () => {
    setup()
    expect(screen.getByRole('status')).toHaveTextContent('Passata +700 g · $1.59')
  })

  it('edits the price and undoes, with labelled icon buttons instead of glyph characters', async () => {
    const p = setup()
    const edit = screen.getByRole('button', { name: 'Edit price' })
    expect(edit.textContent).toBe('')
    expect(edit.querySelector('svg')).not.toBeNull()
    await userEvent.click(edit)
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(p.onEditPrice).toHaveBeenCalledTimes(1)
    expect(p.onUndo).toHaveBeenCalledTimes(1)
    expect(p.view.container).not.toHaveTextContent('✎')
    expect(p.view.container).not.toHaveTextContent('×')
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

  it('can be dismissed with an icon button', async () => {
    const p = setup()
    const dismiss = screen.getByRole('button', { name: 'Dismiss' })
    expect(dismiss.textContent).toBe('')
    await userEvent.click(dismiss)
    expect(p.onDismiss).toHaveBeenCalledTimes(1)
  })
})
