import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LoadState } from './LoadState'

// B9-20 (RES-02): the unknown state. Never an empty state, never a button (the screen fills itself when the connection returns).
const props = { title: 'Your Recipes aren’t on this phone yet', text: 'Feeder loads them the first time this phone is online. They’ll appear here as soon as the connection is back.' }

describe('LoadState', () => {
  it('is one polite status region: role=status, announced once', () => {
    const { container } = render(<LoadState {...props} />)
    const root = container.querySelector('.load-state')!
    expect(root).not.toBeNull()
    expect(root).toHaveAttribute('role', 'status')
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('shows the title as an h2, the text, and the default status line "Waiting for a connection"', () => {
    render(<LoadState {...props} />)
    expect(screen.getByRole('heading', { level: 2, name: props.title })).toBeInTheDocument()
    expect(screen.getByText(props.text)).toBeInTheDocument()
    expect(screen.getByText('Waiting for a connection')).toBeInTheDocument()
  })

  it('a different status line and a level-3 heading can be asked for', () => {
    render(<LoadState {...props} status="Trying again" headingLevel={3} />)
    expect(screen.getByRole('heading', { level: 3, name: props.title })).toBeInTheDocument()
    expect(screen.getByText('Trying again')).toBeInTheDocument()
    expect(screen.queryByText('Waiting for a connection')).toBeNull()
  })

  it('has a decorative CloudSlash in a 96 px art circle, hidden from assistive tech', () => {
    const { container } = render(<LoadState {...props} />)
    const art = container.querySelector('.load-state__art')!
    expect(art).not.toBeNull()
    expect(art).toHaveAttribute('aria-hidden', 'true')
    expect(art.querySelector('svg')).not.toBeNull()
  })

  it('has no button and no link: nothing for the person to press', () => {
    render(<LoadState {...props} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('is not an EmptyState and not an ErrorState: no .empty-state, no role=alert', () => {
    const { container } = render(<LoadState {...props} />)
    expect(container.querySelector('.empty-state, .error-state')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('the page version is the default; the tile version sets data-in="tile"', () => {
    const { container, rerender } = render(<LoadState {...props} />)
    expect(container.querySelector('.load-state')!.getAttribute('data-in')).not.toBe('tile')
    rerender(<LoadState {...props} in="tile" />)
    expect(container.querySelector('.load-state')).toHaveAttribute('data-in', 'tile')
  })
})
