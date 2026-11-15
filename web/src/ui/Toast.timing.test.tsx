// B9-18 (SAFE 5, SAFE R1, SSP-12, A11Y): when a toast leaves, what pauses it, the Undo shortcut, hold(), and how it is read.
//
// API pinned here (ui/Toast.tsx), on top of Toast.sticky.test.tsx:
//   a toast with an action of role 'undo'  lasts 8000 ms (UNDO_DURATION_MS); an explicit durationMs wins (Scan keeps 5000)
//   any toast with a timer pauses on pointerenter / mouseenter, on focusin inside it, and while document.hidden;
//   it resumes with its remaining time, but never with less than 2000 ms (RESUME_MIN_MS) so Undo cannot vanish as the pointer leaves
//   Ctrl+Z / Cmd+Z, when focus is not in a text field, runs the newest visible Undo and closes that toast
//   useToast().hold(): () => void   no toast is shown until every holder has released; on release the latest held toast of each lane
//                                   shows (full duration); errors and sticky toasts are never held
import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Fire, Grab, fireButton, setHidden, setupTimed, titles, toasts, type Api } from './Toast.test-helper'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const undoToast = (onUndo = () => {}, title = 'Sam removed') => ({
  title,
  actions: [{ label: 'Undo', ariaLabel: 'Undo: put Sam back', role: 'undo' as const, onClick: onUndo }],
})
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

describe('durations (SAFE 5)', () => {
  it('a toast with an Undo lasts 8 s: there at 7.8 s, gone at 8.2 s', async () => {
    const { user, mount } = setupTimed()
    mount(<Fire arg={undoToast()} />)
    await user.click(fireButton())
    tick(7800)
    expect(titles()).toEqual(['Sam removed'])
    tick(400)
    expect(titles()).toEqual([])
  })

  it('an explicit durationMs wins over the Undo default (Scan keeps 5 s)', async () => {
    const { user, mount } = setupTimed()
    mount(<Fire arg={{ ...undoToast(), durationMs: 5000 }} />)
    await user.click(fireButton())
    tick(4800)
    expect(titles()).toEqual(['Sam removed'])
    tick(400)
    expect(titles()).toEqual([])
  })

  it('the legacy string form with actionLabel stays 6 s (it is not an Undo toast); a plain toast stays 4 s', async () => {
    const { user, mount } = setupTimed()
    mount(
      <>
        <Fire arg="Removed" opts={{ actionLabel: 'Undo', onAction: () => {} }} name="legacy" />
        <Fire arg="Saved" name="plain" />
      </>,
    )
    await user.click(fireButton('legacy'))
    tick(5800)
    expect(titles()).toEqual(['Removed'])
    tick(400)
    expect(titles()).toEqual([])
    await user.click(fireButton('plain'))
    tick(3800)
    expect(titles()).toEqual(['Saved'])
    tick(400)
    expect(titles()).toEqual([])
  })
})

describe('pausing (SAFE 5: hover, focus, page hidden)', () => {
  it('pointing at the toast pauses it; leaving resumes with the time that was left', async () => {
    const { user, mount } = setupTimed()
    mount(<Fire arg={undoToast()} />)
    await user.click(fireButton())
    tick(5000) // 3 s left
    await user.hover(toasts()[0]!)
    tick(60_000)
    expect(titles()).toEqual(['Sam removed'])
    await user.unhover(toasts()[0]!)
    tick(2800)
    expect(titles()).toEqual(['Sam removed']) // the 3 s that were left, not 8 s and not 0
    tick(400)
    expect(titles()).toEqual([])
  })

  it('leaving with less than 2 s left still gives 2 s (Undo cannot vanish under the pointer)', async () => {
    const { user, mount } = setupTimed()
    mount(<Fire arg={undoToast()} />)
    await user.click(fireButton())
    tick(7500) // 0.5 s left
    await user.hover(toasts()[0]!)
    tick(10_000)
    await user.unhover(toasts()[0]!)
    tick(1800)
    expect(titles()).toEqual(['Sam removed'])
    tick(400)
    expect(titles()).toEqual([])
  })

  it('focus inside the toast pauses it; moving focus out resumes it', async () => {
    const { user, mount } = setupTimed()
    mount(<Fire arg={undoToast()} />)
    await user.click(fireButton())
    tick(6000)
    act(() => within(toasts()[0]!).getByRole('button', { name: 'Undo: put Sam back' }).focus())
    tick(60_000)
    expect(titles()).toEqual(['Sam removed'])
    act(() => fireButton().focus())
    tick(2200)
    expect(titles()).toEqual([])
  })

  it('while the page is hidden the timer is paused, and it runs again when the page is visible', async () => {
    const { user, mount } = setupTimed()
    mount(<Fire arg={undoToast()} />)
    await user.click(fireButton())
    tick(2000)
    act(() => setHidden(true))
    tick(60_000)
    expect(titles()).toEqual(['Sam removed'])
    act(() => setHidden(false))
    tick(5800)
    expect(titles()).toEqual(['Sam removed'])
    tick(400)
    expect(titles()).toEqual([])
  })

  it('a toast shown while the page is hidden does not start its timer until the page is visible', async () => {
    const { mount } = setupTimed()
    const into: { api?: Api } = {}
    mount(<Grab into={into} />)
    act(() => setHidden(true))
    act(() => void into.api!.show('Saved'))
    tick(30_000)
    expect(titles()).toEqual(['Saved'])
    act(() => setHidden(false))
    tick(3800)
    expect(titles()).toEqual(['Saved'])
    tick(400)
    expect(titles()).toEqual([])
  })

  it('an error toast has no timer to pause and stays', async () => {
    const { user, mount } = setupTimed()
    mount(<Fire arg="Could not save" opts={{ status: 'error' }} />)
    await user.click(fireButton())
    tick(120_000)
    expect(titles()).toEqual(['Could not save'])
  })
})

describe('Ctrl+Z / Cmd+Z runs the newest visible Undo', () => {
  const press = (init: KeyboardEventInit, target: Element = document.body) => {
    const ev = new KeyboardEvent('keydown', { key: 'z', bubbles: true, cancelable: true, ...init })
    act(() => void target.dispatchEvent(ev))
    return ev
  }

  it('Ctrl+Z runs the Undo, closes the toast and consumes the key', async () => {
    const onUndo = vi.fn()
    const { user, mount } = setupTimed()
    mount(<Fire arg={undoToast(onUndo)} />)
    await user.click(fireButton())
    const ev = press({ ctrlKey: true })
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(toasts()).toHaveLength(0)
    expect(ev.defaultPrevented).toBe(true)
  })

  it('Cmd+Z does the same (macOS)', async () => {
    const onUndo = vi.fn()
    const { user, mount } = setupTimed()
    mount(<Fire arg={undoToast(onUndo)} />)
    await user.click(fireButton())
    press({ metaKey: true })
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('does nothing while focus is in a text field, a textarea or a contenteditable (the browser undoes typing)', async () => {
    const onUndo = vi.fn()
    const { user, mount } = setupTimed()
    mount(
      <>
        <Fire arg={undoToast(onUndo)} />
        <input aria-label="Name" />
        <textarea aria-label="Notes" />
        <div contentEditable suppressContentEditableWarning aria-label="Rich" />
      </>,
    )
    await user.click(fireButton())
    for (const name of ['Name', 'Notes', 'Rich']) {
      const el = screen.getByLabelText(name)
      act(() => (el as HTMLElement).focus())
      const ev = press({ ctrlKey: true }, el)
      expect(ev.defaultPrevented).toBe(false)
    }
    expect(onUndo).not.toHaveBeenCalled()
    expect(toasts()).toHaveLength(1)
  })

  it('is one-shot: a second Ctrl+Z, and a click on Undo after it, run nothing', async () => {
    const onUndo = vi.fn()
    const { user, mount } = setupTimed()
    mount(<Fire arg={undoToast(onUndo)} />)
    await user.click(fireButton())
    press({ ctrlKey: true })
    const second = press({ ctrlKey: true })
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(second.defaultPrevented).toBe(false) // no Undo left: the browser keeps its own undo
  })

  it('with several Undo toasts on screen (cannot happen through useUndoToast) the newest is the target; with none, the key is left alone', async () => {
    const { user, mount } = setupTimed()
    mount(<Fire arg="Saved" />)
    await user.click(fireButton())
    const ev = press({ ctrlKey: true })
    expect(ev.defaultPrevented).toBe(false)
    expect(toasts()).toHaveLength(1)
  })

  // B9-18 review: a sheet or dialog open over the page owns the key (the Price keypad, a form sheet with its own fields).
  it('does nothing while focus is inside an open sheet or dialog: the Undo behind it would change the screen under it', async () => {
    const onUndo = vi.fn()
    const { user, mount } = setupTimed()
    mount(
      <>
        <Fire arg={undoToast(onUndo)} />
        <dialog open aria-label="Price">
          <button type="button">7</button>
        </dialog>
        <div role="dialog" aria-label="Filters">
          <button type="button">Clear</button>
        </div>
      </>,
    )
    await user.click(fireButton())
    for (const name of ['7', 'Clear']) {
      const el = screen.getByRole('button', { name })
      act(() => el.focus())
      expect(press({ ctrlKey: true }, el).defaultPrevented).toBe(false)
    }
    expect(onUndo).not.toHaveBeenCalled()
    expect(toasts()).toHaveLength(1)
  })

  it('Shift+Ctrl+Z (redo), Alt+Ctrl+Z and plain Z are not Undo', async () => {
    const onUndo = vi.fn()
    const { user, mount } = setupTimed()
    mount(<Fire arg={undoToast(onUndo)} />)
    await user.click(fireButton())
    press({ ctrlKey: true, shiftKey: true })
    press({ ctrlKey: true, altKey: true })
    press({})
    expect(onUndo).not.toHaveBeenCalled()
  })
})

describe('hold() and release (SSP-12: no toast over the Price keypad)', () => {
  it('a toast shown while held is not rendered; on release it shows', () => {
    const into: { api?: Api } = {}
    const { mount } = setupTimed()
    mount(<Grab into={into} />)
    let release!: () => void
    act(() => void (release = into.api!.hold()))
    act(() => void into.api!.show('Added Passata'))
    expect(toasts()).toHaveLength(0)
    act(() => release())
    expect(titles()).toEqual(['Added Passata'])
  })

  it('only the latest held toast shows on release; earlier ones are dropped', () => {
    const into: { api?: Api } = {}
    const { mount } = setupTimed()
    mount(<Grab into={into} />)
    let release!: () => void
    act(() => void (release = into.api!.hold()))
    act(() => {
      into.api!.show('one')
      into.api!.show('two')
      into.api!.show('three')
    })
    act(() => release())
    expect(titles()).toEqual(['three'])
  })

  // B9-18 review: lanes hold while held too, so a later ordinary toast never drops a pending Undo (SAFE R1).
  it('a held Undo is not dropped by a later ordinary toast: on release each lane shows its latest', () => {
    const into: { api?: Api } = {}
    const { mount } = setupTimed()
    mount(<Grab into={into} />)
    let release!: () => void
    act(() => void (release = into.api!.hold()))
    act(() => {
      into.api!.show(undoToast())
      into.api!.show('Price saved')
      into.api!.show('Added Passata')
    })
    expect(toasts()).toHaveLength(0)
    act(() => release())
    expect(titles()).toEqual(['Sam removed', 'Added Passata'])
  })

  it('the timer of a held toast starts at release, with its full duration', () => {
    const into: { api?: Api } = {}
    const { mount } = setupTimed()
    mount(<Grab into={into} />)
    let release!: () => void
    act(() => void (release = into.api!.hold()))
    act(() => void into.api!.show('Saved'))
    tick(20_000)
    act(() => release())
    tick(3800)
    expect(titles()).toEqual(['Saved'])
    tick(400)
    expect(titles()).toEqual([])
  })

  it('holding twice needs both releases; releasing the same hold twice is harmless', () => {
    const into: { api?: Api } = {}
    const { mount } = setupTimed()
    mount(<Grab into={into} />)
    let r1!: () => void
    let r2!: () => void
    act(() => {
      r1 = into.api!.hold()
      r2 = into.api!.hold()
    })
    act(() => void into.api!.show('Saved'))
    act(() => r1())
    act(() => r1())
    expect(toasts()).toHaveLength(0)
    act(() => r2())
    expect(titles()).toEqual(['Saved'])
  })

  it('a toast that is already on screen when the hold starts is not removed', () => {
    const into: { api?: Api } = {}
    const { mount } = setupTimed()
    mount(<Grab into={into} />)
    act(() => void into.api!.show('Saved'))
    act(() => void into.api!.hold())
    expect(titles()).toEqual(['Saved'])
  })

  it('errors and sticky toasts are never held', () => {
    const into: { api?: Api } = {}
    const { mount } = setupTimed()
    mount(<Grab into={into} />)
    act(() => void into.api!.hold())
    act(() => {
      into.api!.show('Could not save', { status: 'error' })
      into.api!.show({ title: 'A new version of Feeder is ready', sticky: true })
    })
    expect(titles().sort()).toEqual(['A new version of Feeder is ready', 'Could not save'])
  })

  it('a held toast is announced when it is shown, not before: the live region is empty while held', () => {
    const into: { api?: Api } = {}
    const { mount } = setupTimed()
    mount(<Grab into={into} />)
    let release!: () => void
    act(() => void (release = into.api!.hold()))
    act(() => void into.api!.show('Saved'))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    act(() => release())
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
  })

  it('unmounting the provider while held leaves no timer behind', () => {
    const into: { api?: Api } = {}
    const { mount } = setupTimed()
    const view = mount(<Grab into={into} />)
    act(() => void into.api!.hold())
    act(() => void into.api!.show('Saved'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    view.unmount()
    tick(30_000)
    expect(error).not.toHaveBeenCalled()
  })
})

describe('keyboard and screen reader (A11Y)', () => {
  it('a toast never takes focus when it appears', async () => {
    const { user, mount } = setupTimed()
    mount(<Fire arg={undoToast()} />)
    await user.click(fireButton())
    expect(fireButton()).toHaveFocus()
  })

  it('Undo is the next Tab stop after the content: the region follows the page in the DOM and its buttons are tabbable', async () => {
    const { user, mount } = setupTimed()
    mount(
      <main>
        <Fire arg={undoToast()} />
      </main>,
    )
    await user.click(fireButton())
    await user.tab()
    expect(screen.getByRole('button', { name: 'Undo: put Sam back' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Undo: put Sam back' })).not.toHaveAttribute('tabindex', '-1')
  })

  it('Undo stays reachable: a Tab to it pauses the toast even after 7 s', async () => {
    const { user, mount } = setupTimed()
    mount(<Fire arg={undoToast()} />)
    await user.click(fireButton())
    tick(7000)
    await user.tab()
    tick(30_000)
    expect(screen.getByRole('button', { name: 'Undo: put Sam back' })).toBeInTheDocument()
  })

  it('the polite region reads one run: headline, subline, body, then the action labels (not their aria-labels), nothing from Dismiss', async () => {
    const { user, mount } = setupTimed()
    mount(
      <Fire
        arg={{ title: 'Cooked, nice one!', subline: 'Sat Dinner', body: '1.25 portions kept as a Leftover.', actions: [{ label: 'Undo', ariaLabel: 'Undo Cooked for Sat Dinner', role: 'undo', onClick: () => {} }] }}
      />,
    )
    await user.click(fireButton())
    expect(screen.getByRole('status').textContent).toBe('Cooked, nice one! Sat Dinner 1.25 portions kept as a Leftover. Undo')
  })

  it('a one-line Undo toast reads "Sam removed Undo"', async () => {
    const { user, mount } = setupTimed()
    mount(<Fire arg={undoToast()} />)
    await user.click(fireButton())
    expect(screen.getByRole('status').textContent).toBe('Sam removed Undo')
  })

  it('the Undo button keeps its own accessible name (what it undoes)', async () => {
    const { user, mount } = setupTimed()
    mount(<Fire arg={undoToast()} />)
    await user.click(fireButton())
    const btn = screen.getByRole('button', { name: 'Undo: put Sam back' })
    expect(btn).toHaveTextContent('Undo')
    fireEvent.click(btn)
    expect(toasts()).toHaveLength(0)
  })
})
