import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'

function make(html = '<button>one</button><button>two</button>') {
  const dialog = document.createElement('dialog')
  dialog.innerHTML = html
  document.body.append(dialog)
  return dialog
}

describe('dialog polyfill (jsdom)', () => {
  it('showModal opens, focuses the first focusable element, close() closes and fires close', () => {
    const dialog = make()
    const onClose = vi.fn()
    dialog.addEventListener('close', onClose)
    dialog.showModal()
    expect(dialog.open).toBe(true)
    expect(document.activeElement).toBe(dialog.querySelector('button'))
    dialog.close('done')
    expect(dialog.open).toBe(false)
    expect(dialog.returnValue).toBe('done')
    expect(onClose).toHaveBeenCalledOnce()
    dialog.remove()
  })

  it('prefers [autofocus] over the first focusable and falls back to the dialog itself', () => {
    const a = make('<button>one</button><button autofocus>two</button>')
    a.showModal()
    expect(document.activeElement).toBe(a.querySelectorAll('button')[1])
    a.close()
    const b = make('<p>text</p>')
    b.showModal()
    expect(document.activeElement).toBe(b)
    b.close()
    a.remove()
    b.remove()
  })

  it('restores focus to the opener on close()', () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const dialog = make()
    dialog.showModal()
    dialog.close()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
    dialog.remove()
  })

  it('Escape fires a cancelable cancel event, then closes unless it is prevented', async () => {
    const dialog = make()
    dialog.showModal()
    const onCancel = vi.fn((e: Event) => e.preventDefault())
    dialog.addEventListener('cancel', onCancel)
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
    expect(dialog.open).toBe(true)
    dialog.removeEventListener('cancel', onCancel)
    await userEvent.keyboard('{Escape}')
    expect(dialog.open).toBe(false)
    dialog.remove()
  })

  it('Escape only reaches the topmost modal dialog', async () => {
    const lower = make()
    const upper = make()
    lower.showModal()
    upper.showModal()
    await userEvent.keyboard('{Escape}')
    expect(upper.open).toBe(false)
    expect(lower.open).toBe(true)
    lower.close()
    lower.remove()
    upper.remove()
  })

  it('showModal on an open dialog throws InvalidStateError like a browser', () => {
    const dialog = make()
    dialog.showModal()
    expect(() => dialog.showModal()).toThrow(/already open/)
    dialog.close()
    dialog.remove()
  })
})
