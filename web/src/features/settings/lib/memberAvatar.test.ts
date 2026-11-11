import { describe, expect, it } from 'vitest'
import type { MemberInput } from '../types'
import { avatarMode, withAvatarMode } from './memberAvatar'

const ID = 'a'.repeat(32)
const draft = (over: Partial<MemberInput> = {}): MemberInput => ({ name: 'Sam', colour: '#3366cc', avatar: '', portionFactor: 1, email: null, ...over })

describe('avatarMode', () => {
  it('photo wins, then emoji, then initials', () => {
    expect(avatarMode({ avatar: '🦊', photo: ID })).toBe('photo')
    expect(avatarMode({ avatar: '🦊', photo: '' })).toBe('emoji')
    expect(avatarMode({ avatar: '🦊' })).toBe('emoji')
    expect(avatarMode({ avatar: '', photo: '' })).toBe('initials')
    expect(avatarMode({ avatar: '  ' })).toBe('initials')
  })
})

describe('withAvatarMode', () => {
  it('initials clears the emoji and the photo', () => {
    expect(withAvatarMode(draft({ avatar: '🦊', photo: ID }), 'initials')).toMatchObject({ avatar: '', photo: '' })
  })
  it('emoji keeps the emoji and clears the photo', () => {
    expect(withAvatarMode(draft({ avatar: '🦊', photo: ID }), 'emoji')).toMatchObject({ avatar: '🦊', photo: '' })
  })
  it('photo keeps the photo and clears the emoji', () => {
    expect(withAvatarMode(draft({ avatar: '🦊', photo: ID }), 'photo')).toMatchObject({ avatar: '', photo: ID })
  })
  it('leaves everything else alone and does not change its argument', () => {
    const d = draft({ avatar: '🦊', photo: ID, name: 'Anna', portionFactor: 0.5 })
    const out = withAvatarMode(d, 'initials')
    expect(out).toMatchObject({ name: 'Anna', colour: '#3366cc', portionFactor: 0.5, email: null })
    expect(d.avatar).toBe('🦊')
    expect(d.photo).toBe(ID)
  })
})
