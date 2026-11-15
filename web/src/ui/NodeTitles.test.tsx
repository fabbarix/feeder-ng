// B9-52 (batch review w3d): three string-only surfaces take a node where part of the words must wrap their own way (a long email
// that breaks only at "@" and "."): the rich toast's title, the BottomSheet title, and a Menu's sheet title and item `labelNode`.
// The accessible names stay the plain words.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BottomSheet } from './BottomSheet'
import { stubViewportWidth } from './lib/viewport.test-helper'
import { Menu } from './Menu'
import { ToastProvider, useToast } from './Toast'

afterEach(() => vi.unstubAllGlobals())

const Email = () => (
  <span className="email">
    a<wbr />@b.<wbr />test
  </span>
)

function Fire() {
  const { show } = useToast()
  useEffect(() => {
    show({ title: <><Email /> can sign in now</> })
  }, [show])
  return null
}

describe('node titles (additive)', () => {
  it('a rich toast shows a node title', async () => {
    render(
      <ToastProvider>
        <Fire />
      </ToastProvider>,
    )
    const title = await screen.findByText((_, el) => el?.classList.contains('toast__title-text') ?? false)
    expect(title).toHaveTextContent('a@b.test can sign in now')
    expect(title.querySelector('.email wbr')).not.toBeNull()
  })

  it('a BottomSheet shows a node title and is named by it', () => {
    render(
      <BottomSheet open onClose={() => {}} title={<><Email /> details</>}>
        body
      </BottomSheet>,
    )
    expect(screen.getByRole('dialog', { name: 'a@b.test details' }).querySelector('.sheet__title .email')).not.toBeNull()
  })

  it('a Menu sheet takes a node title and item labelNode; the list and the row keep their plain names', async () => {
    stubViewportWidth(390)
    render(
      <MemoryRouter>
        <Menu label="More for a@b.test" title={<>More for <Email /></>} items={[{ id: 'r', label: 'Remove a@b.test', labelNode: <>Remove <Email /></>, onSelect: () => {} }]} />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'More for a@b.test' }))
    const sheet = screen.getByRole('dialog')
    expect(sheet.querySelector('.sheet__title .email')).not.toBeNull()
    expect(within(sheet).getByRole('list', { name: 'More for a@b.test' })).toBeInTheDocument()
    const row = within(sheet).getByRole('button', { name: 'Remove a@b.test' })
    expect(row.closest('li')?.querySelector('.email')).not.toBeNull()
  })

  it('a Menu popover item shows labelNode and keeps label as its name', async () => {
    stubViewportWidth(1024)
    render(
      <MemoryRouter>
        <Menu label="More" items={[{ id: 'r', label: 'Remove a@b.test', labelNode: <>Remove <Email /></>, onSelect: () => {} }]} />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'More' }))
    const item = screen.getByRole('menuitem', { name: 'Remove a@b.test' })
    expect(item.querySelector('.email')).not.toBeNull()
  })
})
