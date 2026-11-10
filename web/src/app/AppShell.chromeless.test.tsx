import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

vi.mock('./ShellStatus', () => ({ ShellStatus: () => <div data-testid="shell-status" /> }))

function at(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell user={{ displayName: 'Anna Rossi' }} onSignOut={() => {}} />,
        children: [
          { path: 'board', element: createElement('h1', null, 'Board page') },
          { path: 'cook/recipe/:id', element: createElement('h1', null, 'Cook page') },
          { path: 'plan', element: createElement('h1', null, 'Plan page') },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
}

describe('AppShell on chromeless routes', () => {
  it('hides both bars, the avatar menu and the status slot on /board but still shows the page', () => {
    at('/board')
    expect(screen.getByRole('heading', { name: 'Board page' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Bottom bar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Side rail' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Your menu' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('shell-status')).not.toBeInTheDocument()
  })

  it('does the same in Cook Mode', () => {
    at('/cook/recipe/12')
    expect(screen.getByRole('heading', { name: 'Cook page' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Bottom bar' })).not.toBeInTheDocument()
  })

  // B3: the desktop grid (side rail column) must not apply, and the page is not capped to the content width.
  it.each(['/board', '/cook/recipe/12'])('%s: the frame is full-viewport (chromeless modifier on the frame and the main)', (path) => {
    at(path)
    const main = screen.getByRole('main')
    expect(main).toHaveClass('app-main', 'app-main--full')
    expect(main.parentElement).toHaveClass('app-shell', 'app-shell--chromeless')
  })

  it('keeps the bars and the capped content width on ordinary routes', () => {
    at('/plan')
    expect(screen.getByRole('navigation', { name: 'Bottom bar' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Side rail' })).toBeInTheDocument()
    const main = screen.getByRole('main')
    expect(main).not.toHaveClass('app-main--full')
    expect(main.parentElement).not.toHaveClass('app-shell--chromeless')
    expect(screen.getByTestId('shell-status')).toBeInTheDocument()
  })
})
