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
  // B9-55 (R-E, allow-bullets empty): each warning is a DetailList row (the path as key, the message as detail), as ValidationErrorsTile.
  it('each warning is an R-E row, not a bullet: the path as its key, the message as its detail', () => {
    const { container } = render(<ImageWarningsTile warnings={[{ path: '$.a', code: 'image_failed', message: 'x' }]} />)
    expect(container.querySelector('ul')).toHaveClass('detail-list')
    expect(container.querySelector('.detail-row__label code')).toHaveTextContent('$.a')
    expect(container.querySelector('.detail-row__detail')).toHaveTextContent('x')
  })
})
