// B9-01 / DS-12 R-B: a sheet takes `onCancel` and `cancelLabel`. With onCancel, Cancel is a secondary Button at the footer's
// start and there is NO Close. Without onCancel the header carries the circular CloseButton. Esc, the scrim and the grip still dismiss.
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { declarations, readUiCss } from './test-utils'

describe('BottomSheet onCancel (R-B)', () => {
  it('renders an outline Cancel as the first control of the footer, and no Close', () => {
    render(
      <BottomSheet open onClose={() => {}} onCancel={() => {}} title="Mark as cooked" footer={<Button>Cooked</Button>}>
        body
      </BottomSheet>,
    )
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    const footer = document.querySelector('.sheet__footer') as HTMLElement
    const buttons = within(footer).getAllByRole('button')
    expect(buttons[0]).toHaveAccessibleName('Cancel')
    expect(buttons[0]).toHaveAttribute('data-variant', 'secondary')
    expect(buttons[1]).toHaveAccessibleName('Cooked')
  })

  it('renders the footer with only Cancel when the sheet has no footer of its own', () => {
    render(<BottomSheet open onClose={() => {}} onCancel={() => {}} title="T">body</BottomSheet>)
    const footer = document.querySelector('.sheet__footer') as HTMLElement
    expect(within(footer).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('cancelLabel renames the button', () => {
    render(<BottomSheet open onClose={() => {}} onCancel={() => {}} cancelLabel="Keep" title="T">body</BottomSheet>)
    expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  it('Cancel calls onCancel', async () => {
    const onCancel = vi.fn()
    render(<BottomSheet open onClose={() => {}} onCancel={onCancel} title="T">body</BottomSheet>)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('Escape still dismisses through onClose', () => {
    const onClose = vi.fn()
    render(<BottomSheet open onClose={onClose} onCancel={() => {}} title="T">body</BottomSheet>)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('BottomSheet without onCancel (R-B)', () => {
  it('has the circular CloseButton in the header and no Cancel', async () => {
    const onClose = vi.fn()
    render(<BottomSheet open onClose={onClose} title="Unknown barcode">body</BottomSheet>)
    const close = screen.getByRole('button', { name: 'Close' })
    expect(close).toHaveClass('close-button')
    expect(close.closest('.sheet__header')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    await userEvent.click(close)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('BottomSheet.css (R-B, R-C)', () => {
  const css = readUiCss('BottomSheet.css')
  it('the header is top-aligned so the Close never stretches', () => {
    expect(declarations(css, '.sheet__header')['align-items']).toBe('flex-start')
  })
  it('the body keeps 5 px of block padding and scroll-padding so a focus ring is never clipped', () => {
    const d = declarations(css, '.sheet__body')
    expect(d['padding-block']).toBe('5px')
    expect(d['scroll-padding-block'] ?? d['scroll-padding']).toBeDefined()
  })
  it('a sticky footer sets scroll-padding-block-end to its height', () => {
    expect(css).toMatch(/scroll-padding-block-end/)
  })
})
