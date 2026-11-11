// R2-1 (G-01): the keyboard rules extracted from app/YourMenu.tsx, as a hook both menus use.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useMenuKeys } from './useMenuKeys'

function Harness({ onClose }: { onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(true)
  const { onMenuKeyDown } = useMenuKeys({
    open,
    onClose: () => {
      setOpen(false)
      onClose()
    },
    menuRef,
    triggerRef,
  })
  return (
    <>
      <button ref={triggerRef}>trigger</button>
      {open ? (
        <div ref={menuRef} role="menu" onKeyDown={onMenuKeyDown}>
          <button role="menuitem">A</button>
          <button role="menuitem">B</button>
          <button role="menuitemcheckbox" aria-checked="false">C</button>
        </div>
      ) : null}
    </>
  )
}

describe('useMenuKeys', () => {
  it('focuses the first item while open', () => {
    render(<Harness onClose={() => {}} />)
    expect(screen.getByRole('menuitem', { name: 'A' })).toHaveFocus()
  })
  it('ArrowDown/ArrowUp wrap, Home/End jump, and menuitemcheckbox is an item too', async () => {
    render(<Harness onClose={() => {}} />)
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('menuitemcheckbox', { name: 'C' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'A' })).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitemcheckbox', { name: 'C' })).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(screen.getByRole('menuitem', { name: 'A' })).toHaveFocus()
  })
  it('Escape (from anywhere in the document) closes and focuses the trigger', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'trigger' })).toHaveFocus()
  })
  it('Tab closes and focuses the trigger', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await userEvent.tab()
    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'trigger' })).toHaveFocus()
  })
})
