// B9-54 (RES-03, mocks/res-03-shop-offline.html): the toast of a Tick made offline says "Carrot ticked" with a 16 px Clock in the headline line: a status,
// "waiting to sync". A new ToastStatus 'pending' draws Phosphor Clock (`duration`, no new glyph); it is polite and timed like an ordinary toast
// (an Undo toast keeps its Undo role and duration), the icon is decorative. Every other plain success toast keeps no icon (R-D+).
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ToastProvider, useToast } from './Toast'
import { useUndoToast } from './useUndoToast'

function Fire() {
  const toast = useToast()
  const undoToast = useUndoToast()
  return (
    <>
      <button onClick={() => toast.show({ status: 'pending', title: 'Carrot ticked', subline: 'Waiting to sync · 50 g goes to Stock when it syncs' })}>plain</button>
      <button onClick={() => undoToast.show({ headline: 'Beans ticked', subline: 'Waiting to sync', status: 'pending', undo: () => {} })}>undo</button>
      <button onClick={() => undoToast.show({ headline: 'Rice ticked', undo: () => {} })}>no status</button>
    </>
  )
}
const setup = () => render(<ToastProvider><Fire /></ToastProvider>)
const toastOf = (text: string) => screen.getByText(text).closest('[data-status]') as HTMLElement

describe('Toast status pending', () => {
  it('a 16 px Clock in the headline line, decorative', async () => {
    setup()
    await userEvent.click(screen.getByText('plain'))
    const toast = toastOf('Carrot ticked')
    expect(toast).toHaveAttribute('data-status', 'pending')
    const icon = toast.querySelector('svg')!
    expect(icon).not.toBeNull()
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(icon).toHaveAttribute('width', '16')
    expect(toast.querySelector('.toast__title')?.contains(icon) || toast.querySelector('.toast__headline')?.contains(icon) || toast.firstElementChild?.contains(icon)).toBe(true)
  })

  it('an Undo toast with status pending keeps the Undo action and takes the icon; one without a status has none', async () => {
    setup()
    await userEvent.click(screen.getByText('undo'))
    const toast = toastOf('Beans ticked')
    expect(toast).toHaveAttribute('data-status', 'pending')
    expect(toast.querySelector('svg')).not.toBeNull()
    expect(toast.querySelector('[data-role="undo"], button[aria-label^="Undo"]')).not.toBeNull()
    await userEvent.click(screen.getByText('no status'))
    const plain = toastOf('Rice ticked')
    expect(plain.querySelector('.toast__title svg, .toast > svg')).toBeNull()
  })
})
