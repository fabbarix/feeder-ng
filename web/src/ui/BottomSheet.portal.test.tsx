// B9-14 / DS-01: a MODAL sheet renders through a portal into document.body, so nothing of its trigger's row (pointer-events: none,
// text-align: end, the trailing-slot button rules) reaches it. A non-modal sheet stays where it is mounted (it is docked from
// 768 px). The portal root stops click, pointerdown and keydown from bubbling through React to the trigger's ancestors, and it
// does so after the dialog's own backdrop handler ran. Dialog gets the same portal.
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BottomSheet } from './BottomSheet'
import { Dialog } from './Dialog'

describe('BottomSheet.portal (DS-01)', () => {
  it('a modal sheet is a child of document.body, not of the element that mounts it', () => {
    render(
      <section data-testid="row">
        <BottomSheet open onClose={() => {}} title="Actions for Cauliflower">
          <button>Had it</button>
        </BottomSheet>
      </section>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.parentElement).toBe(document.body)
    expect(screen.getByTestId('row').contains(dialog)).toBe(false)
  })

  it('a non-modal sheet stays in place', () => {
    render(
      <section data-testid="row">
        <BottomSheet open modal={false} onClose={() => {}} title="Keypad">
          <button>1</button>
        </BottomSheet>
      </section>,
    )
    const dialog = document.querySelector('dialog')!
    expect(screen.getByTestId('row').contains(dialog)).toBe(true)
  })

  it('a click, pointerdown or keydown inside the sheet does not reach the mounting ancestors through React', async () => {
    const onClick = vi.fn()
    const onPointerDown = vi.fn()
    const onKeyDown = vi.fn()
    render(
      <div onClick={onClick} onPointerDown={onPointerDown} onKeyDown={onKeyDown}>
        <BottomSheet open onClose={() => {}} title="T">
          <button>Had it</button>
        </BottomSheet>
      </div>,
    )
    const btn = screen.getByRole('button', { name: 'Had it' })
    await userEvent.click(btn)
    fireEvent.pointerDown(btn)
    fireEvent.keyDown(btn, { key: 'ArrowDown' })
    expect(onClick).not.toHaveBeenCalled()
    expect(onPointerDown).not.toHaveBeenCalled()
    expect(onKeyDown).not.toHaveBeenCalled()
  })

  it('a backdrop click still closes the sheet, and still does not reach the ancestors', () => {
    const onClose = vi.fn()
    const onClick = vi.fn()
    render(
      <div onClick={onClick}>
        <BottomSheet open onClose={onClose} title="T">
          body
        </BottomSheet>
      </div>,
    )
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('a non-modal sheet does not stop events (it is part of the page it sits in)', async () => {
    const onClick = vi.fn()
    render(
      <div onClick={onClick}>
        <BottomSheet open modal={false} onClose={() => {}} title="T">
          <button>Key</button>
        </BottomSheet>
      </div>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Key' }))
    expect(onClick).toHaveBeenCalled()
  })

  it('Dialog has the same portal and the same stop', async () => {
    const onClick = vi.fn()
    render(
      <section data-testid="row" onClick={onClick}>
        <Dialog open onClose={() => {}} title="Sure?" actions={<button>Yes</button>}>
          text
        </Dialog>
      </section>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.parentElement).toBe(document.body)
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('testing-library still finds a portalled sheet by role and name', () => {
    render(
      <BottomSheet open onClose={() => {}} title="Pick one">
        <button>One</button>
      </BottomSheet>,
    )
    expect(screen.getByRole('dialog', { name: 'Pick one' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'One' })).toBeInTheDocument()
  })
})
