// B9-14 / SHORT-02 + the VC2 gap: the footer mechanisms of BottomSheet.
//   closeButton?: boolean (default true). false: no Close in the header. (With onCancel there is never a Close, as before.)
//   submit?: { label: ReactNode; form: string; disabled?: boolean; tone?: 'danger' }: THE MECHANISM for "Save and Cancel in the footer of a
//     sheet whose body is a form". The footer gets a primary Button type="submit" form={form} as its last control (after `footer`),
//     so the owning screen keeps its <form id> in the body, passes onCancel and submit, and the sheet shows Cancel + Save and no Close.
//     Enter in a field of the form submits through the form attribute.
//   data-footer="flow" on .sheet__panel, set by a ResizeObserver on the panel and the body through footerShouldFlow().
//   Initial focus: the first control of the body, scrolled into view with scrollIntoView({ block: 'nearest' }).
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'

afterEach(() => vi.unstubAllGlobals())

describe('closeButton', () => {
  it('false: the header has no Close; Escape and the scrim still dismiss', () => {
    const onClose = vi.fn()
    render(
      <BottomSheet open onClose={onClose} closeButton={false} title="T">
        body
      </BottomSheet>,
    )
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
  it('defaults to true (the 40 px CloseButton)', () => {
    render(
      <BottomSheet open onClose={() => {}} title="T">
        body
      </BottomSheet>,
    )
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('close-button')
  })
})

describe('submit: Save and Cancel in the footer of a sheet whose body is a form (VC2)', () => {
  function Editor({ onSubmit, onCancel = () => {}, disabled = false }: { onSubmit: () => void; onCancel?: () => void; disabled?: boolean }) {
    return (
      <BottomSheet open onClose={() => {}} onCancel={onCancel} submit={{ label: 'Save lot', form: 'lot-form', disabled }} title="Edit lot">
        <form
          id="lot-form"
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
        >
          <input aria-label="Quantity" defaultValue="3" />
        </form>
      </BottomSheet>
    )
  }

  it('shows Cancel then Save in the footer, and no Close', () => {
    render(<Editor onSubmit={() => {}} />)
    const footer = document.querySelector('.sheet__footer') as HTMLElement
    const names = within(footer)
      .getAllByRole('button')
      .map((b) => b.textContent)
    expect(names).toEqual(['Cancel', 'Save lot'])
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    expect(document.querySelectorAll('.sheet__body button')).toHaveLength(0) // nothing of the commit stays in the body
  })

  it('Save is a primary submit button bound to the body form by its form attribute', () => {
    render(<Editor onSubmit={() => {}} />)
    const save = screen.getByRole('button', { name: 'Save lot' })
    expect(save).toHaveAttribute('type', 'submit')
    expect(save).toHaveAttribute('form', 'lot-form')
    expect(save).toHaveAttribute('data-variant', 'primary')
  })

  it('pressing Save submits the form that is in the body; so does Enter in its field', async () => {
    const onSubmit = vi.fn()
    render(<Editor onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save lot' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    await userEvent.type(screen.getByLabelText('Quantity'), '{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(2)
  })

  it('Cancel calls onCancel and does not submit', async () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    render(<Editor onSubmit={onSubmit} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('disabled disables Save only', () => {
    render(<Editor onSubmit={() => {}} disabled />)
    expect(screen.getByRole('button', { name: 'Save lot' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  })

  it('tone danger makes the commit a danger Button', () => {
    render(
      <BottomSheet open onClose={() => {}} onCancel={() => {}} submit={{ label: 'Delete lot', form: 'f', tone: 'danger' }} title="T">
        <form id="f" />
      </BottomSheet>,
    )
    expect(screen.getByRole('button', { name: 'Delete lot' })).toHaveAttribute('data-variant', 'danger')
  })

  it('without onCancel the sheet keeps its Close and the footer holds Save alone', () => {
    render(
      <BottomSheet open onClose={() => {}} submit={{ label: 'Save', form: 'f' }} title="T">
        <form id="f" />
      </BottomSheet>,
    )
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    const footer = document.querySelector('.sheet__footer') as HTMLElement
    expect(within(footer).getAllByRole('button')).toHaveLength(1)
  })

  it('submit comes after a `footer` node (the primary is last in the DOM)', () => {
    render(
      <BottomSheet open onClose={() => {}} submit={{ label: 'Save', form: 'f' }} footer={<Button variant="secondary">Save and add</Button>} title="T">
        <form id="f" />
      </BottomSheet>,
    )
    const footer = document.querySelector('.sheet__footer') as HTMLElement
    expect(within(footer).getAllByRole('button').map((b) => b.textContent)).toEqual(['Save and add', 'Save'])
  })
})

describe('data-footer="flow" (SHORT-02 rule 5)', () => {
  let trigger: () => void
  beforeEach(() => {
    class RO {
      constructor(cb: () => void) {
        trigger = cb
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal('ResizeObserver', RO)
  })
  const size = (el: Element, props: Record<string, number>) => {
    for (const [k, v] of Object.entries(props)) Object.defineProperty(el, k, { configurable: true, value: v })
  }
  const render390 = () => {
    render(
      <BottomSheet open onClose={() => {}} title="T" footer={<Button>Go</Button>}>
        <p>body</p>
      </BottomSheet>,
    )
    return { panel: document.querySelector('.sheet__panel') as HTMLElement, body: document.querySelector('.sheet__body') as HTMLElement }
  }

  it('is not set while the body has its share', () => {
    const { panel, body } = render390()
    size(panel, { clientHeight: 400 })
    size(body, { clientHeight: 220, scrollHeight: 400 })
    trigger()
    expect(panel).not.toHaveAttribute('data-footer')
  })
  it('is set when the observer reports a body under 40 % of the panel that has more to show', () => {
    const { panel, body } = render390()
    size(panel, { clientHeight: 400 })
    size(body, { clientHeight: 100, scrollHeight: 400 })
    trigger()
    expect(panel).toHaveAttribute('data-footer', 'flow')
  })
  it('is removed again when the room comes back', () => {
    const { panel, body } = render390()
    size(panel, { clientHeight: 400 })
    size(body, { clientHeight: 100, scrollHeight: 400 })
    trigger()
    size(body, { clientHeight: 250, scrollHeight: 400 })
    trigger()
    expect(panel).not.toHaveAttribute('data-footer')
  })
  it('data-body="scroll" (the body floor) is set only while the body scrolls, never for a body that fits', () => {
    const { panel, body } = render390()
    size(panel, { clientHeight: 400 })
    size(body, { clientHeight: 60, scrollHeight: 60 })
    trigger()
    expect(panel).not.toHaveAttribute('data-body')
    size(body, { clientHeight: 220, scrollHeight: 400 })
    trigger()
    expect(panel).toHaveAttribute('data-body', 'scroll')
    size(body, { clientHeight: 220, scrollHeight: 220 })
    trigger()
    expect(panel).not.toHaveAttribute('data-body')
  })
  it('a browser without ResizeObserver still renders the sheet', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    render(
      <BottomSheet open onClose={() => {}} title="T">
        body
      </BottomSheet>,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('initial focus is scrolled into view nearest', () => {
  it('the first body control is focused and scrollIntoView({ block: "nearest" }) is called on it', () => {
    const spy = vi.fn()
    Element.prototype.scrollIntoView = spy
    render(
      <BottomSheet open onClose={() => {}} title="Mark as Cooked">
        <button>Leftover portions</button>
      </BottomSheet>,
    )
    expect(screen.getByRole('button', { name: 'Leftover portions' })).toHaveFocus()
    expect(spy).toHaveBeenCalledWith({ block: 'nearest' })
    expect(spy.mock.contexts.some((c) => c === screen.getByRole('button', { name: 'Leftover portions' }))).toBe(true)
  })
})

// B9-14 review: Mark as Cooked opens on "Loading…" (no control, so the title takes the focus); its Leftover portions arrive later.
describe('a body that loads after the sheet opened', () => {
  function Late({ loaded }: { loaded: boolean }) {
    return (
      <BottomSheet open onClose={() => {}} title="Mark as Cooked" footer={<Button disabled={!loaded}>Mark as Cooked</Button>}>
        {loaded ? <button>Leftover portions</button> : <p>Loading…</p>}
      </BottomSheet>
    )
  }
  it('focuses the first body control when it appears while focus is still on the title, scrolled into view', async () => {
    const spy = vi.fn()
    Element.prototype.scrollIntoView = spy
    const { rerender } = render(<Late loaded={false} />)
    // Nothing to operate yet (the footer's button is disabled while loading): the open focused the title.
    expect(screen.getByRole('heading', { name: 'Mark as Cooked' })).toHaveFocus()
    rerender(<Late loaded />)
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Leftover portions' })).toHaveFocus())
    expect(spy.mock.contexts.some((c) => c === screen.getByRole('button', { name: 'Leftover portions' }))).toBe(true)
  })
  it('never takes focus the person moved elsewhere', async () => {
    const { rerender } = render(<Late loaded={false} />)
    const close = screen.getByRole('button', { name: 'Close' })
    close.focus()
    rerender(<Late loaded />)
    await new Promise((r) => setTimeout(r, 20))
    expect(close).toHaveFocus()
  })
})
