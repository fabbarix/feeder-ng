// PE: Save Member is disabled while the Photo is uploading (ImagePicker onBusyChange), and works again afterwards.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { settingsStrings } from '../strings'
import { anna, marco, sam } from './fixtures'
import { MemberEditor } from './MemberEditor'

vi.mock('../../../ui', async (orig) => ({
  ...(await orig<object>()),
  ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker,
}))

const text = settingsStrings.member

describe('MemberEditor: photo busy', () => {
  it('disables Save Member while the photo uploads and enables it when done', async () => {
    render(<MemberEditor open users={[]} members={[anna, marco, sam]} member={sam} onSave={vi.fn()} onClose={() => {}} />)
    await userEvent.click(within(screen.getByRole('radiogroup', { name: text.avatar })).getByRole('radio', { name: text.avatarPhoto }))
    const save = () => screen.getByRole('button', { name: text.save })
    expect(save()).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: `start upload ${text.photoLabel}` }))
    expect(save()).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: `finish upload ${text.photoLabel}` }))
    expect(save()).toBeEnabled()
  })
})
