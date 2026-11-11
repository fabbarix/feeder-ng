// R2-L (L-01): the shell wraps every non-chromeless route in the Page container, width from the route table (app/pageWidths.ts).
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { usePageWidth } from '../ui'
import { AppShell } from './AppShell'

vi.mock('./ShellStatus', () => ({ ShellStatus: () => <div /> }))

function Probe() {
  return <p data-testid="probe">{usePageWidth()}</p>
}
function mount(path: string) {
  const router = createMemoryRouter(
    [{ path: '/', element: <AppShell user={{ displayName: 'Anna' }} onSignOut={() => {}} />, children: [{ index: true, element: <Probe /> }, { path: '*', element: <Probe /> }] }],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}

describe('AppShell page container', () => {
  it.each([
    ['/plan', 'wide'],
    ['/shop', 'wide'],
    ['/recipes', 'wide'],
    ['/', 'wide'],
    ['/pantry', 'default'],
    ['/recipes/3/edit', 'default'],
    ['/scan', 'narrow'],
    ['/settings/members', 'narrow'],
    ['/ingredients/7', 'narrow'],
  ])('%s renders inside a %s Page', (path, width) => {
    const { container } = mount(path)
    const main = container.querySelector('main')!
    const page = main.querySelector('[data-page-width]')!
    expect(main.querySelectorAll('[data-page-width]')).toHaveLength(1)
    expect(page).toHaveAttribute('data-page-width', width)
    expect(page).toHaveClass('page')
    expect(page.querySelector('[data-testid="probe"]')).toHaveTextContent(width) // screens can read the width via usePageWidth()
  })
  it('the Page is the direct child of <main> (centring is relative to the area right of the rail)', () => {
    const { container } = mount('/plan')
    expect(container.querySelector('main > .page')).not.toBeNull()
  })
  it.each(['/board', '/cook/recipe/3'])('%s is chromeless: no Page container, main stays full-bleed', (path) => {
    const { container } = mount(path)
    expect(container.querySelector('[data-page-width]')).toBeNull()
    expect(container.querySelector('main')).toHaveClass('app-main--full')
  })
  it('the error boundary sits inside the Page, so an error keeps the page width', () => {
    const { container } = mount('/plan')
    expect(container.querySelector('.page [data-testid="probe"]')).not.toBeNull()
  })
})
