// WP-E/G: when "Read a recipe" is usable and what to say when it is not (ai-recipe-import.md sections 5.2, 7; ra-e-import.md section 4.4).
import { describe, expect, it } from 'vitest'
import type { AssistantStatus } from '../types'
import { availabilityOf } from './readAvailability'

const on = (over: Partial<AssistantStatus> = {}): AssistantStatus => ({ available: true, model: { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5' }, photos: true, ...over })
const off = (reason: NonNullable<AssistantStatus['reason']>): AssistantStatus => ({ available: false, reason, photos: false })

describe('availabilityOf', () => {
  it('while the status is on its way: loading, nothing usable, no message', () => {
    expect(availabilityOf(undefined, { isAdmin: false })).toMatchObject({ loading: true, enabled: false, settingsLink: false, statusFailed: false })
    expect(availabilityOf(undefined, { isAdmin: false }).message).toBeUndefined()
  })
  it('when the status could not be fetched: a message, not usable, no link', () => {
    expect(availabilityOf(undefined, { isAdmin: true, failed: true })).toMatchObject({ loading: false, enabled: false, message: 'Could not check the Recipe Assistant. Try again.', settingsLink: false, statusFailed: true })
  })
  it('available: usable, with the model name and photos', () => {
    expect(availabilityOf(on(), { isAdmin: false })).toMatchObject({ loading: false, enabled: true, photos: true, modelName: 'Claude Haiku 5.5', settingsLink: false })
  })

  describe.each([
    ['off', 'The Recipe Assistant is off. Turn it on in Settings.', 'The Recipe Assistant is off. Ask an Admin to turn it on.'],
    ['no_secret_key', 'The Recipe Assistant needs a secret key on the server first. Settings explains how.', "The Recipe Assistant isn't set up yet. Ask an Admin."],
    ['no_key', 'The Recipe Assistant needs an API key. Add it in Settings.', 'The Recipe Assistant needs an API key. Ask an Admin.'],
    ['key_unreadable', "The saved API key can't be read. Enter it again in Settings.", "The saved API key can't be read. Ask an Admin."],
    ['model_unavailable', 'The chosen model is no longer available. Pick another model in Settings.', 'The chosen model is no longer available. Ask an Admin.'],
  ] as const)('unavailable: %s', (reason, adminText, userText) => {
    it('Admins get the reason and a link to Settings', () => {
      expect(availabilityOf(off(reason), { isAdmin: true })).toMatchObject({ enabled: false, loading: false, message: adminText, settingsLink: true, photos: false })
    })
    it('Users get "Ask an Admin" and no link', () => {
      expect(availabilityOf(off(reason), { isAdmin: false })).toMatchObject({ enabled: false, loading: false, message: userText, settingsLink: false })
    })
  })

  it('photos: false disables only the Photo option, with the reason (and still usable for pages and text)', () => {
    expect(availabilityOf(on({ photos: false }), { isAdmin: false })).toMatchObject({ enabled: true, photos: false, photosMessage: "This model can't read photos." })
    expect(availabilityOf(on({ photos: false }), { isAdmin: true }).photosMessage).toBe("This model can't read photos. Pick another model in Settings.")
  })

  describe('the Household limit (30 reads an hour; Admins have no limit field)', () => {
    it('reads left: usable, no message above 5', () => {
      const a = availabilityOf(on({ limit: { remaining: 6, resetsInSeconds: 1000 } }), { isAdmin: false })
      expect(a.enabled).toBe(true)
      expect(a.limitMessage).toBeUndefined()
      expect(a.limitHint).toBeUndefined()
    })
    it('5 or fewer left: a hint', () => {
      expect(availabilityOf(on({ limit: { remaining: 5, resetsInSeconds: 1000 } }), { isAdmin: false }).limitHint).toBe('5 reads left this hour.')
      expect(availabilityOf(on({ limit: { remaining: 1, resetsInSeconds: 1000 } }), { isAdmin: false }).limitHint).toBe('1 read left this hour.')
    })
    it('none left: not usable, says when to try again', () => {
      const a = availabilityOf(on({ limit: { remaining: 0, resetsInSeconds: 12 * 60 - 20 } }), { isAdmin: false })
      expect(a.limitMessage).toBe('Your Household has read 30 recipes in the last hour. Try again in 12 min.')
      expect(a.enabled).toBe(false)
      expect(a.message).toBe(a.limitMessage)
      expect(a.settingsLink).toBe(false)
    })
    it('Admins (no limit field) are never limited', () => {
      const a = availabilityOf(on(), { isAdmin: true })
      expect(a.limitMessage).toBeUndefined()
      expect(a.limitHint).toBeUndefined()
      expect(a.enabled).toBe(true)
    })
    it('an Admin is never shown the limit even if a limit arrived', () => {
      expect(availabilityOf(on({ limit: { remaining: 0, resetsInSeconds: 60 } }), { isAdmin: true })).toMatchObject({ enabled: true, limitMessage: undefined })
    })
  })
})
