// B9-36 (SAFE-08): Sign out passes through the preferences guard. With a preview the shared "Leave without saving?" question comes first
// (the page registers its check with preferencePreview.setLeaveCheck); Keep editing means nobody is signed out.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { preferencePreview } from '../features/settings/lib/preferencePreview'
import { YourMenu } from './YourMenu'

afterEach(() => preferencePreview.setLeaveCheck(null))

async function signOut(onSignOut: () => void) {
  render(
    <MemoryRouter>
      <YourMenu user={{ displayName: 'Anna' }} items={[]} onSignOut={onSignOut} />
    </MemoryRouter>,
  )
  await userEvent.click(screen.getByRole('button', { name: /Anna|Your menu|account/i }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }))
}

describe('YourMenu Sign out and the preferences guard', () => {
  it('signs out at once when there is nothing to ask', async () => {
    const onSignOut = vi.fn()
    await signOut(onSignOut)
    await waitFor(() => expect(onSignOut).toHaveBeenCalledTimes(1))
  })

  it('asks the registered check first and signs out only when it says leave (Discard changes)', async () => {
    const onSignOut = vi.fn()
    const check = vi.fn().mockResolvedValue(true)
    preferencePreview.setLeaveCheck(check)
    await signOut(onSignOut)
    await waitFor(() => expect(onSignOut).toHaveBeenCalledTimes(1))
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('does not sign out when the check says stay (Keep editing)', async () => {
    const onSignOut = vi.fn()
    const check = vi.fn().mockResolvedValue(false)
    preferencePreview.setLeaveCheck(check)
    await signOut(onSignOut)
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1))
    await Promise.resolve()
    expect(onSignOut).not.toHaveBeenCalled()
  })

  it('closes the menu either way', async () => {
    preferencePreview.setLeaveCheck(() => Promise.resolve(false))
    await signOut(vi.fn())
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })
})
