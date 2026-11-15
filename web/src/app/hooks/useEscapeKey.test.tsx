// B9-25 (PC-04), w4a review: Esc dismisses the finish banner only when nothing else is using the key. With Your menu, a Popover,
// a Select or a DateField open, Esc closes that (each marks the key handled), even when its listener was added after the banner's.
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEscapeKey } from './useEscapeKey'

function Harness({ active, onEscape }: { active: boolean; onEscape: () => void }) {
  useEscapeKey(active, onEscape)
  return <button>somewhere</button>
}

const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length) cleanups.pop()!()
})
function documentListener(handles: boolean) {
  const fn = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && handles) e.preventDefault()
  }
  document.addEventListener('keydown', fn)
  cleanups.push(() => document.removeEventListener('keydown', fn))
}

describe('useEscapeKey', () => {
  it('calls back on Escape while active, not while inactive', async () => {
    const onEscape = vi.fn()
    const { rerender } = render(<Harness active onEscape={onEscape} />)
    await userEvent.keyboard('{Escape}')
    expect(onEscape).toHaveBeenCalledOnce()
    rerender(<Harness active={false} onEscape={onEscape} />)
    await userEvent.keyboard('{Escape}')
    expect(onEscape).toHaveBeenCalledOnce()
  })

  it('leaves a key that a menu or popover handled, even one whose document listener was added after it (Your menu opened later)', async () => {
    const onEscape = vi.fn()
    render(<Harness active onEscape={onEscape} />)
    documentListener(true)
    await userEvent.keyboard('{Escape}')
    expect(onEscape).not.toHaveBeenCalled()
  })

  it('a document listener that does not handle Escape does not stop it', async () => {
    const onEscape = vi.fn()
    render(<Harness active onEscape={onEscape} />)
    documentListener(false)
    await userEvent.keyboard('{Escape}')
    expect(onEscape).toHaveBeenCalledOnce()
  })

  it('leaves Escape to an open dialog or sheet', async () => {
    const onEscape = vi.fn()
    render(<Harness active onEscape={onEscape} />)
    const dialog = document.createElement('dialog')
    dialog.setAttribute('open', '')
    document.body.append(dialog)
    cleanups.push(() => dialog.remove())
    await userEvent.keyboard('{Escape}')
    expect(onEscape).not.toHaveBeenCalled()
  })
})
