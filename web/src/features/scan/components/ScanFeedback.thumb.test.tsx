// PE: the scan line draws its Picture through the shared ui/Thumb.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ScanFeedback } from './ScanFeedback'

const url = `/api/images/${'a'.repeat(32)}`
const setup = (imageUrl?: string) =>
  render(<ScanFeedback text="Passata +700 g" imageUrl={imageUrl} canEditPrice onEditPrice={vi.fn()} onUndo={vi.fn()} onDismiss={vi.fn()} />)

describe('ScanFeedback: shared Thumb', () => {
  it('the picture is a Thumb of size 40', () => {
    setup(url)
    const thumb = screen.getByRole('status').querySelector('.thumb')!
    expect(thumb).toHaveAttribute('data-size', '40')
    expect(thumb.querySelector('img')).toHaveAttribute('src', url)
    expect(document.querySelector('.picture-thumb')).toBeNull()
  })

  it('without a picture there is no Thumb and no slot', () => {
    setup()
    expect(screen.getByRole('status').querySelector('.thumb')).toBeNull()
  })
})
