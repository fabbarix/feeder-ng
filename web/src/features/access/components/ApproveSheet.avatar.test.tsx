// PE: the Approve sheet's Member picker draws each Member with the shared Avatar: Photo, else emoji, else initials.
// (It used to pass the emoji as an image address.)
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { accessStrings } from '../strings'
import type { AccessMember, AccessRequest } from '../types'
import { ApproveSheet } from './ApproveSheet'

const photo = `/api/images/${'a'.repeat(32)}`
const request = { id: 1, email: 'new@example.test', name: 'New Person' } as unknown as AccessRequest
const members = [
  { id: 1, name: 'Anna', avatar: '', photoUrl: photo, userId: null, email: null },
  { id: 2, name: 'Sam', avatar: '🦊', photoUrl: '', userId: null, email: null },
  { id: 3, name: 'Zia Rosa', avatar: '', photoUrl: '', userId: null, email: null },
] as unknown as AccessMember[]

describe('ApproveSheet: Member avatars', () => {
  it('shows the Photo, the emoji or the initials of each Member in the options', async () => {
    render(<ApproveSheet request={request} members={members} onApprove={vi.fn()} onCancel={vi.fn()} />)
    await userEvent.click(screen.getByRole('combobox', { name: accessStrings.approveSheet.memberLabel }))
    const options = screen.getAllByRole('option')
    expect(options[0]!.querySelector('img')).toHaveAttribute('src', photo)
    expect(options[1]!.querySelector('img')).toBeNull()
    expect(options[1]).toHaveTextContent('🦊')
    expect(options[2]).toHaveTextContent('ZR')
  })
})
