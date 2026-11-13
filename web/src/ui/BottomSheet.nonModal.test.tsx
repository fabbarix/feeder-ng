// The non-modal BottomSheet (modal={false}) and its 'half' size: the Price entry docks beside the Scanned list
// (shop-scan-proposals.md 13.4) without a backdrop. The default stays the modal sheet (BottomSheet.dialog.test.tsx).
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BottomSheet } from './BottomSheet'
import { ConfirmDialog } from './ConfirmDialog'
import { declarations, readUiCss } from './test-utils'

describe('BottomSheet modal={false}', () => {
  it('opens with show(), not showModal(), and is still a dialog named by its title', () => {
    const show = vi.spyOn(HTMLDialogElement.prototype, 'show')
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
    render(
      <BottomSheet open modal={false} onClose={() => {}} title="Price of Mutti passata">
        <button>1</button>
      </BottomSheet>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Price of Mutti passata' }) as HTMLDialogElement
    expect(dialog.open).toBe(true)
    expect(dialog).toHaveAttribute('data-modal', 'false')
    expect(show).toHaveBeenCalled()
    expect(showModal).not.toHaveBeenCalled()
    show.mockRestore()
    showModal.mockRestore()
  })

  it('the default sheet is modal and carries no data-modal or data-size', () => {
    render(
      <BottomSheet open onClose={() => {}} title="T">
        body
      </BottomSheet>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).not.toHaveAttribute('data-modal')
    expect(dialog).not.toHaveAttribute('data-size')
  })

  it('Escape anywhere on the page closes it, and the header Close does', async () => {
    const onClose = vi.fn()
    render(
      <>
        <button>Outside</button>
        <BottomSheet open modal={false} onClose={onClose} title="T">
          <p>inside</p>
        </BottomSheet>
      </>,
    )
    screen.getByRole('button', { name: 'Outside' }).focus()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('a click on the sheet itself is not a backdrop click: it does not close', () => {
    const onClose = vi.fn()
    render(
      <BottomSheet open modal={false} onClose={onClose} title="T">
        <p>inside</p>
      </BottomSheet>,
    )
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('an Escape something inside already handled is left alone', () => {
    const onClose = vi.fn()
    render(
      <BottomSheet open modal={false} onClose={onClose} title="T">
        <button onKeyDown={(e) => e.key === 'Escape' && e.preventDefault()}>Key</button>
      </BottomSheet>,
    )
    fireEvent.keyDown(screen.getByRole('button', { name: 'Key' }), { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Escape belongs to a modal dialog open over it', async () => {
    const onClose = vi.fn()
    const onCancel = vi.fn()
    render(
      <>
        <BottomSheet open modal={false} onClose={onClose} title="T">
          body
        </BottomSheet>
        <ConfirmDialog open title="Remove 2 Mutti passata?" confirmLabel="Remove" cancelLabel="Keep them" onConfirm={() => {}} onCancel={onCancel} />
      </>,
    )
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('stops listening once closed', () => {
    const onClose = vi.fn()
    const { unmount } = render(
      <BottomSheet open modal={false} onClose={onClose} title="T">
        body
      </BottomSheet>,
    )
    unmount()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('size="half" marks the sheet', () => {
    render(
      <BottomSheet open modal={false} size="half" onClose={() => {}} title="T">
        body
      </BottomSheet>,
    )
    expect(screen.getByRole('dialog')).toHaveAttribute('data-size', 'half')
  })
})

describe('BottomSheet.css: the non-modal and half variants', () => {
  const css = readUiCss('BottomSheet.css')

  it('the half sheet is about half the viewport high on a phone', () => {
    const d = declarations(css, ".sheet[data-size='half']")
    expect(d['block-size']).toMatch(/50dvh/)
  })

  it('a non-modal sheet sits above the bottom bar on a phone', () => {
    const d = declarations(css, ".sheet[data-modal='false']")
    expect(Number(d['z-index'])).toBeGreaterThan(10)
  })

  it('from 768 px a non-modal sheet is docked in the page (static), not a centred dialog', () => {
    const wide = css.slice(css.lastIndexOf('@media (min-width: 768px)'))
    expect(wide).toMatch(/\.sheet\[data-modal='false'\]\s*\{[^}]*position:\s*static/)
  })
})

describe('Toast.css: a toast clears an open half sheet on a phone', () => {
  it('lifts the toast region above a non-modal half sheet, by the sheet\'s height', () => {
    const css = readUiCss('Toast.css')
    expect(css).toMatch(/html:has\(\.sheet\[data-modal='false'\]\[data-size='half'\]\) \.toast-region \{\s*bottom: calc\(max\(50dvh, min\(480px, 85dvh\)\) \+ var\(--space-3\)\)/)
    expect(readUiCss('BottomSheet.css')).toContain('block-size: max(50dvh, min(480px, 85dvh))')
  })
})
