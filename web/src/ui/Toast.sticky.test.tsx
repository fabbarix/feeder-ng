// B9-18 (SAFE R1, SAFE 5, review items): what stays on screen. Sticky ("stay until acted on"), protected toasts that ordinary
// toasts never push out, one ordinary toast at a time, and the Dismiss button rules.
//
// API pinned here (ui/Toast.tsx):
//   ToastContent.sticky?: boolean        stays until an action or Dismiss is used; no timer (an explicit durationMs is ignored)
//   ToastOptions.sticky?: boolean        the same for the string form
//   ToastAction.role?: 'undo' | 'dismiss'
//        'undo'    this toast carries a pending Undo: 8 s by default, protected, the Ctrl+Z / Cmd+Z target
//        'dismiss' this action only closes the toast ("Later"): the round Dismiss button is not drawn
//   show(...) returns a ToastHandle { id: number; dismiss(): void }
// Lanes: an ordinary toast replaces the previous ordinary toast; an error replaces the previous error; a sticky toast replaces the
// previous sticky toast; a toast with an Undo replaces the previous Undo toast. A toast in one lane never pushes out another lane.
import { act, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Fire, Grab, fireButton, setupTimed, titles, toasts, type Api } from './Toast.test-helper'

afterEach(() => vi.useRealTimers())

const update = {
  status: 'info' as const,
  title: 'A new version of Feeder is ready',
  sticky: true,
  actions: [
    { label: 'Reload', onClick: () => {} },
    { label: 'Later', role: 'dismiss' as const, onClick: () => {} },
  ],
}
const undo = (title: string) => ({ title, actions: [{ label: 'Undo', role: 'undo' as const, onClick: () => {} }] })

describe('a sticky toast stays until acted on (the update prompt)', () => {
  it('has no timer: still there after a day', async () => {
    const { user, mount } = setupTimed()
    mount(<Fire arg={update} />)
    await user.click(fireButton())
    act(() => void vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1000))
    expect(screen.getByText('A new version of Feeder is ready')).toBeInTheDocument()
  })

  it('the string form takes { sticky: true } too', async () => {
    const { user, mount } = setupTimed()
    mount(<Fire arg="Back online" opts={{ sticky: true }} />)
    await user.click(fireButton())
    act(() => void vi.advanceTimersByTime(60_000))
    expect(screen.getByText('Back online')).toBeInTheDocument()
  })

  it('an action closes it, and so does Dismiss', async () => {
    const { user, mount } = setupTimed()
    mount(<Fire arg={{ title: 'Offline copy ready', sticky: true }} />)
    await user.click(fireButton())
    await user.click(within(toasts()[0]!).getByRole('button', { name: 'Dismiss' }))
    expect(toasts()).toHaveLength(0)
  })

  it('is not pushed out by ordinary toasts', async () => {
    const { user, mount } = setupTimed()
    mount(
      <>
        <Fire arg={update} name="update" />
        <Fire arg="Saved" name="a" />
        <Fire arg="Added Passata" name="b" />
        <Fire arg="Moved" name="c" />
      </>,
    )
    await user.click(fireButton('update'))
    await user.click(fireButton('a'))
    await user.click(fireButton('b'))
    await user.click(fireButton('c'))
    expect(titles()).toContain('A new version of Feeder is ready')
    expect(titles()).toContain('Moved')
  })

  it('is not pushed out by an error either, and an error is not pushed out by it', async () => {
    const { user, mount } = setupTimed()
    mount(
      <>
        <Fire arg="Could not save" opts={{ status: 'error' }} name="err" />
        <Fire arg={update} name="update" />
        <Fire arg="Saved" name="ok" />
      </>,
    )
    await user.click(fireButton('err'))
    await user.click(fireButton('update'))
    await user.click(fireButton('ok'))
    expect(titles().sort()).toEqual(['A new version of Feeder is ready', 'Could not save', 'Saved'].sort())
  })
})

describe('one ordinary toast at a time (SAFE R1)', () => {
  it('a new ordinary toast replaces the previous one; nothing stacks', async () => {
    const { user, mount } = setupTimed()
    mount(
      <>
        <Fire arg="one" name="a" />
        <Fire arg="two" name="b" />
        <Fire arg="three" name="c" />
      </>,
    )
    await user.click(fireButton('a'))
    await user.click(fireButton('b'))
    expect(titles()).toEqual(['two'])
    await user.click(fireButton('c'))
    expect(titles()).toEqual(['three'])
  })

  it('a replaced toast leaves no timer behind that could close its successor early', async () => {
    const { user, mount } = setupTimed()
    mount(
      <>
        <Fire arg="one" name="a" />
        <Fire arg="two" name="b" />
      </>,
    )
    await user.click(fireButton('a'))
    act(() => void vi.advanceTimersByTime(3000))
    await user.click(fireButton('b'))
    act(() => void vi.advanceTimersByTime(2000)) // one's 4 s would end here
    expect(titles()).toEqual(['two'])
    act(() => void vi.advanceTimersByTime(2100))
    expect(titles()).toEqual([])
  })
})

describe('a toast with a pending Undo is never evicted by an ordinary toast', () => {
  it('stays through three ordinary toasts and an error', async () => {
    const { user, mount } = setupTimed()
    mount(
      <>
        <Fire arg={undo('Sam removed')} name="undo" />
        <Fire arg="a" name="a" />
        <Fire arg="b" name="b" />
        <Fire arg="c" name="c" />
        <Fire arg="Could not sync" opts={{ status: 'error' }} name="err" />
      </>,
    )
    await user.click(fireButton('undo'))
    for (const n of ['a', 'b', 'c', 'err']) await user.click(fireButton(n))
    expect(titles()).toContain('Sam removed')
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })

  it('a newer Undo toast replaces the older Undo toast (only the newest Undo is offered)', async () => {
    const { user, mount } = setupTimed()
    mount(
      <>
        <Fire arg={undo('Sam removed')} name="a" />
        <Fire arg={undo('Dinner removed')} name="b" />
      </>,
    )
    await user.click(fireButton('a'))
    await user.click(fireButton('b'))
    expect(titles()).toEqual(['Dinner removed'])
  })

  it('an Undo toast and a sticky toast and an ordinary toast can be on screen together', async () => {
    const { user, mount } = setupTimed()
    mount(
      <>
        <Fire arg={update} name="update" />
        <Fire arg={undo('Sam removed')} name="undo" />
        <Fire arg="Saved" name="ok" />
      </>,
    )
    await user.click(fireButton('update'))
    await user.click(fireButton('undo'))
    await user.click(fireButton('ok'))
    expect(toasts()).toHaveLength(3)
  })
})

describe('the handle show() returns', () => {
  it('dismiss() closes that toast and no other', async () => {
    const into: { api?: Api } = {}
    const { mount } = setupTimed()
    mount(<Grab into={into} />)
    let a: ReturnType<Api['show']> | undefined
    let b: ReturnType<Api['show']> | undefined
    act(() => {
      a = into.api!.show(update)
      b = into.api!.show('Saved')
    })
    expect(typeof a!.id).toBe('number')
    expect(a!.id).not.toBe(b!.id)
    act(() => b!.dismiss())
    expect(titles()).toEqual(['A new version of Feeder is ready'])
    act(() => a!.dismiss())
    expect(toasts()).toHaveLength(0)
  })

  it('dismiss() of a toast that is already gone does nothing', () => {
    const into: { api?: Api } = {}
    const { mount } = setupTimed()
    mount(<Grab into={into} />)
    let h: ReturnType<Api['show']> | undefined
    act(() => void (h = into.api!.show('Saved')))
    act(() => h!.dismiss())
    expect(() => act(() => h!.dismiss())).not.toThrow()
  })
})

describe('the Dismiss button', () => {
  it('is drawn on a toast with no actions, and on a toast whose actions do more than close it (Review, Undo)', async () => {
    const { user, mount } = setupTimed()
    mount(
      <>
        <Fire arg="Saved" name="plain" />
        <Fire arg={{ title: 'Swapped Tue Dinner', actions: [{ label: 'Review', onClick: () => {} }, { label: 'Undo', role: 'undo', onClick: () => {} }] }} name="rich" />
      </>,
    )
    await user.click(fireButton('plain'))
    expect(within(toasts()[0]!).getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
    await user.click(fireButton('rich'))
    expect(within(toasts()[0]!).getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  })

  it('is NOT drawn when an action already only closes the toast (Reload / Later): no round X (RES-10)', async () => {
    const { user, mount } = setupTimed()
    mount(<Fire arg={update} />)
    await user.click(fireButton())
    const toast = toasts()[0]!
    expect(within(toast).queryByRole('button', { name: 'Dismiss' })).toBeNull()
    expect(toast.querySelector('.toast__dismiss')).toBeNull()
    expect(within(toast).getByRole('button', { name: 'Later' })).toBeInTheDocument()
  })

  it('a dismiss-role action closes the toast and still runs its handler', async () => {
    const later = vi.fn()
    const { user, mount } = setupTimed()
    mount(<Fire arg={{ ...update, actions: [{ label: 'Later', role: 'dismiss', onClick: later }] }} />)
    await user.click(fireButton())
    await user.click(screen.getByRole('button', { name: 'Later' }))
    expect(later).toHaveBeenCalledTimes(1)
    expect(toasts()).toHaveLength(0)
  })

  it('the toast has data-dismiss="none" when it has no Dismiss, so its layout can drop the column', async () => {
    const { user, mount } = setupTimed()
    mount(<Fire arg={update} />)
    await user.click(fireButton())
    expect(toasts()[0]).toHaveAttribute('data-dismiss', 'none')
  })
})
