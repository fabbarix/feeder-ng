// SAFE-01 (B9-18): the DraftNotice words for each draft decision, shared by every editor with a reload draft. Pure; no React.
// Times are shown in the household time zone.
import type { DraftDecision } from './draftDecision'

export type DraftActionKind = 'discard' | 'restore' | 'continue'

export interface DraftNoticeCopy {
  title: string
  meta: string
  actions: DraftActionKind[]
}

export interface DraftCopyOptions {
  /** "Recipe". */
  noun: string
  /** The record's name, for a new-record draft. */
  name?: string
  device: 'phone' | 'computer'
  /** IANA; the household's. */
  timeZone: string
  /** Who saved the record since the draft began, when known. */
  changedBy?: string
  /** The draft had a photo, which is not kept. */
  photoLost?: boolean
  /** Default 'en-GB'. */
  locale?: string
}

const PHOTO_LOST = ' The photo you added was not kept; add it again.'

/** "Sat 14 Nov" and "15:02" in the given zone. */
function parts(at: number, timeZone: string, locale: string): { day: string; time: string } {
  const get = (opts: Intl.DateTimeFormatOptions) => {
    const p = new Intl.DateTimeFormat(locale, { timeZone, ...opts }).formatToParts(at)
    return (type: Intl.DateTimeFormatPartTypes) => p.find((x) => x.type === type)?.value ?? ''
  }
  const d = get({ weekday: 'short', day: 'numeric', month: 'short' })
  const t = get({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return { day: `${d('weekday')} ${d('day')} ${d('month')}`, time: `${t('hour')}:${t('minute')}` }
}

export function draftActionLabel(kind: DraftActionKind, decision: DraftDecision['kind']): string {
  if (kind === 'restore') return 'Restore my changes'
  if (kind === 'continue') return 'Continue'
  if (decision === 'ask') return 'Discard them'
  if (decision === 'offer') return 'Discard'
  return 'Discard changes'
}

export function draftNotice(decision: DraftDecision, opts: DraftCopyOptions): DraftNoticeCopy | null {
  const locale = opts.locale ?? 'en-GB'
  const where = `on this ${opts.device}`
  const photo = opts.photoLost ? PHOTO_LOST : ''
  switch (decision.kind) {
    case 'restore': {
      const s = parts(decision.savedAt, opts.timeZone, locale)
      return {
        title: 'Your unsaved changes are back',
        meta: `The page closed before you saved, on ${s.day} at ${s.time}. Feeder kept them ${where}.${photo}`,
        actions: ['discard'],
      }
    }
    case 'ask': {
      const s = parts(decision.savedAt, opts.timeZone, locale)
      const c = parts(Date.parse(decision.changedAt), opts.timeZone, locale)
      const who = opts.changedBy ?? 'Someone'
      const theirs = opts.changedBy ? `${opts.changedBy}'s changes` : 'the saved version'
      return {
        title: `You have unsaved changes from ${s.day}, ${s.time}`,
        meta: `${who} saved this ${opts.noun} since then (${c.day}, ${c.time}). Restoring puts your version in the editor; it replaces ${theirs} only when you save.${photo}`,
        actions: ['restore', 'discard'],
      }
    }
    case 'offer': {
      const s = parts(decision.savedAt, opts.timeZone, locale)
      return {
        title: opts.name ? `New ${opts.noun} draft: ${opts.name}` : `New ${opts.noun} draft`,
        meta: `Feeder kept it ${where}, from ${s.day} at ${s.time}.${photo}`,
        actions: ['continue', 'discard'],
      }
    }
    default:
      return null
  }
}
