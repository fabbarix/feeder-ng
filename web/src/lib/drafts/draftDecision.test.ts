// B9-18 (SAFE-01 "On the next open of that editor"): lib/drafts/draftDecision.ts, pure: what to do with a stored draft.
//
//   decideDraft({ draft: DraftRecord | null, currentUpdatedAt: string | null, now: number }): DraftDecision
//   DraftRecord = { draft: unknown; baseUpdatedAt: string | null; savedAt: number }   savedAt: epoch ms; baseUpdatedAt: the stored record's
//                 `updatedAt` (ISO) when the draft was begun, null for a record that was never saved (a new Recipe)
//   currentUpdatedAt: the stored record's `updatedAt` now; null when the record is new or gone
//   DraftDecision =
//     { kind: 'none' }                                            no draft
//     { kind: 'none', expired: true }                             older than 7 days: nothing to offer; the caller deletes it
//     { kind: 'restore', savedAt }                                the stored record is unchanged since: restore it with a notice and Discard changes
//     { kind: 'ask', savedAt, changedAt }                         someone saved it since (updatedAt > baseUpdatedAt): nothing is restored until the person chooses
//     { kind: 'offer', savedAt }                                  a draft of a new record (baseUpdatedAt null): offered where the list is ("New Recipe draft")
//     { kind: 'orphaned', savedAt }                               the draft was of a stored record that is gone now (currentUpdatedAt null but baseUpdatedAt set): dropped by the caller
import { describe, expect, it } from 'vitest'
import { DRAFT_MAX_AGE_MS, decideDraft } from './draftDecision'

const NOW = Date.parse('2026-11-14T16:30:00Z')
const rec = (over: Partial<{ baseUpdatedAt: string | null; savedAt: number }> = {}) => ({
  draft: { name: 'Lasagne' },
  baseUpdatedAt: '2026-11-14T10:00:00Z' as string | null,
  savedAt: Date.parse('2026-11-14T15:02:00Z'),
  ...over,
})

describe('decideDraft', () => {
  it('no draft: none', () => {
    expect(decideDraft({ draft: null, currentUpdatedAt: '2026-11-14T10:00:00Z', now: NOW })).toEqual({ kind: 'none' })
  })

  it('the stored record is unchanged since the draft began: restore', () => {
    const r = rec()
    expect(decideDraft({ draft: r, currentUpdatedAt: '2026-11-14T10:00:00Z', now: NOW })).toEqual({ kind: 'restore', savedAt: r.savedAt })
  })

  it('the stored record was saved by someone since: ask, with when it changed', () => {
    const r = rec()
    expect(decideDraft({ draft: r, currentUpdatedAt: '2026-11-14T16:10:00Z', now: NOW })).toEqual({ kind: 'ask', savedAt: r.savedAt, changedAt: '2026-11-14T16:10:00Z' })
  })

  it('compares instants, not strings: the same moment in another offset is unchanged', () => {
    expect(decideDraft({ draft: rec({ baseUpdatedAt: '2026-11-14T10:00:00Z' }), currentUpdatedAt: '2026-11-14T11:00:00+01:00', now: NOW }).kind).toBe('restore')
  })

  it('an older updatedAt than the draft base (clock skew) is not a change', () => {
    expect(decideDraft({ draft: rec(), currentUpdatedAt: '2026-11-14T09:59:00Z', now: NOW }).kind).toBe('restore')
  })

  // B9-18 review: a draft never restores over a record that may have changed without asking.
  it('a stamp that does not parse is never taken as unchanged: ask, unless both are the same text', () => {
    const r = rec()
    expect(decideDraft({ draft: r, currentUpdatedAt: 'garbage', now: NOW })).toEqual({ kind: 'ask', savedAt: r.savedAt, changedAt: 'garbage' })
    expect(decideDraft({ draft: rec({ baseUpdatedAt: '' }), currentUpdatedAt: '2026-11-14T10:00:00Z', now: NOW }).kind).toBe('ask')
    expect(decideDraft({ draft: rec({ baseUpdatedAt: 'v7' }), currentUpdatedAt: 'v7', now: NOW }).kind).toBe('restore')
  })

  it('a draft of a new record is offered, whatever the (absent) stored record says', () => {
    const r = rec({ baseUpdatedAt: null })
    expect(decideDraft({ draft: r, currentUpdatedAt: null, now: NOW })).toEqual({ kind: 'offer', savedAt: r.savedAt })
  })

  it('a draft of a stored record that is gone now is orphaned', () => {
    const r = rec()
    expect(decideDraft({ draft: r, currentUpdatedAt: null, now: NOW })).toEqual({ kind: 'orphaned', savedAt: r.savedAt })
  })

  it('a draft older than 7 days is expired: nothing is offered', () => {
    expect(DRAFT_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000)
    const old = rec({ savedAt: NOW - DRAFT_MAX_AGE_MS - 1 })
    expect(decideDraft({ draft: old, currentUpdatedAt: '2026-11-14T10:00:00Z', now: NOW })).toEqual({ kind: 'none', expired: true })
  })

  it('exactly 7 days old is still offered', () => {
    const edge = rec({ savedAt: NOW - DRAFT_MAX_AGE_MS })
    expect(decideDraft({ draft: edge, currentUpdatedAt: '2026-11-14T10:00:00Z', now: NOW }).kind).toBe('restore')
  })

  it('expiry wins over everything else, a new record included', () => {
    const old = rec({ baseUpdatedAt: null, savedAt: NOW - DRAFT_MAX_AGE_MS - 5 })
    expect(decideDraft({ draft: old, currentUpdatedAt: null, now: NOW })).toEqual({ kind: 'none', expired: true })
  })
})
