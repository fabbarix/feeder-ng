// PP: the line shown after a scan carries the Product's Picture as a small leading thumb.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ScanFeedback } from './ScanFeedback'

const pic = 'a'.repeat(32)
const setup = (over: Partial<React.ComponentProps<typeof ScanFeedback>> = {}) =>
  render(<ScanFeedback text="Passata +700 g · $1.59" canEditPrice onEditPrice={vi.fn()} onUndo={vi.fn()} onDismiss={vi.fn()} {...over} />)

describe('ScanFeedback: Product picture', () => {
  it('draws the picture as a decorative 40 px thumb before the text', () => {
    setup({ imageUrl: `/api/images/${pic}` })
    const status = screen.getByRole('status')
    const img = status.querySelector('img')
    expect(img).toHaveAttribute('src', `/api/images/${pic}`)
    expect(img).toHaveAttribute('alt', '')
    expect(img!.closest('[data-size]')).toHaveAttribute('data-size', '40')
    expect(img!.compareDocumentPosition(screen.getByText('Passata +700 g · $1.59')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('does not announce the picture: the live region still reads the text alone', () => {
    setup({ imageUrl: `/api/images/${pic}` })
    expect(screen.getByRole('status')).toHaveTextContent(/^Passata \+700 g · \$1\.59/)
  })

  it('draws nothing, and keeps no empty slot, for a Product without a picture', () => {
    setup()
    expect(screen.getByRole('status').querySelector('img, [data-size="40"]')).toBeNull()
    setup({ imageUrl: '' })
    expect(document.querySelectorAll('.scan-feedback img, .scan-feedback [data-size="40"]')).toHaveLength(0)
  })

  it('keeps the actions', () => {
    setup({ imageUrl: `/api/images/${pic}` })
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit price' })).toBeInTheDocument()
  })
})
