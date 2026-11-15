// B9-49 (A11Y-12, TB-15e): Your menu has names. The open role="menu" is named by the avatar button (aria-labelledby), so it is announced
// "Your menu"; the avatar button's own name carries the Sign-in request count, and the count badge is decoration (aria-hidden).
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { YourMenu } from './YourMenu'

function mount(pendingAccessRequests = 0) {
  render(
    <MemoryRouter>
      <YourMenu user={{ displayName: 'Anna Rossi' }} items={[{ id: 'board', label: 'Kitchen board', path: '/board', placement: 'menu' }]} pendingAccessRequests={pendingAccessRequests} onSignOut={() => {}} />
    </MemoryRouter>,
  )
}

describe('Your menu: the open menu is named', () => {
  it('the role="menu" element is named "Your menu" through aria-labelledby on the avatar button', async () => {
    mount()
    const button = screen.getByRole('button', { name: 'Your menu' })
    await userEvent.click(button)
    const menu = screen.getByRole('menu', { name: 'Your menu' })
    expect(button.id).not.toBe('')
    expect(menu).toHaveAttribute('aria-labelledby', button.id)
    expect(menu).not.toHaveAttribute('aria-label')
  })

  it('with waiting Sign-in requests the menu is named by the same button, so it also says how many are waiting', async () => {
    mount(3)
    const button = screen.getByRole('button', { name: 'Your menu, 3 sign-in requests waiting' })
    await userEvent.click(button)
    expect(screen.getByRole('menu', { name: 'Your menu, 3 sign-in requests waiting' })).toHaveAttribute('aria-labelledby', button.id)
  })

  it('a second Your menu on a page never shares the id (it is generated, not a literal)', () => {
    render(
      <MemoryRouter>
        <YourMenu user={{ displayName: 'A' }} items={[]} onSignOut={() => {}} />
        <YourMenu user={{ displayName: 'B' }} items={[]} onSignOut={() => {}} />
      </MemoryRouter>,
    )
    const ids = screen.getAllByRole('button', { name: 'Your menu' }).map((b) => b.id)
    expect(new Set(ids).size).toBe(2)
    expect(ids.every((id) => id !== '')).toBe(true)
  })
})

describe('Your menu: the Sign-in request badge is announced once (TB-15e)', () => {
  it('the count badge is aria-hidden: the button\'s name already says the count', () => {
    mount(3)
    const badge = document.querySelector('.access-badge')!
    expect(badge).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('img', { name: /sign-in request/i })).toBeNull()
  })
})
