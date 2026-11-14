import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

vi.mock('./ShellStatus', () => ({ ShellStatus: () => null }))

// b8-shop: the "Feeder" wordmark is in the top bar at every width (CSS no longer hides it on a phone), with the brand mark before it.
describe('AppShell top bar brand', () => {
  function bar() {
    const router = createMemoryRouter([{ path: '/', element: <AppShell user={{ displayName: 'Anna Rossi' }} onSignOut={() => {}} />, children: [{ index: true, element: <p>Home</p> }] }])
    render(<RouterProvider router={router} />)
    return screen.getByRole('banner')
  }
  it('shows the word "Feeder" and the mark, the mark hidden from assistive tech', () => {
    const header = bar()
    const brand = header.querySelector('.top-bar__brand')!
    expect(brand).toHaveTextContent('Feeder')
    expect(brand.querySelector('.top-bar__brand-word')).toHaveTextContent(/^Feeder$/)
    expect(brand.querySelector('svg.brand-mark')).toHaveAttribute('aria-hidden', 'true')
    expect(brand.firstElementChild?.tagName.toLowerCase()).toBe('svg')
  })
  it('puts the brand before the avatar menu (brand left, avatar right)', () => {
    const header = bar()
    const brand = header.querySelector('.top-bar__brand')!
    const menu = header.querySelector('.your-menu-anchor')!
    expect(brand.compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('does not name the app twice for a screen reader (the brand is not a landmark or a heading)', () => {
    const header = bar()
    expect(header.querySelector('h1, h2, [role=heading]')).toBeNull()
  })
})
