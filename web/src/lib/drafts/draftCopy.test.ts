// B9-18 (SAFE-01 copy): lib/drafts/draftCopy.ts, pure: the DraftNotice words for each decision, shared by every editor with a reload draft.
//
//   draftNotice(decision, opts) -> { title: string; meta: string; actions: DraftActionKind[] } | null
//   opts = { noun: string ("Recipe"), name?: string, device: 'phone' | 'computer', timeZone: string (IANA, the household's), changedBy?: string,
//            photoLost?: boolean, locale?: string (default 'en-GB') }
//   decision 'restore' -> title "Your unsaved changes are back", meta "The page closed before you saved, on Sat 14 Nov at 15:02. Feeder kept them on this phone."
//                         actions ['discard']             -> label "Discard changes"
//   decision 'ask'     -> title "You have unsaved changes from Sat 14 Nov, 15:02",
//                         meta "Anna saved this Recipe since then (Sat 14 Nov, 16:10). Restoring puts your version in the editor; it replaces Anna's changes only when you save."
//                         actions ['restore', 'discard']   -> labels "Restore my changes", "Discard them"
//   decision 'offer'   -> title "New Recipe draft: Lasagne" (no name: "New Recipe draft"), meta "Feeder kept it on this phone, from Sat 14 Nov at 15:02."
//                         actions ['continue', 'discard']  -> labels "Continue", "Discard"
//   photoLost appends " The photo you added was not kept; add it again." to the meta; 'none' and 'orphaned' have no notice (null)
import { describe, expect, it } from 'vitest'
import { draftActionLabel, draftNotice } from './draftCopy'

const savedAt = Date.parse('2026-11-14T15:02:00Z')
const opts = { noun: 'Recipe', device: 'phone' as const, timeZone: 'UTC' }

describe('draftNotice', () => {
  it('restore: the closed-page sentence, on this phone', () => {
    expect(draftNotice({ kind: 'restore', savedAt }, opts)).toEqual({
      title: 'Your unsaved changes are back',
      meta: 'The page closed before you saved, on Sat 14 Nov at 15:02. Feeder kept them on this phone.',
      actions: ['discard'],
    })
  })

  it('on a computer it says "on this computer"', () => {
    expect(draftNotice({ kind: 'restore', savedAt }, { ...opts, device: 'computer' })!.meta).toMatch(/Feeder kept them on this computer\.$/)
  })

  it('the time is in the household time zone, not the browser\'s', () => {
    expect(draftNotice({ kind: 'restore', savedAt }, { ...opts, timeZone: 'Europe/London' })!.meta).toContain('on Sat 14 Nov at 15:02')
    expect(draftNotice({ kind: 'restore', savedAt }, { ...opts, timeZone: 'Asia/Tokyo' })!.meta).toContain('on Sun 15 Nov at 00:02')
  })

  it('ask: names who saved it and when, and what restoring does', () => {
    expect(draftNotice({ kind: 'ask', savedAt, changedAt: '2026-11-14T16:10:00Z' }, { ...opts, changedBy: 'Anna' })).toEqual({
      title: 'You have unsaved changes from Sat 14 Nov, 15:02',
      meta: "Anna saved this Recipe since then (Sat 14 Nov, 16:10). Restoring puts your version in the editor; it replaces Anna's changes only when you save.",
      actions: ['restore', 'discard'],
    })
  })

  it('ask without a known author does not invent one', () => {
    const n = draftNotice({ kind: 'ask', savedAt, changedAt: '2026-11-14T16:10:00Z' }, opts)!
    expect(n.meta).toMatch(/^Someone saved this Recipe since then \(Sat 14 Nov, 16:10\)\./)
    expect(n.meta).toContain('it replaces the saved version only when you save.')
  })

  it('offer: a new Recipe draft with its name', () => {
    expect(draftNotice({ kind: 'offer', savedAt }, { ...opts, name: 'Lasagne' })).toEqual({
      title: 'New Recipe draft: Lasagne',
      meta: 'Feeder kept it on this phone, from Sat 14 Nov at 15:02.',
      actions: ['continue', 'discard'],
    })
    expect(draftNotice({ kind: 'offer', savedAt }, opts)!.title).toBe('New Recipe draft')
  })

  it('photoLost appends the photo sentence', () => {
    expect(draftNotice({ kind: 'restore', savedAt }, { ...opts, photoLost: true })!.meta).toMatch(/ The photo you added was not kept; add it again\.$/)
  })

  it('none and orphaned have no notice', () => {
    expect(draftNotice({ kind: 'none' }, opts)).toBeNull()
    expect(draftNotice({ kind: 'none', expired: true }, opts)).toBeNull()
    expect(draftNotice({ kind: 'orphaned', savedAt }, opts)).toBeNull()
  })

  it('the button labels', () => {
    expect(draftActionLabel('discard', 'restore')).toBe('Discard changes')
    expect(draftActionLabel('discard', 'ask')).toBe('Discard them')
    expect(draftActionLabel('discard', 'offer')).toBe('Discard')
    expect(draftActionLabel('restore', 'ask')).toBe('Restore my changes')
    expect(draftActionLabel('continue', 'offer')).toBe('Continue')
  })
})
