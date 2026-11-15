// B9-34 (SSP-01, SSP-02, SSP-18): what a tick by hand adds and says. Plain TypeScript, no React.
import { formatQuantity, type UnitSystem } from '../../../lib/units'
import { shopStrings } from '../strings'
import type { BaseUnit, LineTick, PackSuggestion, TickAddition } from '../types'
import type { ListEntry } from './lines'

/**
 * The amount one tap ticks with (decision SSP 1 and the later "suggested pack" answer): the server's suggested pack (count × size, the
 * priced fallback included), else what the Line still needs; a ticked Line that grew ("more since your tick") ticks its `more`.
 */
export function defaultTickAmount(line: { quantity: number; more?: number; ticked: boolean; pack: PackSuggestion | null }): number {
  if (line.pack && line.pack.count > 0 && line.pack.size > 0) return line.pack.count * line.pack.size
  if (line.ticked) return line.more ?? 0
  return Math.max(0, line.quantity)
}

export type TickMetaTone = 'success' | 'muted'
/** rotateRight is Phosphor ArrowClockwise, the chapter's glyph for "Added twice" (SSP-18), already in the icon set. */
export type TickMetaIcon = 'stock' | 'notAdded' | 'scan' | 'rotateRight'

/** What a ticked row's one meta line says. `compact` is the shorter form for a narrow text column; '' when there is none. */
export interface TickedMeta {
  text: string
  compact: string
  tone: TickMetaTone
  icon: TickMetaIcon
}

function totalAdded(tick: LineTick): number {
  if (typeof tick.added === 'number') return tick.added
  return tick.additions.reduce((n, a) => n + (a.quantity ?? 0), 0)
}

export function tickedMeta(tick: LineTick | null | undefined, baseUnit: BaseUnit, system: UnitSystem): TickedMeta | null {
  if (!tick) return null
  const q = (n: number) => formatQuantity(n, baseUnit, system)
  const total = totalAdded(tick)
  if (tick.additions.length >= 2) {
    const who = tick.additions.map((a) => {
      const name = a.mine ? shopStrings.tickYou : a.who
      return a.quantity ? `${name} ${q(a.quantity)}` : name
    })
    const times = shopStrings.addedTimes(tick.additions.length)
    return {
      text: `${times} · ${who.join(', ')}`,
      compact: `${times} · ${q(total)}`,
      tone: total > 0 ? 'success' : 'muted',
      icon: 'rotateRight',
    }
  }
  if (tick.by === 'scan') {
    return { text: total > 0 ? shopStrings.scannedAmount(q(total)) : shopStrings.scanned, compact: '', tone: 'muted', icon: 'scan' }
  }
  if (total > 0) return { text: shopStrings.inStock(q(total)), compact: '', tone: 'success', icon: 'stock' }
  return { text: shopStrings.notAdded, compact: shopStrings.notAddedCompact, tone: 'muted', icon: 'notAdded' }
}

/** What the Change sheet offers besides Other amount. */
export interface TickChoices {
  pack: { label: string; amount: number } | null
  need: { amount: number } | null
}

export function tickChoices(entry: ListEntry, system: UnitSystem): TickChoices {
  const unit = entry.baseUnit
  const pc = entry.packChoice
  const pack =
    pc && unit && pc.count > 0 && pc.size > 0
      ? { label: `${pc.count} × ${pc.name} · ${formatQuantity(pc.count * pc.size, unit, system)}`, amount: pc.count * pc.size }
      : null
  const needAmount = entry.need ?? 0
  return { pack, need: unit && needAmount > 0 ? { amount: needAmount } : null }
}

/** The viewer's own hand addition that Change acts on (the latest), with the entry it belongs to; null when there is none. */
export interface ChangeTarget {
  entry: ListEntry
  /** Base Units the tick added; 0 when none */
  added: number
  /** ISO instant */
  tickedAt: string
  clientUuid: string | null
}

export function changeTargetOf(entry: ListEntry): ChangeTarget | null {
  const mine = (entry.tick?.additions ?? []).filter((a) => a.mine && a.by === 'hand')
  const last = mine[mine.length - 1]
  if (!last) return null
  return { entry, added: last.quantity ?? 0, tickedAt: last.tickedAt, clientUuid: last.clientUuid }
}

/** "10:12": an instant's clock time in a zone, 24 hours. '' for an unreadable instant. */
export function clockTime(iso: string, timeZone: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at)
  const part = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? ''
  return `${part('hour')}:${part('minute')}`
}

/**
 * The text of an addition's detail line: "Ticked at 10:12" (hand) or "Scanned at 10:12" (scan), in the Household zone. No Storage
 * Place: the list does not send where the Lot is, and it may have been put away since (main-session ruling). '' while the zone is
 * unknown (never the device's zone).
 */
export function additionDetail(addition: TickAddition, timeZone: string | null | undefined): string {
  if (!timeZone) return ''
  const time = clockTime(addition.tickedAt, timeZone)
  if (!time) return ''
  return addition.by === 'scan' ? shopStrings.scannedAt(time) : shopStrings.tickedAt(time)
}

export type TickPlan =
  | { kind: 'line'; request: { ingredientId: number; to: string; quantity: number; shopId: number | null; clientUuid: string } }
  | { kind: 'extra'; request: { extraId: number; quantity: number; shopId: number | null; clientUuid: string } }

/** The pure "what to send" step of a tick (B9-54 routes the same plan through the offline queue). Null when the entry cannot be ticked. */
export function planTick(entry: ListEntry, ctx: { to: string; shopId: number | null; clientUuid: string }): TickPlan | null {
  const quantity = entry.defaultAmount ?? entry.quantity
  if (entry.kind === 'extra') {
    if (entry.extraId === null) return null
    return { kind: 'extra', request: { extraId: entry.extraId, quantity, shopId: ctx.shopId, clientUuid: ctx.clientUuid } }
  }
  if (entry.ingredientId === null) return null
  return { kind: 'line', request: { ingredientId: entry.ingredientId, to: ctx.to, quantity, shopId: ctx.shopId, clientUuid: ctx.clientUuid } }
}
