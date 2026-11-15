// B9-36 (SAFE-02, SAFE 4): Remove Member confirms with what goes (R-E rows, never a paragraph wall), then an Undo toast.
import { describe, expect, it } from 'vitest'
import { memberRemovedToast, removeMemberDialog } from './memberRemoval'

const impact = { preferences: 3, mealSlots: 21, signIn: { email: 'sam@example.com' } }

describe('removeMemberDialog', () => {
  it('is a danger dialog titled "Remove Sam?" with the lead "Sam no longer counts towards portions."', () => {
    const d = removeMemberDialog('Sam', impact)
    expect(d.tone).toBe('danger')
    expect(d.title).toBe('Remove Sam?')
    expect([d.body].flat()[0]).toBe('Sam no longer counts towards portions.')
    expect(d.confirmLabel).toBe('Remove Sam')
    expect(d.cancelLabel ?? 'Cancel').toBe('Cancel')
  })

  it('lists what goes with the Member as three R-E rows: Preferences, Attendance, Sign-in', () => {
    const d = removeMemberDialog('Sam', impact)
    expect(d.groups).toEqual([
      {
        label: 'Goes with Sam',
        rows: [
          { key: 'Preferences', state: '3', detail: 'Favourites, Dislikes and Exclusions' },
          { key: 'Attendance', state: '21 Meal Slots', detail: 'Every Meal Slot Sam eats at' },
          { key: 'Sign-in', state: 'Ends', detail: 'sam@example.com · not on the Allowlist' },
        ],
      },
    ])
  })

  it('draws the Sign-in row only when the sign-in ends', () => {
    const rows = removeMemberDialog('Sam', { ...impact, signIn: null }).groups![0]!.rows
    expect(rows.map((r) => r.key)).toEqual(['Preferences', 'Attendance'])
  })

  it('says "1 Meal Slot" in the singular', () => {
    const rows = removeMemberDialog('Sam', { ...impact, mealSlots: 1 }).groups![0]!.rows
    expect(rows.find((r) => r.key === 'Attendance')!.state).toBe('1 Meal Slot')
  })

  it('leaves out a row with nothing in it (a Member with no preferences and no Meal Slot has no group)', () => {
    const none = removeMemberDialog('Sam', { preferences: 0, mealSlots: 0, signIn: null })
    expect((none.groups ?? []).flatMap((g) => g.rows)).toEqual([])
    const some = removeMemberDialog('Sam', { preferences: 0, mealSlots: 2, signIn: null }).groups![0]!.rows
    expect(some.map((r) => r.key)).toEqual(['Attendance'])
  })

  it('has one muted note: Planned Meals are worked out again and Undo is straight after', () => {
    expect(removeMemberDialog('Sam', impact).note).toBe('Planned Meals from today are worked out again. You can undo it straight after.')
  })

  it('is not a paragraph wall: the body is the one lead sentence', () => {
    const body = removeMemberDialog('Sam', impact).body
    expect([body].flat().filter(Boolean)).toHaveLength(1)
  })

  it('uses the Member name as given, not a template word (Anna)', () => {
    const d = removeMemberDialog('Anna', impact)
    expect(d.title).toBe('Remove Anna?')
    expect(d.groups![0]!.label).toBe('Goes with Anna')
  })
})

describe('memberRemovedToast', () => {
  it('names the removal, its full-name Undo and the restored line', () => {
    expect(memberRemovedToast('Sam')).toEqual({ headline: 'Sam removed', undoAriaLabel: 'Undo: put Sam back', restored: 'Sam is back' })
  })
})
