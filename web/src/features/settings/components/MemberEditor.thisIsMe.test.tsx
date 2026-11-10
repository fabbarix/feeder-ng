// R11a (user bug: "a member can be also an admin: I don't see a way to link a member to my admin user"). Any User, an Admin
// included, can be linked to exactly one Member. The picker offers the signed-in Admin's own User, labelled "(you)" so it is
// recognisable (the env-seeded Admin's name is just the part of the email before the @), and "This is me" links it in one tap.
// "This is me" is shown only while the signed-in User is not linked to another Member (and not already linked to this one).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { openOptionNames } from '../test-utils'
import { anna, marco, sam } from './fixtures'
import { MemberEditor } from './MemberEditor'

const users = [
  { id: 1, displayName: 'mrwho', email: 'mrwho@example.test' }, // the Admin, seeded from FEEDER_ADMIN_EMAIL
  { id: 2, displayName: 'Cook', email: 'cook@example.test' },
  { id: 3, displayName: 'Guest', email: 'guest@example.test' },
]
const ME = 1
// anna is linked to User 2 (Cook); marco and sam are linked to nobody.
const open = (props: { member?: typeof sam; members?: Parameters<typeof MemberEditor>[0]['members']; currentUserId?: number } = {}, onSave = vi.fn()) => {
  render(
    <MemberEditor open users={users} members={props.members ?? [anna, marco, sam]} member={props.member} currentUserId={props.currentUserId ?? ME} onSave={onSave} onClose={() => {}} />,
  )
  return onSave
}

describe('MemberEditor: linking the signed-in User, Admin included', () => {
  it('offers the Admin\'s own User in Linked User, labelled "(you)", for a new Member and an existing one', async () => {
    open({ member: sam })
    await userEvent.click(screen.getByRole('combobox', { name: /Linked User/ }))
    const names = openOptionNames()
    expect(names).toContain('mrwho (you)')
    expect(names).toContain('Guest')
    expect(names).not.toContain('Cook') // linked to Anna
    expect(names.filter((n) => /mrwho/.test(n))).toHaveLength(1)
  })

  it('shows "This is me" when the signed-in User is linked to no Member', () => {
    open({ member: sam })
    expect(screen.getByRole('button', { name: 'This is me' })).toBeEnabled()
  })

  it('"This is me" selects the signed-in User in Linked User, and Save links them', async () => {
    const onSave = open({ member: sam })
    await userEvent.click(screen.getByRole('button', { name: 'This is me' }))
    expect(screen.getByRole('combobox', { name: /Linked User/ })).toHaveTextContent('mrwho (you)')
    await userEvent.click(screen.getByRole('button', { name: 'Save Member' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Sam' }), ME)
  })

  it('works on a new Member too', async () => {
    const onSave = open()
    await userEvent.type(screen.getByLabelText('Name'), 'Fabio')
    await userEvent.click(screen.getByRole('button', { name: 'This is me' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Member' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Fabio' }), ME)
  })

  it('is hidden once "This is me" has been used (the Member is now linked to me)', async () => {
    open({ member: sam })
    await userEvent.click(screen.getByRole('button', { name: 'This is me' }))
    expect(screen.queryByRole('button', { name: 'This is me' })).toBeNull()
  })

  it('is hidden when the signed-in User is already linked to another Member, who is named in the picker help', async () => {
    const linkedMe = { ...marco, userId: ME } // Marco is me
    open({ member: sam, members: [anna, linkedMe, sam] })
    expect(screen.queryByRole('button', { name: 'This is me' })).toBeNull()
    await userEvent.click(screen.getByRole('combobox', { name: /Linked User/ }))
    expect(openOptionNames().join('|')).not.toMatch(/mrwho/) // one User, one Member
  })

  it('is hidden on the Member the signed-in User is already linked to (the picker shows them selected)', () => {
    const linkedMe = { ...sam, userId: ME }
    open({ member: linkedMe, members: [anna, marco, linkedMe] })
    expect(screen.queryByRole('button', { name: 'This is me' })).toBeNull()
    expect(screen.getByRole('combobox', { name: /Linked User/ })).toHaveTextContent('mrwho (you)')
  })

  it('is hidden when the editor does not know the signed-in User', () => {
    render(<MemberEditor open users={users} members={[anna, marco, sam]} member={sam} onSave={() => {}} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: 'This is me' })).toBeNull()
  })

  it('sits with Linked User, after Portion Factor, inside the dialog', () => {
    open({ member: sam })
    const dialog = screen.getByRole('dialog', { name: 'Edit Member' })
    const portion = within(dialog).getByRole('group', { name: 'Portion Factor' })
    const me = within(dialog).getByRole('button', { name: 'This is me' })
    expect(portion.compareDocumentPosition(me) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
