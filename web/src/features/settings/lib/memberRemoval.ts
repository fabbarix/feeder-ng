// B9-36 (SAFE-02): what removing a Member says and does. Plain TypeScript (lib/memberRemoval.test.ts).
import type { ConfirmOptions, ConfirmRow } from '../../../ui'
import { settingsMembersStrings } from '../strings/members'

const s = settingsMembersStrings.member.removal

/** `GET /api/members/{id}/impact`: counts and the sign-in that ends (null when no sign-in ends). */
export interface MemberImpact {
  preferences: number
  mealSlots: number
  signIn: { email: string } | null
}

/** The danger confirm: one lead line, then what goes as R-E rows (a row with nothing in it is left out), then one muted note. */
export function removeMemberDialog(name: string, impact: MemberImpact): ConfirmOptions {
  const rows: ConfirmRow[] = []
  if (impact.preferences > 0) rows.push({ key: s.preferences, state: String(impact.preferences), detail: s.preferencesDetail })
  if (impact.mealSlots > 0) rows.push({ key: s.attendance, state: s.mealSlots(impact.mealSlots), detail: s.attendanceDetail(name) })
  if (impact.signIn) rows.push({ key: s.signIn, state: s.signInEnds, detail: s.signInDetail(impact.signIn.email) })
  return {
    tone: 'danger',
    title: s.title(name),
    body: s.lead(name),
    confirmLabel: s.confirm(name),
    groups: rows.length > 0 ? [{ label: s.group(name), rows }] : [],
    note: s.note,
  }
}

export interface MemberRemovedToast {
  headline: string
  undoAriaLabel: string
  restored: string
}

export function memberRemovedToast(name: string): MemberRemovedToast {
  return { headline: s.removed(name), undoAriaLabel: s.undoAria(name), restored: s.restored(name) }
}
