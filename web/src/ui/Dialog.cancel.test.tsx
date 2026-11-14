// B9-01 / DS-12 R-B: a Dialog takes `onCancel` and `cancelLabel`: an outline Cancel at the start of the action row, no Close.
// A dialog asks one question in its title and offers one decision.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { declarations, readUiCss } from './test-utils'

describe('Dialog onCancel (R-B)', () => {
  it('renders a secondary Cancel first in the action row, before the decision, and no Close', () => {
    render(
      <Dialog open onClose={() => {}} onCancel={() => {}} title="Freeze Lasagne?" actions={<Button>Freeze</Button>}>
        body
      </Dialog>,
    )
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    const row = document.querySelector('.dialog__actions') as HTMLElement
    const buttons = within(row).getAllByRole('button')
    expect(buttons[0]).toHaveAccessibleName('Cancel')
    expect(buttons[0]).toHaveAttribute('data-variant', 'secondary')
    expect(buttons[1]).toHaveAccessibleName('Freeze')
  })

  it('cancelLabel renames it and Cancel calls onCancel', async () => {
    const onCancel = vi.fn()
    render(<Dialog open onClose={() => {}} onCancel={onCancel} cancelLabel="Keep it" title="T" actions={<Button>Go</Button>} />)
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('renders the action row with only Cancel when no actions are given', () => {
    render(<Dialog open onClose={() => {}} onCancel={() => {}} title="T" />)
    expect(within(document.querySelector('.dialog__actions') as HTMLElement).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('a Dialog never has a Close button, with or without onCancel', () => {
    render(<Dialog open onClose={() => {}} title="T">body</Dialog>)
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })
})

describe('Dialog.css (R-C)', () => {
  it('the body keeps 5 px of block padding and scroll-padding so a focus ring is never clipped', () => {
    const d = declarations(readUiCss('Dialog.css'), '.dialog__body')
    expect(d['padding-block']).toBe('5px')
    expect(d['scroll-padding-block'] ?? d['scroll-padding']).toBeDefined()
  })
})
