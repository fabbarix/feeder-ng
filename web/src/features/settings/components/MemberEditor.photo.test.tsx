// IM2: the Member sheet's Photo choice uses the shared ImagePicker (square crop), never its own file input.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PICKED_ID } from '../../../ui/ImagePicker/fake.test-helper'
import { settingsStrings } from '../strings'
import { anna, marco, sam } from './fixtures'
import { MemberEditor } from './MemberEditor'

vi.mock('../../../ui', async (orig) => ({
  ...(await orig<object>()),
  ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker,
}))

const text = settingsStrings.member
const users = [{ id: 2, displayName: 'Cook', email: 'cook@example.test' }]
const all = [anna, marco, sam]
const withPhoto = { ...sam, avatar: '', photo: 'a'.repeat(32), photoUrl: `/api/images/${'a'.repeat(32)}` }
const open = (member?: typeof sam, onSave = vi.fn()) => {
  render(<MemberEditor open users={users} members={all} member={member} onSave={onSave} onClose={() => {}} />)
  return onSave
}
const avatar = () => screen.getByRole('radiogroup', { name: text.avatar })
const picker = () => screen.getByTestId('fake-image-picker')
const save = () => userEvent.click(screen.getByRole('button', { name: text.save }))

describe('MemberEditor: Photo', () => {
  it('shows no picture field until Photo is chosen', () => {
    open()
    expect(screen.queryByTestId('fake-image-picker')).toBeNull()
  })

  it('Photo shows the shared ImagePicker, labelled "Member photo", with the square crop, empty at first', async () => {
    open()
    await userEvent.click(within(avatar()).getByRole('radio', { name: text.avatarPhoto }))
    expect(within(picker().parentElement!).getByRole('group', { name: text.photoLabel })).toBe(picker())
    expect(picker()).toHaveAttribute('data-aspect', '1')
    expect(picker()).toHaveAttribute('data-mode', 'upload')
    expect(picker()).toHaveAttribute('data-value', '')
    expect(screen.queryByRole('radiogroup', { name: 'Emoji' })).toBeNull()
  })

  it('saves the image id of the chosen photo and no emoji', async () => {
    const onSave = open()
    await userEvent.type(screen.getByLabelText('Name'), 'Nonna')
    await userEvent.click(within(avatar()).getByRole('radio', { name: text.avatarPhoto }))
    await userEvent.click(screen.getByRole('button', { name: `pick ${text.photoLabel}` }))
    await save()
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Nonna', avatar: '', photo: PICKED_ID }), null)
  })

  it('opens a Member that has a photo on Photo, holding that image id', () => {
    open(withPhoto)
    expect(within(avatar()).getByRole('radio', { name: text.avatarPhoto })).toHaveAttribute('aria-checked', 'true')
    expect(picker()).toHaveAttribute('data-value', withPhoto.photo)
  })

  it('removing the photo and saving sends no photo at all (a PATCH replaces the Member, so the server clears it)', async () => {
    const onSave = open(withPhoto)
    await userEvent.click(screen.getByRole('button', { name: `remove ${text.photoLabel}` }))
    await save()
    expect(onSave.mock.calls[0]![0]).not.toHaveProperty('photo')
  })

  it('switching from Photo to Initials or Emoji drops the photo', async () => {
    const onSave = open(withPhoto)
    await userEvent.click(within(avatar()).getByRole('radio', { name: text.avatarInitials }))
    expect(screen.queryByTestId('fake-image-picker')).toBeNull()
    await save()
    expect(onSave.mock.calls[0]![0]).toMatchObject({ avatar: '' })
    expect(onSave.mock.calls[0]![0]).not.toHaveProperty('photo')
  })

  it('switching from Emoji to Photo drops the emoji', async () => {
    const onSave = open(sam)
    await userEvent.click(within(avatar()).getByRole('radio', { name: text.avatarPhoto }))
    await userEvent.click(screen.getByRole('button', { name: `pick ${text.photoLabel}` }))
    await save()
    expect(onSave.mock.calls[0]![0]).toMatchObject({ avatar: '', photo: PICKED_ID })
  })
})

describe('MemberEditor: Photo kept while switching (IM2 review)', () => {
  it('Photo -> Emoji -> Photo brings the chosen photo back, and Save sends it', async () => {
    const onSave = open()
    await userEvent.type(screen.getByLabelText('Name'), 'Nonna')
    await userEvent.click(within(avatar()).getByRole('radio', { name: text.avatarPhoto }))
    await userEvent.click(screen.getByRole('button', { name: `pick ${text.photoLabel}` }))
    await userEvent.click(within(avatar()).getByRole('radio', { name: text.avatarEmoji }))
    expect(screen.queryByTestId('fake-image-picker')).toBeNull()
    await userEvent.click(within(avatar()).getByRole('radio', { name: text.avatarPhoto }))
    expect(picker()).toHaveAttribute('data-value', PICKED_ID)
    await save()
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ avatar: '', photo: PICKED_ID }), null)
  })

  it('an existing photo survives a trip through Initials too', async () => {
    const onSave = open(withPhoto)
    await userEvent.click(within(avatar()).getByRole('radio', { name: text.avatarInitials }))
    await userEvent.click(within(avatar()).getByRole('radio', { name: text.avatarPhoto }))
    expect(picker()).toHaveAttribute('data-value', withPhoto.photo)
    await save()
    expect(onSave.mock.calls[0]![0]).toMatchObject({ photo: withPhoto.photo })
  })

  it('saving while on Emoji sends no photo even though one was chosen before', async () => {
    const onSave = open()
    await userEvent.type(screen.getByLabelText('Name'), 'Nonna')
    await userEvent.click(within(avatar()).getByRole('radio', { name: text.avatarPhoto }))
    await userEvent.click(screen.getByRole('button', { name: `pick ${text.photoLabel}` }))
    await userEvent.click(within(avatar()).getByRole('radio', { name: text.avatarEmoji }))
    await save()
    expect(onSave.mock.calls[0]![0]).not.toHaveProperty('photo')
  })
})
