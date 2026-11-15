// B9-32: the chips of a Plan row after PC-16 (6), DS-06 (Plan tones) and PC-14 / A2 (start chips). TEST-AUTHOR tests.
import { describe, expect, it } from 'vitest'
import { meal } from '../test-utils'
import { rowChips, type StartContext } from './rowChips'

const ctx = { slotDate: '2026-11-17' } // a Tuesday
const slotAt = '2026-11-17T07:00:00Z'
const before: StartContext = { slotAt, now: Date.parse('2026-11-16T12:00:00Z') }
const labels = (cs: { label: string }[]) => cs.map((c) => c.label)

describe('PC-16 (6): the relaxed chip has its own glyph', () => {
  it('"Again soon" (cooldown_relaxed) is not the Advance Step alarm: it uses the ArrowsClockwise glyph ("refresh", the same icon the plan already has)', () => {
    const [chip] = rowChips(meal({ why: [{ code: 'cooldown_relaxed', date: '2026-11-08' }] }), ctx)
    expect(chip!.icon).not.toBe('advanceStep')
    expect(chip!.icon).toBe('refresh')
  })
  it('no why chip on a row carries the Advance Step glyph', () => {
    const chips = rowChips(
      meal({ why: [{ code: 'cooldown_relaxed', date: '2026-11-08' }, { code: 'variety_relaxed', tag: 'fish', count: 3 } as never, { code: 'favourite', members: ['Mia'] }] }),
      ctx,
    )
    expect(chips.map((c) => c.icon)).not.toContain('advanceStep')
  })
})

describe('DS-06: Plan tones', () => {
  it('Not cooked is a neutral state chip with the XCircle (notCooked) glyph, never danger: a record, not a problem', () => {
    const [chip] = rowChips(meal({ state: 'skipped' }), ctx)
    expect(chip).toMatchObject({ kind: 'state', status: 'neutral', icon: 'notCooked', label: 'Not cooked' })
  })
  it('Cooked stays success and Pinned stays pinned', () => {
    expect(rowChips(meal({ state: 'cooked' }), ctx)[0]).toMatchObject({ kind: 'state', status: 'success' })
    expect(rowChips(meal({ pinned: true }), ctx)[0]).toMatchObject({ kind: 'state', status: 'pinned' })
  })
  it('no chip of a row is spoil or danger', () => {
    const chips = rowChips(meal({ state: 'skipped', why: [{ code: 'cooldown_relaxed', date: '2026-11-08' }] }), ctx)
    for (const c of chips) expect(['spoil', 'danger']).not.toContain(c.status)
  })
})

describe('A2 / PC-14: the start chips', () => {
  it('a planned meal that starts on an earlier day carries an info chip "Start Mon 21:30" (the weekday of startsAt.date)', () => {
    const chips = rowChips(meal({ startsAt: { date: '2026-11-16', time: '21:30' } }), ctx, null, before)
    expect(chips).toEqual([expect.objectContaining({ kind: 'status', status: 'info', label: 'Start Mon 21:30' })])
  })
  it('the weekday is the START day, not the meal day: a start on Tue for a Wednesday meal reads "Start Tue 21:30"', () => {
    const chips = rowChips(meal({ startsAt: { date: '2026-11-17', time: '21:30' } }), { slotDate: '2026-11-18' }, null, { slotAt: '2026-11-18T07:00:00Z', now: Date.parse('2026-11-17T08:00:00Z') })
    expect(labels(chips)).toEqual(['Start Tue 21:30'])
  })
  it('the info chip says it in full to a screen reader (title): "Start cooking on Monday at 21:30"', () => {
    const [chip] = rowChips(meal({ startsAt: { date: '2026-11-16', time: '21:30' } }), ctx, null, before)
    expect(chip!.title).toBe('Start cooking on Monday at 21:30')
  })
  it('it is hidden once the slot time has passed', () => {
    const after = { ...before, now: Date.parse('2026-11-17T07:00:00Z') }
    expect(rowChips(meal({ startsAt: { date: '2026-11-16', time: '21:30' } }), ctx, null, after)).toEqual([])
  })
  it('it is hidden on a slot where everyone is away (nobody cooks; a Pinned meal there keeps its data but shows no start chip)', () => {
    expect(rowChips(meal({ startsAt: { date: '2026-11-16', time: '21:30' } }), ctx, null, { ...before, everyoneAway: true })).toEqual([])
    expect(rowChips(meal({ pinned: true, earlyStart: '02:30' }), ctx, null, { ...before, everyoneAway: true }).map((c) => c.label)).toEqual(['Pinned'])
  })
  it('without a start context no start chip is made (a bare row, Today, a sheet that has no clock)', () => {
    expect(rowChips(meal({ startsAt: { date: '2026-11-16', time: '21:30' } }), ctx)).toEqual([])
  })
  it('a Pinned or Bought meal whose start is outside the cooking times keeps the WARN chip "Start 02:30" (ruling: the warn chip stays)', () => {
    const chips = rowChips(meal({ pinned: true, earlyStart: '02:30' }), ctx, null, before)
    expect(chips.map((c) => c.label)).toEqual(['Pinned', 'Start 02:30'])
    expect(chips[1]).toMatchObject({ kind: 'status', status: 'warn' })
    expect(chips[1]!.title).toBe('Cooking would start outside your cooking times')
  })
  it('a meal that carries both names the day from startsAt in the WARN chip, and shows no second (info) chip', () => {
    const chips = rowChips(meal({ pinned: true, earlyStart: '02:30', startsAt: { date: '2026-11-16', time: '02:30' } }), ctx, null, before)
    expect(chips.map((c) => c.label)).toEqual(['Pinned', 'Start Mon 02:30'])
    expect(chips[1]).toMatchObject({ status: 'warn' })
  })
  it('the start chip comes right after the state chip, before Leftover and why chips (it is the thing to act on)', () => {
    const chips = rowChips(
      meal({ pinned: true, earlyStart: '02:30', servedFromLeftover: { date: '2026-11-15' } as never, why: [{ code: 'favourite', members: ['Mia'] }] }),
      ctx,
      null,
      before,
    )
    expect(labels(chips)).toEqual(['Pinned', 'Start 02:30', 'Leftover from Sun', "Mia's favourite"])
  })
  it('a Cooked or Not cooked meal shows none (the server omits them; the row must not invent them either)', () => {
    expect(labels(rowChips(meal({ state: 'cooked', startsAt: { date: '2026-11-16', time: '21:30' } }), ctx, null, before))).toEqual(['Cooked'])
  })
  it('every chip keeps a stable unique key', () => {
    const chips = rowChips(meal({ pinned: true, earlyStart: '02:30', startsAt: { date: '2026-11-16', time: '02:30' } }), ctx, null, before)
    expect(new Set(chips.map((c) => c.key)).size).toBe(chips.length)
  })
})
