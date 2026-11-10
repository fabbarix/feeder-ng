import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/http'
import { agoText, answerErrorMessage, historyLine } from './format'

const now = new Date('2026-11-10T12:00:00Z')

describe('agoText', () => {
  it('reads naturally and uses the singular', () => {
    expect(agoText('2026-11-10T11:59:50Z', now)).toBe('just now')
    expect(agoText('2026-11-10T11:59:00Z', now)).toBe('1 minute ago')
    expect(agoText('2026-11-10T09:00:00Z', now)).toBe('3 hours ago')
    expect(agoText('2026-11-08T12:00:00Z', now)).toBe('2 days ago')
  })
})

describe('historyLine', () => {
  const base = { name: 'Zia', at: '2026-11-09T13:00:00Z', email: 'zia@example.test', actorEmail: 'user@example.test' }
  it('names who did what to whom', () => {
    expect(historyLine({ ...base, kind: 'approved' })).toBe('user@example.test approved zia@example.test')
    expect(historyLine({ ...base, kind: 'denied' })).toBe('user@example.test denied zia@example.test')
    expect(historyLine({ ...base, kind: 'requested', actorEmail: '' })).toBe('zia@example.test asked to join')
    expect(historyLine({ ...base, kind: 'expired', actorEmail: '' })).toBe('The request from zia@example.test expired')
  })
})

describe('answerErrorMessage', () => {
  it('says already answered for a 404 and stays generic otherwise', () => {
    expect(answerErrorMessage(new ApiError(404, 'not_found', 'x'))).toMatch(/already answered/)
    expect(answerErrorMessage(new ApiError(500, 'internal', 'x'))).toMatch(/something went wrong/i)
    expect(answerErrorMessage(new Error('x'))).toMatch(/something went wrong/i)
  })
})
