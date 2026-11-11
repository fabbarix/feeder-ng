import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RequestAvatar } from './RequestAvatar'

const photo = 'https://lh3.googleusercontent.com/a/zia'

// Decision A8: the Google photo is shown, and falls back to initials if it fails to load (blocked, expired, offline).
describe('RequestAvatar', () => {
  it('shows the photo', () => {
    render(<RequestAvatar name="Zia Rosa" picture={photo} />)
    const img = screen.getByRole('img', { name: 'Zia Rosa' })
    expect(img.tagName).toBe('IMG')
    expect(img).toHaveAttribute('src', photo)
  })

  it('swaps to the initials when the image fails to load', () => {
    render(<RequestAvatar name="Zia Rosa" picture={photo} />)
    fireEvent.error(screen.getByRole('img', { name: 'Zia Rosa' }))
    const fallback = screen.getByRole('img', { name: 'Zia Rosa' })
    expect(fallback.tagName).not.toBe('IMG')
    expect(fallback).toHaveTextContent('ZR')
    expect(document.querySelector('img')).toBeNull()
  })

  it('shows the initials at once when there is no photo', () => {
    render(<RequestAvatar name="Zia Rosa" picture="" />)
    expect(screen.getByRole('img', { name: 'Zia Rosa' })).toHaveTextContent('ZR')
    expect(document.querySelector('img')).toBeNull()
  })

  it('tries again when the photo address changes after a failure', () => {
    const { rerender } = render(<RequestAvatar name="Zia Rosa" picture={photo} />)
    fireEvent.error(screen.getByRole('img', { name: 'Zia Rosa' }))
    expect(document.querySelector('img')).toBeNull()
    rerender(<RequestAvatar name="Zia Rosa" picture="https://lh3.googleusercontent.com/a/zia2" />)
    expect(document.querySelector('img')).toHaveAttribute('src', 'https://lh3.googleusercontent.com/a/zia2')
  })
})
