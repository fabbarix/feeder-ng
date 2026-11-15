// Batch w3e: the toast region is portalled into the topmost open modal dialog (a toast under a modal sheet is hidden and inert).
import { afterEach, describe, expect, it } from 'vitest'
import { topModalDialog } from './useModalHost'

afterEach(() => document.body.replaceChildren())

const dialog = (open: boolean, modal = true) => {
  const d = document.createElement('dialog')
  if (open) d.setAttribute('open', '')
  if (!modal) d.dataset['modal'] = 'false'
  document.body.append(d)
  return d
}

describe('topModalDialog', () => {
  it('is null with no open dialog', () => {
    dialog(false)
    expect(topModalDialog()).toBeNull()
  })
  it('is the last open modal dialog (a stacked one comes after its opener)', () => {
    dialog(true)
    const top = dialog(true)
    expect(topModalDialog()).toBe(top)
  })
  it('never a non-modal dialog', () => {
    const modal = dialog(true)
    dialog(true, false)
    expect(topModalDialog()).toBe(modal)
  })
})
