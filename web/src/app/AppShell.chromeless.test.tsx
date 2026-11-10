import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppShell } from './AppShell'

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
  it('hides both bars and the avatar menu on /board but still shows the page', () => {
    at('/board')
    expect(screen.getByRole('heading', { name: 'Board page' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Bottom bar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Side rail' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Your menu' })).not.toBeInTheDocument()
  })

  it('does the same in Cook Mode', () => {
    at('/cook/recipe/12')
    expect(screen.getByRole('heading', { name: 'Cook page' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Bottom bar' })).not.toBeInTheDocument()
  })

  it('keeps the bars on ordinary routes', () => {
    at('/plan')
    expect(screen.getByRole('navigation', { name: 'Bottom bar' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Side rail' })).toBeInTheDocument()
  })
})
