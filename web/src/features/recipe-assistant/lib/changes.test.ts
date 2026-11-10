// Change history wording (Admin-only list of the last 20 changes).
import { describe, expect, it } from 'vitest'
import { agoCopy, changeRow } from './changes'

const NOW = new Date('2026-11-10T12:00:00Z')
const row = (action: string, detail = '', at = '2026-11-10T10:00:00Z') => changeRow({ at, actorName: 'Anna', action: action as never, detail }, NOW)

describe('changeRow', () => {
  it('turned on and off', () => {
    expect(row('turned_on')).toEqual({ title: 'Anna turned the Recipe Assistant on', meta: '2 h ago' })
    expect(row('turned_off').title).toBe('Anna turned the Recipe Assistant off')
  })
  it('model changed names the model', () => expect(row('model_changed', 'Claude Sonnet 5.5').title).toBe('Anna changed the model to Claude Sonnet 5.5'))
  it('base URL changed shows the new address (detail is "old -> new")', () =>
    expect(row('base_url_changed', 'https://api.anthropic.com -> https://gw.example.com/x').title).toBe('Anna changed the address to https://gw.example.com/x'))
  it('key events show the last four only, with dots, never more', () => {
    expect(row('key_saved', '1234').title).toBe('Anna saved the API key ••••1234')
    expect(row('key_replaced', '5678').title).toBe('Anna replaced the API key ••••5678')
    expect(row('key_removed', '5678').title).toBe('Anna removed the API key')
  })
  it('an unknown action still renders something readable', () => expect(row('something_new').title).toBe('Anna changed the Recipe Assistant settings'))
})

describe('agoCopy', () => {
  it.each([
    ['2026-11-10T11:59:40Z', 'just now'],
    ['2026-11-10T11:30:00Z', '30 min ago'],
    ['2026-11-10T10:00:00Z', '2 h ago'],
    ['2026-11-09T09:00:00Z', '1 d ago'],
    ['2026-10-01T09:00:00Z', '40 d ago'],
    ['2026-11-10T12:00:30Z', 'just now'],
  ])('%s -> %s', (at, copy) => expect(agoCopy(at, NOW)).toBe(copy))
})
