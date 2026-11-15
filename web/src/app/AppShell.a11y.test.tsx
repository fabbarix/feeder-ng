// B9-49 (A11Y-01, A11Y-10, A11Y-12): what the shell does for keyboard and screen-reader Users.
//   A11Y-01  <main id="main-content" tabIndex={-1}> in both frames; the provisional document title from the route table until a page's
//            h1 sets its own (never overwriting it); focus to the h1 on a pathname change, in the chromeless frame too.
//   A11Y-10  "Skip to content": the first focusable element of the framed shell, a link to #main-content; it focuses the page's h1,
//            else <main>; absent on chromeless screens.
//   A11Y-12  both <nav> elements are named "Main" (one is display: none at each size); the strings "Bottom bar" / "Side rail" are gone.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PageHeader } from '../ui'
import { bottomBarNav, sideRailNav } from '../test/shellNav'
import { AppShell } from './AppShell'
import { shellStrings } from './strings'

// ShellTimers polls with react-query (no QueryClient here); ShellStatus is covered on its own.
vi.mock('./ShellTimers', () => ({ ShellTimers: () => null }))
vi.mock('./ShellStatus', () => ({ ShellStatus: () => <div data-testid="shell-status" /> }))

beforeEach(() => {
  document.title = 'Stale title from the page before'
})

function mount(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell user={{ displayName: 'Anna Rossi' }} onSignOut={() => {}} />,
        children: [
          { index: true, element: <PageHeader title="Good evening" documentTitle="Today" /> },
          {
            path: 'recipes/:id',
            element: <PageHeader title="Pasta al pomodoro" breadcrumbs={[{ label: 'Recipes', to: '/recipes' }, { label: 'Pasta al pomodoro' }]} />,
          },
          { path: 'plan', element: <PageHeader title="Plan" /> },
          { path: 'loading', element: createElement('p', null, 'no heading yet') },
          { path: 'pantry', element: createElement('p', null, 'the Pantry has not rendered its heading yet') },
          { path: 'board', element: createElement('h1', { id: 'page-title', tabIndex: -1 }, 'Kitchen board') },
          { path: 'cook/recipe/:id', element: createElement('p', null, 'Cook page') },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('A11Y-12: the two navs are named "Main"', () => {
  it('shellStrings.mainNav is "Main" and the shape-describing names are gone', () => {
    expect(shellStrings.mainNav).toBe('Main')
    expect(shellStrings).not.toHaveProperty('bottomBar')
    expect(shellStrings).not.toHaveProperty('sideRail')
  })

  it('both <nav> elements carry aria-label="Main" (only one is shown at each size), so a screen reader says "Main navigation"', () => {
    mount('/plan')
    expect(bottomBarNav()).toHaveAttribute('aria-label', 'Main')
    expect(sideRailNav()).toHaveAttribute('aria-label', 'Main')
    expect(screen.getAllByRole('navigation', { name: 'Main' })).toHaveLength(2) // jsdom has no stylesheet: both exist
    expect(screen.queryByRole('navigation', { name: 'Bottom bar' })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Side rail' })).toBeNull()
  })
})

describe('A11Y-01: the main landmark and the document title', () => {
  it('<main> is the focus fallback in the framed shell: id="main-content" and tabIndex -1', () => {
    mount('/plan')
    const main = screen.getByRole('main')
    expect(main).toHaveAttribute('id', 'main-content')
    expect(main).toHaveAttribute('tabindex', '-1')
  })

  it('and in the chromeless frame', () => {
    mount('/board')
    const main = screen.getByRole('main')
    expect(main).toHaveAttribute('id', 'main-content')
    expect(main).toHaveAttribute('tabindex', '-1')
  })

  it('a page that names itself keeps its own title: the shell\'s provisional title never overwrites a mounted h1\'s', () => {
    mount('/recipes/1')
    expect(document.title).toBe('Pasta al pomodoro · Recipes · Feeder')
  })

  it('a page with no h1 yet (loading, failed) gets its section\'s title from the route table, never the last page\'s', async () => {
    const router = mount('/plan')
    expect(document.title).toBe('Plan · Feeder')
    await router.navigate('/pantry')
    expect(document.title).toBe('Pantry · Feeder')
  })

  it('two routes served by the same mounted PageHeader with the same title keep that page\'s own title, not the provisional one', async () => {
    const router = mount('/recipes/1')
    await router.navigate('/recipes/2')
    await vi.waitFor(() => expect(document.title).toBe('Pasta al pomodoro · Recipes · Feeder'))
  })

  it('a route that is not in the table is "Feeder"', async () => {
    const router = mount('/plan')
    await router.navigate('/loading')
    expect(document.title).toBe('Feeder')
  })

  it('a chromeless screen without its h1 yet is titled from the table too', async () => {
    const router = mount('/plan')
    await router.navigate('/cook/recipe/4')
    expect(document.title).toBe('Cook Mode · Feeder')
  })
})

describe('A11Y-01: focus follows a pathname change', () => {
  it('following a nav link moves focus to the new page\'s h1 (the screen reader reads the page name)', async () => {
    const router = mount('/plan')
    const bar = bottomBarNav()
    expect(document.activeElement).toBe(document.body)
    await router.navigate('/recipes/1')
    await vi.waitFor(() => expect(document.activeElement).toBe(document.getElementById('page-title')))
    expect(document.activeElement).toHaveTextContent('Pasta al pomodoro')
    expect(bar).toBeInTheDocument()
  })

  it('also when the next screen is chromeless (the board, Cook Mode render their own h1)', async () => {
    const router = mount('/plan')
    await router.navigate('/board')
    await vi.waitFor(() => expect(document.activeElement).toBe(document.getElementById('page-title')))
  })

  it('a chromeless page with no h1 (a Cook Mode that is slow to load) falls back to <main> after 2 s', async () => {
    vi.useFakeTimers()
    try {
      const router = mount('/plan')
      await router.navigate('/cook/recipe/4')
      await vi.advanceTimersByTimeAsync(2100)
      expect(document.activeElement).toBe(screen.getByRole('main'))
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('A11Y-10: the skip link', () => {
  it('is "Skip to content", a link to #main-content, and the first focusable element of the shell', async () => {
    mount('/plan')
    expect(shellStrings.skipToContent).toBe('Skip to content')
    const link = screen.getByRole('link', { name: 'Skip to content' })
    expect(link).toHaveClass('skip-link')
    expect(link).toHaveAttribute('href', '#main-content')
    const shell = document.querySelector('.app-shell')!
    expect(shell.firstElementChild).toBe(link)
    await userEvent.tab()
    expect(document.activeElement).toBe(link)
  })

  it('activating it focuses the page\'s h1 (the same target as a route change) and does not change the route', async () => {
    const router = mount('/plan')
    await userEvent.tab()
    await userEvent.keyboard('{Enter}')
    expect(document.activeElement).toBe(document.getElementById('page-title'))
    expect(router.state.location.pathname).toBe('/plan')
    expect(router.state.location.hash).toBe('')
  })

  it('with no h1 on the page it focuses <main>', async () => {
    mount('/loading')
    await userEvent.tab()
    await userEvent.keyboard('{Enter}')
    expect(document.activeElement).toBe(screen.getByRole('main'))
  })

  it.each(['/board', '/cook/recipe/4'])('is not rendered on the chromeless screen %s', (path) => {
    mount(path)
    expect(screen.queryByRole('link', { name: 'Skip to content' })).toBeNull()
  })

  it('is one link, before the nav links in tab order', () => {
    mount('/plan')
    expect(screen.getAllByRole('link', { name: 'Skip to content' })).toHaveLength(1)
    const focusables = [...document.querySelectorAll<HTMLElement>('a[href], button')]
    expect(focusables[0]).toHaveClass('skip-link')
  })
})
