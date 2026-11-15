// B9-13, SET-12: a person who is not a Member (a sign-in request) gets a neutral monogram, not the accent fill.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from './Avatar'

describe('Avatar tone="neutral"', () => {
  it('marks the monogram data-tone="neutral"; still named for assistive technology, still the initials', () => {
    render(<Avatar name="Chiara Rossi" tone="neutral" />)
    const a = screen.getByRole('img', { name: 'Chiara Rossi' })
    expect(a).toHaveAttribute('data-tone', 'neutral')
    expect(a).toHaveTextContent('CR')
  })
  it('the default has no data-tone (the accent fill stays for Members)', () => {
    render(<Avatar name="Sam" />)
    expect(screen.getByRole('img', { name: 'Sam' })).not.toHaveAttribute('data-tone')
  })
  it('the Google photo still wins over the monogram, whatever the tone', () => {
    render(<Avatar name="Sam" tone="neutral" imageUrl="/p.png" />)
    const img = screen.getByRole('img', { name: 'Sam' })
    expect(img.tagName).toBe('IMG')
  })
  it('a photo that fails to load falls back to the neutral monogram', () => {
    render(<Avatar name="Sam Smith" tone="neutral" imageUrl="/broken.png" />)
    screen.getByRole('img', { name: 'Sam Smith' }).dispatchEvent(new Event('error'))
    return screen.findByText('SS').then((m) => {
      expect(m).toHaveAttribute('data-tone', 'neutral')
    })
  })
})
