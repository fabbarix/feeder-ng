import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { importStrings as s } from '../strings'
import { ImageWarningsTile } from './ImageWarningsTile'

describe('ImageWarningsTile', () => {
  it('lists each failed image with its path', () => {
    render(<ImageWarningsTile warnings={[{ path: '$.recipes[0].image', code: 'image_failed', message: 'refused: private address' }]} />)
    expect(screen.getByText(s.warningsTitle)).toBeInTheDocument()
    expect(screen.getByText('$.recipes[0].image').tagName).toBe('CODE')
    expect(screen.getByText(/refused: private address/)).toBeInTheDocument()
  })
  it('renders nothing without warnings', () => {
    const { container } = render(<ImageWarningsTile warnings={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
