// hf-recipes-filter: the shared Popover, a panel anchored to its trigger from 768 px and a BottomSheet below
// (docs/design/recipes-filter.md 7.1).
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubViewportWidth } from '../lib/viewport.test-helper'
import { Popover } from './Popover'

function Harness({ footer }: { footer?: boolean }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={anchor} onClick={() => setOpen((o) => !o)}>
        Filters
      </button>
      <p>Outside</p>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchor} title="Filters" footer={footer ? <button>Done</button> : undefined}>
        <button>All Courses</button>
        <button>Main</button>
      </Popover>
    </>
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('Popover from 768 px', () => {
  it('renders nothing while closed', () => {
    render(<Harness />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('is a non-modal dialog named by its visible title, outside any <dialog> sheet', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const panel = screen.getByRole('dialog', { name: 'Filters' })
    expect(panel.tagName).not.toBe('DIALOG')
    expect(panel).not.toHaveAttribute('aria-modal', 'true')
    expect(panel).toHaveClass('popover')
  })
  it('moves focus to the first interactive element of its body', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    expect(screen.getByRole('button', { name: 'All Courses' })).toHaveFocus()
  })
  it('Escape closes it and gives focus back to the anchor', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Filters' })).toHaveFocus()
  })
  it('a click outside closes it', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.mouseDown(screen.getByText('Outside'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('clicking the anchor again closes it (the anchor counts as inside)', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('a click inside does not close it', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Main' }))
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument()
  })
  it('renders its footer under the body', async () => {
    render(<Harness footer />)
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const footer = screen.getByRole('button', { name: 'Done' }).closest('.popover__footer')
    expect(footer).not.toBeNull()
  })
})

describe('Popover below 768 px', () => {
  it('is the modal BottomSheet, with the same title, body and footer', async () => {
    stubViewportWidth(390)
    render(<Harness footer />)
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const sheet = screen.getByRole('dialog', { name: 'Filters' })
    expect(sheet.tagName).toBe('DIALOG')
    expect(sheet).toHaveClass('sheet')
    expect(screen.getByRole('button', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
  })
  it('its Close button closes it', async () => {
    stubViewportWidth(390)
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
