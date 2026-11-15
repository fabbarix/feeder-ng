// B9-18 (SAFE R2, SAFE 1 and 6): useLeaveGuard(dirty, { what }), the "Leave without saving?" dialog for in-app exits.
//
// API pinned here (ui/useLeaveGuard.ts; needs a data router (createBrowserRouter / createMemoryRouter) and a ConfirmProvider):
//   const guard = useLeaveGuard(dirty: boolean, opts: {
//     what: string               "Pasta al pomodoro", "your preferences", "Household settings": what the changes are to
//     isNew?: boolean            a record that was never saved: the lead is "This new <what> is not saved." and the note "If you leave, it is lost."
//     onDiscard?: () => void     runs when Discard changes is chosen, before the navigation continues (drops the reload draft)
//   }): {
//     bypass<T>(fn: () => T): T                 runs fn with the guard off, synchronously: Save and Cancel navigate through it
//     confirmLeave(): Promise<boolean>          the same dialog for an exit that is not a router navigation (Sign out): true at once when clean
//   }
// The dialog: tone danger; title "Leave without saving?"; lead "Your changes to <what> are not saved."; note "If you leave, they are lost.";
// Keep editing (outline, focused, = Escape) and Discard changes (danger); no Close. No beforeunload prompt.
// Not blocked: a hash-only change on the same path and search, and anything while clean.
// Keep editing returns focus to the control that started the navigation, or to the page <h1> when that was a text field or nothing; never to a text field.
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Link, RouterProvider, createMemoryRouter, useNavigate } from 'react-router-dom'
import { ConfirmProvider } from './ConfirmDialog'
import { useLeaveGuard } from './useLeaveGuard'

afterEach(() => vi.restoreAllMocks())

function Editor({ dirty, isNew, what = 'Pasta al pomodoro', onDiscard, onGuard }: { dirty: boolean; isNew?: boolean; what?: string; onDiscard?: () => void; onGuard?: (g: ReturnType<typeof useLeaveGuard>) => void }) {
  const guard = useLeaveGuard(dirty, { what, isNew, onDiscard })
  onGuard?.(guard)
  const navigate = useNavigate()
  return (
    <main>
      <h1 tabIndex={-1}>Edit Recipe</h1>
      <input aria-label="Name" />
      <Link to="/plan">Plan</Link>
      <Link to="/recipes/7/edit#steps">Steps</Link>
      <button onClick={() => navigate('/plan')}>go plan</button>
      <button onClick={() => guard.bypass(() => navigate('/plan'))}>save and leave</button>
      <button onClick={() => void guard.confirmLeave().then((ok) => ok && document.body.setAttribute('data-left', 'yes'))}>sign out</button>
    </main>
  )
}

function mount(props: Parameters<typeof Editor>[0]) {
  const router = createMemoryRouter(
    [
      { path: '/recipes/:id/edit', element: <Editor {...props} /> },
      { path: '/plan', element: <h1>Plan page</h1> },
    ],
    { initialEntries: ['/recipes/7/edit'] },
  )
  render(
    <ConfirmProvider>
      <RouterProvider router={router} />
    </ConfirmProvider>,
  )
  return router
}

const dialog = () => screen.queryByRole('dialog', { name: 'Leave without saving?' })

describe('while clean', () => {
  it('nothing is blocked', async () => {
    const router = mount({ dirty: false })
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    expect(router.state.location.pathname).toBe('/plan')
    expect(dialog()).toBeNull()
  })

  it('confirmLeave() is true at once with no dialog', async () => {
    mount({ dirty: false })
    await userEvent.click(screen.getByRole('button', { name: 'sign out' }))
    expect(dialog()).toBeNull()
    await waitFor(() => expect(document.body).toHaveAttribute('data-left', 'yes'))
    document.body.removeAttribute('data-left')
  })
})

describe('while dirty: the dialog', () => {
  it('a link to another page opens "Leave without saving?" and does not navigate yet', async () => {
    const router = mount({ dirty: true })
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    const d = await screen.findByRole('dialog', { name: 'Leave without saving?' })
    expect(router.state.location.pathname).toBe('/recipes/7/edit')
    expect(d).toHaveTextContent('Your changes to Pasta al pomodoro are not saved.')
    expect(d).toHaveTextContent('If you leave, they are lost.')
  })

  it('a new record: "This new Recipe is not saved." and "If you leave, it is lost."', async () => {
    mount({ dirty: true, isNew: true, what: 'Recipe' })
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    const d = await screen.findByRole('dialog', { name: 'Leave without saving?' })
    expect(d).toHaveTextContent('This new Recipe is not saved.')
    expect(d).toHaveTextContent('If you leave, it is lost.')
  })

  it('Keep editing has focus, is the only safe button, and there is no Close', async () => {
    mount({ dirty: true })
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    await screen.findByRole('dialog')
    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  it('Discard changes calls onDiscard, then continues to the destination', async () => {
    const onDiscard = vi.fn()
    const router = mount({ dirty: true, onDiscard })
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/plan'))
    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(dialog()).toBeNull()
  })

  it('Keep editing stays on the page, calls nothing, and a second attempt asks again', async () => {
    const onDiscard = vi.fn()
    const router = mount({ dirty: true, onDiscard })
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }))
    expect(router.state.location.pathname).toBe('/recipes/7/edit')
    expect(onDiscard).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    expect(await screen.findByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument()
  })

  it('Escape is Keep editing', async () => {
    const router = mount({ dirty: true })
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    expect(dialog()).toBeNull()
    expect(router.state.location.pathname).toBe('/recipes/7/edit')
  })

  it('browser Back (a POP) is blocked too', async () => {
    const router = createMemoryRouter(
      [
        { path: '/plan', element: <h1>Plan page</h1> },
        { path: '/recipes/:id/edit', element: <Editor dirty /> },
      ],
      { initialEntries: ['/plan', '/recipes/7/edit'], initialIndex: 1 },
    )
    render(
      <ConfirmProvider>
        <RouterProvider router={router} />
      </ConfirmProvider>,
    )
    await act(async () => void router.navigate(-1))
    expect(await screen.findByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/recipes/7/edit')
  })

  it('does not ask for a hash-only change on the same page (the section index)', async () => {
    const router = mount({ dirty: true })
    await userEvent.click(screen.getByRole('link', { name: 'Steps' }))
    expect(dialog()).toBeNull()
    expect(router.state.location.hash).toBe('#steps')
  })

  it('never installs a beforeunload prompt', () => {
    const add = vi.spyOn(window, 'addEventListener')
    mount({ dirty: true })
    expect(add.mock.calls.map((c) => c[0])).not.toContain('beforeunload')
    expect(window.onbeforeunload).toBeNull()
  })

  it('the guard follows `dirty`: it blocks only while true', async () => {
    const router = createMemoryRouter(
      [
        { path: '/recipes/:id/edit', element: <Toggle /> },
        { path: '/plan', element: <h1>Plan page</h1> },
      ],
      { initialEntries: ['/recipes/7/edit'] },
    )
    function Toggle() {
      const [dirty, setDirty] = useState(true)
      useLeaveGuard(dirty, { what: 'Pasta al pomodoro' })
      return (
        <main>
          <button onClick={() => setDirty(false)}>clean</button>
          <Link to="/plan">Plan</Link>
        </main>
      )
    }
    render(
      <ConfirmProvider>
        <RouterProvider router={router} />
      </ConfirmProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'clean' }))
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    expect(dialog()).toBeNull()
    expect(router.state.location.pathname).toBe('/plan')
  })
})

describe('Save and Cancel go through bypass', () => {
  it('guard.bypass(() => navigate(...)) leaves a dirty page with no dialog', async () => {
    const router = mount({ dirty: true })
    await userEvent.click(screen.getByRole('button', { name: 'save and leave' }))
    expect(dialog()).toBeNull()
    expect(router.state.location.pathname).toBe('/plan')
  })

  it('bypass returns what fn returns and turns the guard back on afterwards', async () => {
    let g!: ReturnType<typeof useLeaveGuard>
    mount({ dirty: true, onGuard: (x) => (g = x) })
    expect(g.bypass(() => 42)).toBe(42)
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    expect(await screen.findByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument()
  })
})

describe('non-router exits: confirmLeave (Sign out)', () => {
  it('asks the same dialog; Keep editing resolves false, Discard changes calls onDiscard and resolves true', async () => {
    const onDiscard = vi.fn()
    mount({ dirty: true, onDiscard })
    await userEvent.click(screen.getByRole('button', { name: 'sign out' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }))
    expect(document.body).not.toHaveAttribute('data-left')
    await userEvent.click(screen.getByRole('button', { name: 'sign out' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(document.body).toHaveAttribute('data-left', 'yes'))
    expect(onDiscard).toHaveBeenCalledTimes(1)
    document.body.removeAttribute('data-left')
  })
})

describe('where focus goes after Keep editing (SHORT 2: the keyboard stays down)', () => {
  it('back to the link that started the navigation', async () => {
    mount({ dirty: true })
    const link = screen.getByRole('link', { name: 'Plan' })
    await userEvent.click(link)
    await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }))
    expect(link).toHaveFocus()
  })

  it('to the page title when focus was in a text field: never back into the field', async () => {
    mount({ dirty: true })
    act(() => screen.getByLabelText('Name').focus())
    await userEvent.click(screen.getByRole('button', { name: 'go plan' }))
    const keep = await screen.findByRole('button', { name: 'Keep editing' })
    await userEvent.click(keep)
    expect(screen.getByLabelText('Name')).not.toHaveFocus()
    expect(screen.getByRole('heading', { name: 'Edit Recipe' })).toHaveFocus()
  })
})
