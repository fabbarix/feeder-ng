// B9-18 (SAFE R1 "Undo toast rules"): useUndoToast, the one way a screen shows "<thing> done" with an Undo.
//
// API pinned here (ui/useUndoToast.ts; needs a ToastProvider):
//   const undoToast = useUndoToast()
//   undoToast.show(input): ToastHandle
//   input = {
//     headline: string                  past tense, naming the thing: "Sam removed"
//     subline?: string, body?: string   the rich anatomy (R-D); omitted = one line
//     undo: (ctx: { focusWasInToast: boolean }) => unknown | Promise<unknown>
//                                       the inverse; rejects (or throws) when the server refuses; run at most once
//     undoLabel?: string                default 'Undo'
//     undoAriaLabel?: string            "Undo: put Sam back"; default `Undo` + the headline
//     restored?: string                 "Sam is back": a 4 s toast after a successful Undo; omitted = no toast
//     actions?: ToastAction[]           extra actions, drawn BEFORE Undo (Review); they close the toast like any action
//     durationMs?: number               default 8000 (UNDO); Scan passes 5000
//   }
//   The toast has no status icon (R-D+), carries the Undo as the action with role 'undo', and has the round Dismiss.
//   A refused Undo shows a sticky warning toast: headline "Nothing was undone" with the warning triangle in its line, subline = the
//   reason, announced politely, never held,
//   nothing else to press but Dismiss (main-session ruling 1: the approved PC-01 mock, shots/pc-01-after-toasts-*).
//   undoRefusal(error): { headline: string; subline: string; body (deprecated, = subline) }   pure; exported for tests and for screens
//   that word their own failures
// Reasons by ApiError.code: plan_changed "The plan has changed since." | leftover_used "Some of the Leftover has been used." |
//   reopen_window_over, window_over, undo_window_over "It is too late to undo it." | not_undoable "It cannot be undone." |
//   not_found "It was already undone." | email_taken "That email is already used by someone else." | anything else "Nothing changed."
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/http'
import { ToastProvider, useToast } from './Toast'
import { Icon } from './Icon'
import { renderToStaticMarkup } from 'react-dom/server'
import { undoRefusal, useUndoToast, type UndoToastInput } from './useUndoToast'

function Show({ input }: { input: UndoToastInput }) {
  const undoToast = useUndoToast()
  return <button onClick={() => undoToast.show(input)}>show</button>
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => vi.useRealTimers())

async function open(input: UndoToastInput) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(
    <ToastProvider>
      <Show input={input} />
    </ToastProvider>,
  )
  await user.click(screen.getByRole('button', { name: 'show' }))
  return { user, toast: () => document.querySelector('.toast') as HTMLElement | null }
}
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
/** The warning triangle as the Toast draws it (16 px, decorative), to compare with the toast's headline icon. */
const warningIconSvg = () => {
  const box = document.createElement('div')
  box.innerHTML = renderToStaticMarkup(<Icon name="warning" size={16} />)
  return box.querySelector('svg')!.outerHTML
}

describe('the toast', () => {
  it('a one-line toast: the headline, an outline Undo and Dismiss, no status icon, no subline or body', async () => {
    const { toast } = await open({ headline: 'Sam removed', undo: () => {}, undoAriaLabel: 'Undo: put Sam back' })
    const t = toast()!
    expect(t.querySelector('.toast__title')).toHaveTextContent('Sam removed')
    expect(t.querySelector('.toast__title svg')).toBeNull()
    expect(t.querySelector('.toast__subline, .toast__body')).toBeNull()
    expect(t).toHaveAttribute('data-layout', 'line')
    expect(within(t).getByRole('button', { name: 'Undo: put Sam back' })).toHaveTextContent('Undo')
    expect(within(t).getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  })

  it('the rich form takes headline, subline and body (Cooked, nice one!) with Undo under them', async () => {
    const { toast } = await open({
      headline: 'Cooked, nice one!',
      subline: 'Sat Breakfast · Slow cooker beef and barley stew',
      body: '1.25 portions kept as a Leftover, good until Tue.',
      undo: () => {},
    })
    const kids = [...toast()!.querySelectorAll('.toast__title, .toast__subline, .toast__body, .toast__actions')].map((e) => e.className.split(' ')[0])
    expect(kids).toEqual(['toast__title', 'toast__subline', 'toast__body', 'toast__actions'])
  })

  it('Undo is named by what it undoes; by default "Undo" plus the headline', async () => {
    await open({ headline: 'Sat Dinner marked Not cooked', undo: () => {} })
    expect(screen.getByRole('button', { name: /^Undo\b.*Sat Dinner marked Not cooked/ })).toBeInTheDocument()
  })

  it('lasts 8 s; durationMs overrides it (Scan keeps 5 s)', async () => {
    const a = await open({ headline: 'Sam removed', undo: () => {} })
    tick(7800)
    expect(a.toast()).not.toBeNull()
    tick(400)
    expect(a.toast()).toBeNull()
  })

  it('durationMs: 5000 is honoured', async () => {
    const a = await open({ headline: 'Added Passata', undo: () => {}, durationMs: 5000 })
    tick(4800)
    expect(a.toast()).not.toBeNull()
    tick(400)
    expect(a.toast()).toBeNull()
  })

  it('extra actions come before Undo, and Undo is last', async () => {
    const { toast } = await open({ headline: 'Swapped Tue Dinner', actions: [{ label: 'Review', ariaLabel: 'Review 2 changed meals', onClick: () => {} }], undo: () => {} })
    const labels = [...toast()!.querySelectorAll('.toast__action')].map((b) => b.textContent)
    expect(labels).toEqual(['Review', 'Undo'])
  })

  it('does not move focus to the toast', async () => {
    await open({ headline: 'Sam removed', undo: () => {} })
    expect(screen.getByRole('button', { name: 'show' })).toHaveFocus()
  })
})

describe('Undo runs once', () => {
  it('a click runs undo, closes the toast, and a second click on the (gone) button cannot run it again', async () => {
    const undo = vi.fn()
    const { user, toast } = await open({ headline: 'Sam removed', undo, undoAriaLabel: 'Undo: put Sam back' })
    await user.click(screen.getByRole('button', { name: 'Undo: put Sam back' }))
    expect(undo).toHaveBeenCalledTimes(1)
    expect(toast()).toBeNull()
  })

  it('Ctrl+Z runs it once, and a following click or Ctrl+Z does not run it again', async () => {
    const undo = vi.fn()
    await open({ headline: 'Sam removed', undo })
    act(() => void document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })))
    act(() => void document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })))
    expect(undo).toHaveBeenCalledTimes(1)
  })

  it('tells undo whether focus was inside the toast (the screen then moves focus to the restored row only if it was)', async () => {
    const undo = vi.fn()
    const { user } = await open({ headline: 'Sam removed', undo, undoAriaLabel: 'Undo: put Sam back' })
    const btn = screen.getByRole('button', { name: 'Undo: put Sam back' })
    act(() => btn.focus())
    await user.click(btn)
    expect(undo).toHaveBeenCalledWith({ focusWasInToast: true })
  })

  it('says focusWasInToast: false for a pointer click while focus is elsewhere, and for Ctrl+Z', async () => {
    const undo = vi.fn()
    await open({ headline: 'Sam removed', undo })
    act(() => void document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })))
    expect(undo).toHaveBeenCalledWith({ focusWasInToast: false })
  })
})

describe('after Undo', () => {
  it('success shows the restored sentence for 4 s: no icon, no Undo', async () => {
    const { user } = await open({ headline: 'Sam removed', undo: async () => {}, restored: 'Sam is back', undoAriaLabel: 'Undo: put Sam back' })
    await user.click(screen.getByRole('button', { name: 'Undo: put Sam back' }))
    await waitFor(() => expect(screen.getByText('Sam is back')).toBeInTheDocument())
    const t = screen.getByText('Sam is back').closest('.toast') as HTMLElement
    expect(t.querySelector('.toast__title svg')).toBeNull()
    expect(within(t).queryByRole('button', { name: /Undo/ })).toBeNull()
    expect(t).toHaveAttribute('data-status', 'success')
    tick(3800)
    expect(screen.getByText('Sam is back')).toBeInTheDocument()
    tick(400)
    expect(screen.queryByText('Sam is back')).toBeNull()
  })

  it('without `restored` no toast follows a successful Undo', async () => {
    const { user, toast } = await open({ headline: 'Sam removed', undo: async () => {} })
    await user.click(screen.getByRole('button', { name: /^Undo/ }))
    await act(async () => {})
    expect(toast()).toBeNull()
  })

  it('a refused Undo (409 plan_changed) shows a warning toast: the warning triangle in the headline line, "Nothing was undone", the reason as the subline, and it stays', async () => {
    const { user } = await open({
      headline: 'Plan regenerated: 18 Planned Meals changed',
      undo: async () => {
        throw new ApiError(409, 'plan_changed', 'plan changed')
      },
      restored: 'Plan is back',
    })
    await user.click(screen.getByRole('button', { name: /^Undo/ }))
    await waitFor(() => expect(screen.getByText('Nothing was undone')).toBeInTheDocument())
    const t = screen.getByText('Nothing was undone').closest('.toast') as HTMLElement
    expect(t).toHaveAttribute('data-status', 'warning')
    expect(t.querySelector('.toast__title svg')).not.toBeNull()
    expect(t.querySelector('.toast__title svg')!.outerHTML).toBe(warningIconSvg())
    expect(t.querySelector('.toast__subline')).toHaveTextContent('The plan has changed since.')
    expect(t.querySelector('.toast__body')).toBeNull()
    expect(within(t).queryByRole('button', { name: /Undo/ })).toBeNull()
    // a warning is announced politely: it is in the status region, not the alert one
    expect(screen.getByRole('status')).toHaveTextContent('Nothing was undone The plan has changed since.')
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
    tick(120_000)
    expect(screen.getByText('Nothing was undone')).toBeInTheDocument()
    expect(screen.queryByText('Plan is back')).toBeNull()
  })

  it('a thrown (not rejected) error is a refusal as well', async () => {
    const { user } = await open({
      headline: 'Sam removed',
      undo: () => {
        throw new ApiError(404, 'not_found', 'gone')
      },
    })
    await user.click(screen.getByRole('button', { name: /^Undo/ }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('It was already undone.'))
  })
})

describe('a refused Undo while toasts are held', () => {
  it('is never held: it shows at once although a hold is open, and stays after the hold is released', async () => {
    let release: (() => void) | undefined
    function Holder() {
      const toast = useToast()
      return <button onClick={() => (release = toast.hold())}>hold</button>
    }
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <ToastProvider>
        <Show input={{ headline: 'Sam removed', undo: async () => Promise.reject(new ApiError(409, 'plan_changed', 'x')) }} />
        <Holder />
      </ToastProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'show' }))
    await user.click(screen.getByRole('button', { name: 'hold' }))
    await user.click(screen.getByRole('button', { name: /^Undo/ }))
    await waitFor(() => expect(screen.getByText('Nothing was undone')).toBeInTheDocument())
    expect(screen.getByText('Nothing was undone').closest('.toast')).toHaveAttribute('data-status', 'warning')
    act(() => release?.())
    tick(60_000)
    expect(screen.getByText('Nothing was undone')).toBeInTheDocument()
  })
})

describe('undoRefusal (pure)', () => {
  const reason = (code: string, status = 409) => undoRefusal(new ApiError(status, code, 'x')).subline

  it('the headline is always "Nothing was undone" (PC-01 mock)', () => {
    expect(undoRefusal(new ApiError(409, 'plan_changed', 'x')).headline).toBe('Nothing was undone')
    expect(undoRefusal(new Error('boom')).headline).toBe('Nothing was undone')
    expect(undoRefusal('weird').headline).toBe('Nothing was undone')
  })

  it.each([
    ['plan_changed', 'The plan has changed since.'],
    ['leftover_used', 'Some of the Leftover has been used.'],
    ['reopen_window_over', 'It is too late to undo it.'],
    ['window_over', 'It is too late to undo it.'],
    ['undo_window_over', 'It is too late to undo it.'],
    ['not_undoable', 'It cannot be undone.'],
    ['email_taken', 'That email is already used by someone else.'],
  ])('%s -> %s', (code, text) => {
    expect(reason(code)).toBe(text)
  })

  it('404 not_found -> already undone', () => {
    expect(reason('not_found', 404)).toBe('It was already undone.')
  })

  it('an unknown code, a network failure or a plain Error says only that nothing changed', () => {
    expect(reason('who_knows')).toBe('Nothing changed.')
    expect(undoRefusal(new TypeError('Failed to fetch')).subline).toBe('Nothing changed.')
    expect(undoRefusal(undefined).subline).toBe('Nothing changed.')
  })
})
