// B9-19: the shell's markup for the R-F bar (DS-02), and the keyboard hook mounted once (SHORT-04, SHORT 2).
import { act, render, screen, within } from '@testing-library/react'
import { createElement } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

vi.mock('./ShellStatus', () => ({ ShellStatus: () => <div data-testid="shell-status" /> }))

function at(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell user={{ displayName: 'Anna Rossi' }} onSignOut={() => {}} />,
        children: [
          { index: true, element: createElement('input', { 'aria-label': 'Name' }) },
          { path: 'plan', element: createElement('h1', null, 'Plan page') },
          { path: 'scan', element: createElement('h1', null, 'Scan page') },
          { path: 'board', element: createElement('input', { 'aria-label': 'Board name' }) },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}
const bar = () => screen.getByRole('navigation', { name: 'Bottom bar' })

describe('bottom bar markup (DS-02 / R-F)', () => {
  it('every link wraps its icon in <span class="bottom-bar__icon" aria-hidden="true"> and keeps the label span beside it', () => {
    at('/plan')
    for (const link of within(bar()).getAllByRole('link')) {
      const icon = link.querySelector('span.bottom-bar__icon')
      expect(icon, link.textContent ?? '').not.toBeNull()
      expect(icon).toHaveAttribute('aria-hidden', 'true')
      expect(icon!.querySelector('svg')).not.toBeNull()
      const label = link.querySelector('span.bottom-bar__label')
      expect(label).not.toBeNull()
      expect(icon!.nextElementSibling).toBe(label) // the icon span first, then the label, as flex children of the link
    }
  })

  it('the label stays the link\'s accessible name at every width (icons only is CSS: the span is hidden visually, never removed)', () => {
    at('/plan')
    for (const name of ['Today', 'Plan', 'Pantry', 'Scan', 'Shop', 'Recipes', 'Settings']) {
      expect(within(bar()).getByRole('link', { name })).toBeInTheDocument()
    }
  })

  it('the current page has aria-current on the link, Scan included', () => {
    at('/scan')
    expect(within(bar()).getByRole('link', { name: 'Scan' })).toHaveAttribute('aria-current', 'page')
    expect(within(bar()).getByRole('link', { name: 'Plan' })).not.toHaveAttribute('aria-current')
  })

  it('A11Y-06: the current page is marked by more than colour: aria-current, the soft squircle, and the filled icon (Phosphor fill weight)', () => {
    at('/plan')
    const current = within(bar()).getByRole('link', { name: 'Plan' })
    const other = within(bar()).getByRole('link', { name: 'Today' })
    expect(current.querySelector('svg')?.outerHTML).not.toBe(other.querySelector('svg')?.outerHTML)
  })

  it('the 88 px side rail keeps its markup (the pill span behind the icon)', () => {
    at('/plan')
    for (const link of within(screen.getByRole('navigation', { name: 'Side rail', hidden: true })).getAllByRole('link', { hidden: true })) {
      expect(link.querySelector('span.side-rail__pill')).not.toBeNull()
      expect(link.querySelector('.bottom-bar__icon')).toBeNull()
    }
  })
})

describe('AppShell mounts useKeyboardInset once (SHORT 2)', () => {
  const html = document.documentElement
  afterEach(() => {
    vi.unstubAllGlobals()
    html.removeAttribute('data-keyboard')
    html.style.removeProperty('--keyboard-inset')
  })
  const coarse = () =>
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('pointer: coarse'), media: q, addEventListener() {}, removeEventListener() {} }))

  it('a text field in a page opens the keyboard state on a coarse pointer', () => {
    coarse()
    at('/')
    act(() => screen.getByLabelText('Name').focus())
    expect(html.getAttribute('data-keyboard')).toBe('open')
  })

  it('the chromeless frame (the receipt screens carry a sticky Save bar there) mounts it too', () => {
    coarse()
    at('/board')
    act(() => screen.getByLabelText('Board name').focus())
    expect(html.getAttribute('data-keyboard')).toBe('open')
  })

  it('unmounting the shell clears the state', () => {
    coarse()
    const { unmount } = at('/')
    act(() => screen.getByLabelText('Name').focus())
    expect(html.getAttribute('data-keyboard')).toBe('open')
    unmount()
    expect(html.getAttribute('data-keyboard')).toBeNull()
  })
})
