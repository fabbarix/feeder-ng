// B9-52, SET-03 (user decision SET 3): "Copy sign-in message" plus a Share item where the device has a share sheet.
// Rules these tests pin (docs/design/ui-review-3/settings.md, SET-03):
//   - a row that is not yours has exactly two icon buttons after the Admin switch, in the ListRow `actions` slot:
//       share sheet:    "Share sign-in message for <email>" and "More for <email>" (aria-haspopup=menu), whose Menu holds
//                       "Copy sign-in message" and "Remove <email>";
//       no share sheet: "Copy sign-in message for <email>" and "Remove <email>".
//     Your own row has Remove only (disabled while you are the Last Admin).
//   - After "Add to allowlist" a toast: headline "<email> can sign in now", subline "Send them where and how to sign in.", ONE action
//     ("Share sign-in message" or "Copy sign-in message"), no status icon.
//   - Copy ok -> toast "Sign-in message copied". Share ok -> nothing. Share cancelled (AbortError) -> nothing, focus stays on Share.
//     Share failed (any other) -> copy instead, toast "Sign-in message copied" + subline "The share sheet did not open.".
//     Clipboard unavailable -> a sheet "Sign-in message": read-only TextArea, already selected, helper "Select the text and copy
//     it.", one primary "Done", no Cancel, the circular Close.
//   - navigator.share is only called from the Share item (never on mount, never from Copy); no alert, prompt or confirm.
//   - After a share, cancel or copy, focus is back on the button that started it.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { sharePayload, signInMessage } from '../lib/allowlist'
import { admin, cook } from './fixtures'
import { AllowlistPanel, type AllowlistPanelProps } from './AllowlistPanel'

const origin = window.location.origin
const message = (email: string) => signInMessage(email, origin)

interface Device {
  share?: (data: ShareData) => Promise<void>
  clipboard?: { writeText: (text: string) => Promise<void> } | null
}

const defined: string[] = []
function stub(name: 'share' | 'canShare' | 'clipboard', value: unknown) {
  Object.defineProperty(navigator, name, { configurable: true, writable: true, value })
  defined.push(name)
}
function device({ share, clipboard = { writeText: vi.fn().mockResolvedValue(undefined) } }: Device = {}) {
  if (share) stub('share', share)
  if (clipboard) stub('clipboard', clipboard)
  return { share, writeText: clipboard?.writeText as ReturnType<typeof vi.fn> | undefined }
}
afterEach(() => {
  for (const name of defined.splice(0)) Reflect.deleteProperty(navigator, name)
  vi.restoreAllMocks()
})

function setup(over: Partial<AllowlistPanelProps> = {}) {
  const props: AllowlistPanelProps = { users: [admin, cook], currentUserId: 1, onAdd: vi.fn().mockResolvedValue(undefined), onSetAdmin: vi.fn(), onRemove: vi.fn(), ...over }
  render(
    <MemoryRouter>
      <ToastProvider>
        <ConfirmProvider>
          <AllowlistPanel {...props} />
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
  return props
}
const row = (email: string) => screen.getByText(email).closest('li')!
const toast = () => document.querySelector('.toast') as HTMLElement | null
const abort = () => Object.assign(new Error('closed'), { name: 'AbortError' })
const notAllowed = () => Object.assign(new Error('blocked'), { name: 'NotAllowedError' })
const noWindowDialogs = () => ({ alert: vi.spyOn(window, 'alert').mockImplementation(() => {}), prompt: vi.spyOn(window, 'prompt').mockImplementation(() => null), confirm: vi.spyOn(window, 'confirm').mockImplementation(() => true) })

describe('the row on a device with no share sheet', () => {
  it('shows exactly two icon buttons after the Admin switch: Copy sign-in message and Remove, each with a title', () => {
    device()
    setup()
    const actions = row('cook@example.test').querySelector('.list-row__actions') as HTMLElement
    expect(within(actions).getByRole('switch', { name: 'Admin: cook@example.test' })).toBeInTheDocument()
    const buttons = within(actions).getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Copy sign-in message for cook@example.test', 'Remove cook@example.test'])
    for (const b of buttons) expect(b).toHaveAttribute('title', b.getAttribute('aria-label'))
    expect(within(row('cook@example.test')).queryByRole('button', { name: /^Share|^More/ })).toBeNull()
  })

  it('copies the sign-in message, shows "Sign-in message copied", and keeps focus on the Copy button', async () => {
    const { writeText } = device()
    setup()
    const copy = screen.getByRole('button', { name: 'Copy sign-in message for cook@example.test' })
    await userEvent.click(copy)
    expect(writeText).toHaveBeenCalledWith(message('cook@example.test'))
    expect(await screen.findByText('Sign-in message copied')).toBeInTheDocument()
    expect(toast()!.querySelector('.toast__title svg')).toBeNull() // R-D+: a success has no status icon
    expect(toast()!.querySelector('.toast__subline')).toBeNull()
    await waitFor(() => expect(copy).toHaveFocus())
  })

  it('never calls navigator.share', async () => {
    const { writeText } = device()
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Copy sign-in message for cook@example.test' }))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect('share' in navigator).toBe(false)
  })

  it('without clipboard access the message opens selected in a "Sign-in message" sheet with one primary Done and the circular Close', async () => {
    device({ clipboard: null })
    const dialogs = noWindowDialogs()
    setup()
    const copy = screen.getByRole('button', { name: 'Copy sign-in message for cook@example.test' })
    await userEvent.click(copy)
    const sheet = await screen.findByRole('dialog', { name: 'Sign-in message' })
    const area = within(sheet).getByRole('textbox', { name: 'Sign-in message' }) as HTMLTextAreaElement
    expect(area).toHaveAttribute('readonly')
    expect(area.value).toBe(message('cook@example.test'))
    expect(area).toHaveAccessibleDescription('Select the text and copy it.')
    expect([area.selectionStart, area.selectionEnd]).toEqual([0, area.value.length])
    expect(area).toHaveFocus()
    expect(within(sheet).getByRole('button', { name: 'Done' })).toHaveAttribute('data-variant', 'primary')
    expect(within(sheet).queryByRole('button', { name: 'Cancel' })).toBeNull() // no Cancel, so the header keeps its Close (R-B)
    expect(within(sheet).getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(screen.queryByText('Sign-in message copied')).toBeNull()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(copy).toHaveFocus())
    expect(dialogs.alert).not.toHaveBeenCalled()
    expect(dialogs.prompt).not.toHaveBeenCalled()
    expect(dialogs.confirm).not.toHaveBeenCalled()
  })

  it('a clipboard that refuses the write falls back to the same sheet', async () => {
    device({ clipboard: { writeText: vi.fn().mockRejectedValue(notAllowed()) } })
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Copy sign-in message for cook@example.test' }))
    expect(await screen.findByRole('dialog', { name: 'Sign-in message' })).toBeInTheDocument()
  })
})

describe('the row on a device with a share sheet', () => {
  it('shows Share sign-in message and More, not Copy or Remove, after the switch; More has aria-haspopup="menu"', () => {
    device({ share: vi.fn() })
    setup()
    const actions = row('cook@example.test').querySelector('.list-row__actions') as HTMLElement
    const buttons = within(actions).getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Share sign-in message for cook@example.test', 'More for cook@example.test'])
    for (const b of buttons) expect(b).toHaveAttribute('title', b.getAttribute('aria-label'))
    const more = within(actions).getByRole('button', { name: 'More for cook@example.test' })
    expect(more).toHaveAttribute('aria-haspopup', 'menu')
    expect(more).toHaveAttribute('aria-expanded', 'false')
  })

  it('does not ask the browser to share on mount', () => {
    const share = vi.fn()
    device({ share })
    setup()
    expect(share).not.toHaveBeenCalled()
  })

  it('the More menu holds "Copy sign-in message" and "Remove <email>"', async () => {
    device({ share: vi.fn() })
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'More for cook@example.test' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Copy sign-in message', 'Remove cook@example.test'])
  })

  it('choosing Copy in the menu copies, says so, and returns focus to More', async () => {
    const { writeText } = device({ share: vi.fn() })
    setup()
    const more = screen.getByRole('button', { name: 'More for cook@example.test' })
    await userEvent.click(more)
    await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Copy sign-in message' }))
    expect(writeText).toHaveBeenCalledWith(message('cook@example.test'))
    expect(await screen.findByText('Sign-in message copied')).toBeInTheDocument()
    await waitFor(() => expect(more).toHaveFocus())
  })

  it('choosing Remove in the menu asks in the danger ConfirmDialog first', async () => {
    device({ share: vi.fn() })
    const { onRemove } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'More for cook@example.test' }))
    await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Remove cook@example.test' }))
    const dialog = await screen.findByRole('dialog', { name: 'Remove cook@example.test?' })
    expect(onRemove).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    expect(onRemove).toHaveBeenCalledWith(2)
  })

  it('Share hands the payload (link in `url`) to the share sheet; success shows no toast', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const { writeText } = device({ share })
    setup()
    const button = screen.getByRole('button', { name: 'Share sign-in message for cook@example.test' })
    await userEvent.click(button)
    await waitFor(() => expect(share).toHaveBeenCalledWith(sharePayload('cook@example.test', origin)))
    expect(share.mock.calls[0]![0]).toMatchObject({ title: 'Sign in to Feeder', url: origin })
    await waitFor(() => expect(button).toHaveFocus())
    expect(toast()).toBeNull()
    expect(writeText).not.toHaveBeenCalled()
  })

  it('cancelling the share sheet (AbortError) does nothing and keeps focus on Share', async () => {
    const share = vi.fn().mockRejectedValue(abort())
    const { writeText } = device({ share })
    setup()
    const button = screen.getByRole('button', { name: 'Share sign-in message for cook@example.test' })
    await userEvent.click(button)
    await waitFor(() => expect(share).toHaveBeenCalled())
    await waitFor(() => expect(button).toHaveFocus())
    expect(toast()).toBeNull()
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('when sharing fails the message is copied instead, with "The share sheet did not open." and no icon', async () => {
    const { writeText } = device({ share: vi.fn().mockRejectedValue(notAllowed()) })
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Share sign-in message for cook@example.test' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(message('cook@example.test')))
    expect(await screen.findByText('Sign-in message copied')).toBeInTheDocument()
    expect(toast()!.querySelector('.toast__subline')).toHaveTextContent('The share sheet did not open.')
    expect(toast()!.querySelector('.toast__title svg')).toBeNull()
  })

  it('when sharing fails and the clipboard is unavailable too, the sheet opens and Done returns focus to Share', async () => {
    device({ share: vi.fn().mockRejectedValue(notAllowed()), clipboard: null })
    setup()
    const button = screen.getByRole('button', { name: 'Share sign-in message for cook@example.test' })
    await userEvent.click(button)
    const sheet = await screen.findByRole('dialog', { name: 'Sign-in message' })
    expect((within(sheet).getByRole('textbox') as HTMLTextAreaElement).value).toBe(message('cook@example.test'))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(button).toHaveFocus())
  })

  it('navigator.canShare(payload) === false counts as no share sheet (Copy and Remove are shown)', () => {
    stub('share', vi.fn())
    stub('canShare', vi.fn().mockReturnValue(false))
    device()
    setup()
    expect(screen.getByRole('button', { name: 'Copy sign-in message for cook@example.test' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Share sign-in message/ })).toBeNull()
  })
})

describe('your own row', () => {
  it.each([['no share sheet', undefined], ['a share sheet', vi.fn()]])('has Remove only, no Share, Copy or More (%s)', (_name, share) => {
    device(share ? { share } : {})
    setup()
    const own = row('admin@example.test')
    expect(within(own).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Remove admin@example.test'])
    expect(within(own).getByRole('button', { name: 'Remove admin@example.test' })).toBeDisabled() // the Last Admin
  })

  it('with two Admins your row still has no Share or Copy, and Remove is enabled', () => {
    device({ share: vi.fn() })
    setup({ users: [admin, { ...cook, isAdmin: true }] })
    expect(within(row('admin@example.test')).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Remove admin@example.test'])
    expect(within(row('admin@example.test')).getByRole('button', { name: 'Remove admin@example.test' })).toBeEnabled()
    expect(within(row('cook@example.test')).getByRole('button', { name: 'More for cook@example.test' })).toBeInTheDocument()
  })
})

describe('after "Add to allowlist"', () => {
  const addNonna = async () => {
    await userEvent.type(screen.getByLabelText('Email to allow'), ' nonna@example.test ')
    await userEvent.click(screen.getByRole('button', { name: 'Add to allowlist' }))
  }

  it('shows a headline, a subline and ONE action, with no status icon (no share sheet: Copy sign-in message)', async () => {
    const { writeText } = device()
    setup()
    await addNonna()
    // The headline holds the address as EmailText (it wraps only at "@" and "."), so its words span several nodes.
    await waitFor(() => expect(toast()?.querySelector('.toast__title')).toHaveTextContent('nonna@example.test can sign in now'))
    const t = toast()!
    expect(t.querySelector('.toast__subline')).toHaveTextContent('Send them where and how to sign in.')
    expect(t.querySelector('.toast__title svg')).toBeNull()
    const actions = within(t).getAllByRole('button').filter((b) => b.classList.contains('toast__action'))
    expect(actions.map((b) => b.textContent)).toEqual(['Copy sign-in message'])
    await userEvent.click(actions[0]!)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(message('nonna@example.test')))
  })

  it('offers Share sign-in message where the device can share, and shares the new address', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    device({ share })
    setup()
    await addNonna()
    await waitFor(() => expect(toast()?.querySelector('.toast__title')).toHaveTextContent('nonna@example.test can sign in now'))
    const action = [...toast()!.querySelectorAll('.toast__action')]
    expect(action.map((b) => b.textContent)).toEqual(['Share sign-in message'])
    await userEvent.click(action[0] as HTMLElement)
    await waitFor(() => expect(share).toHaveBeenCalledWith(sharePayload('nonna@example.test', origin)))
  })

  it('shows no toast when the add is refused, and keeps the typed text', async () => {
    device()
    setup({ onAdd: vi.fn().mockRejectedValue(new Error('taken')) })
    await userEvent.type(screen.getByLabelText('Email to allow'), 'cook@example.test')
    await userEvent.click(screen.getByRole('button', { name: 'Add to allowlist' }))
    await waitFor(() => expect(screen.getByLabelText('Email to allow')).toHaveValue('cook@example.test'))
    expect(toast()).toBeNull()
  })
})

// The review items of this package.
describe('the email stays readable', () => {
  it('is the row title, whole, with a break only before "@" and after "." (a <wbr>), and the full text as its title attribute', () => {
    device()
    setup({ users: [admin, { ...cook, email: 'chiara.rossi-verdi@famiglia.example.test' }] })
    const li = row('chiara.rossi-verdi@famiglia.example.test')
    const title = li.querySelector('.list-row__title') as HTMLElement
    expect(title.textContent).toBe('chiara.rossi-verdi@famiglia.example.test')
    expect([...title.querySelectorAll('wbr')]).toHaveLength(4) // chiara.|rossi-verdi|@famiglia.|example.|test
    expect(within(li).getByTitle('chiara.rossi-verdi@famiglia.example.test')).toBeInTheDocument()
    expect(li).toHaveAttribute('data-wrap-title', 'true') // wraps (two lines, then an ellipsis) instead of one cut line
  })

  it('the hint "People can also ask to join" is a Muted line, and a general error is one FormError', () => {
    device()
    setup({ error: 'The Household needs at least one Admin.' })
    expect(screen.getByText(/People can also ask to join/).closest('p')).toHaveClass('muted')
    const alerts = [...document.querySelectorAll('[role="alert"].form-error')]
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toHaveTextContent('The Household needs at least one Admin.')
  })
})
