// B9-54 (RES-03): Ticks by hand waiting in the offline queue, as the Shop shows them. Plain TypeScript, no React.
// A waiting Tick is the same Tick an online tap makes (lib/tickAmount planTick), only sent later: the queue keeps it with the Scans, in one
// order (decision RES 1). Until it syncs the phone shows it applied to its list: the Line ticked at once, its addition with `syncedAt: null`.
import type { Op } from '../../scan/types'
import type { LineTick, ShoppingExtra, ShoppingLine, ShoppingList, TickAddition } from '../types'
import type { TickPlan } from './tickAmount'

/** The shop_tick Op for a tick plan (lib/tickAmount planTick): the plan's client id is the Op's, `covers` is the quantity the phone showed. */
export function tickOp(plan: TickPlan, ctx: { covers: number; scannedAt: string; more?: boolean }): Op {
  const r = plan.request
  const op: Op = { clientUuid: r.clientUuid, scannedAt: ctx.scannedAt, kind: 'shop_tick' }
  if (r.shopId !== null) op.shopId = r.shopId
  if (plan.kind === 'line') {
    op.ingredientId = plan.request.ingredientId
    op.rangeTo = plan.request.to
  } else {
    op.extraId = plan.request.extraId
  }
  op.quantity = r.quantity
  op.covers = ctx.covers
  if (ctx.more) op.more = true
  return op
}

/** The shop_untick Op that takes one addition (a synced Tick) off its Line. */
export function untickAdditionOp(ctx: { clientUuid: string; scannedAt: string; tickClientUuid: string }): Op {
  return { clientUuid: ctx.clientUuid, scannedAt: ctx.scannedAt, kind: 'shop_untick', tickClientUuid: ctx.tickClientUuid }
}

/** The shop_untick Op that unticks a whole Line (every hand addition) for the range. */
export function untickLineOp(ctx: { clientUuid: string; scannedAt: string; ingredientId: number; rangeTo: string }): Op {
  return { clientUuid: ctx.clientUuid, scannedAt: ctx.scannedAt, kind: 'shop_untick', ingredientId: ctx.ingredientId, rangeTo: ctx.rangeTo }
}

/** Is this Op a Tick by hand (shop_tick or shop_untick)? The shell counts these apart from Scans. */
export function isTickOp(op: Op): boolean {
  return op.kind === 'shop_tick' || op.kind === 'shop_untick'
}

/** How many queued Ops are Scans and how many are Ticks (a shop_untick counts as a Tick). */
export function countPending(ops: readonly Op[]): { scans: number; ticks: number } {
  const ticks = ops.filter(isTickOp).length
  return { scans: ops.length - ticks, ticks }
}

type Ticked = ShoppingLine | ShoppingExtra

/** The item with exactly these additions: ticked with their sum, or open (no tick) when none is left. */
function withAdditions<T extends Ticked>(item: T, additions: TickAddition[], before: LineTick | null | undefined): T {
  if (additions.length === 0) {
    const { tick: _tick, ...rest } = item
    return { ...rest, ticked: false } as T
  }
  const sum = additions.reduce((n, a) => n + (a.quantity ?? 0), 0)
  const tick: LineTick = { by: before?.by ?? additions[0]!.by, added: sum > 0 ? sum : null, additions }
  return { ...item, ticked: true, tick }
}

function waitingAddition(op: Op, who: string): TickAddition {
  const q = op.quantity ?? 0
  return { who, mine: true, by: 'hand', quantity: q > 0 ? q : null, clientUuid: op.clientUuid, tickedAt: op.scannedAt, syncedAt: null }
}

/** The Line once `op` applies; null when the Op is not about it. */
function applyToLine(line: ShoppingLine, op: Op, to: string, who: string): ShoppingLine | null {
  if (op.kind === 'shop_tick') {
    if (op.extraId !== undefined || op.ingredientId !== line.ingredientId || op.rangeTo !== to) return null
    const out = withAdditions({ ...line, quantity: 0 }, [...(line.tick?.additions ?? []), waitingAddition(op, who)], line.tick)
    if (op.more) delete out.more
    return out
  }
  if (op.kind !== 'shop_untick') return null
  const all = line.tick?.additions ?? []
  let kept: TickAddition[]
  if (op.tickClientUuid !== undefined) {
    if (!all.some((a) => a.clientUuid === op.tickClientUuid)) return null
    kept = all.filter((a) => a.clientUuid !== op.tickClientUuid)
  } else {
    if (op.ingredientId !== line.ingredientId || op.rangeTo !== to || !line.ticked) return null
    kept = all.filter((a) => a.by !== 'hand')
  }
  const out = withAdditions(line, kept, line.tick)
  // open again: what is still to get is the need less what is in Stock (the server says the same on its next answer)
  return out.ticked ? out : { ...out, quantity: Math.max(0, line.need - line.available) }
}

function applyToExtra(extra: ShoppingExtra, op: Op, who: string): ShoppingExtra | null {
  if (op.kind === 'shop_tick') {
    if (op.extraId !== extra.id) return null
    return withAdditions(extra, [...(extra.tick?.additions ?? []), waitingAddition(op, who)], extra.tick)
  }
  if (op.kind !== 'shop_untick' || op.tickClientUuid === undefined) return null
  const all = extra.tick?.additions ?? []
  if (!all.some((a) => a.clientUuid === op.tickClientUuid)) return null
  return withAdditions(extra, all.filter((a) => a.clientUuid !== op.tickClientUuid), extra.tick)
}

/** The list as the phone shows it with the queued Ticks applied, in queue order; never mutates `list`. `complete` stays the server's. */
export function applyPending(list: ShoppingList, ops: readonly Op[], ctx: { who: string }): ShoppingList {
  const ticks = ops.filter(isTickOp)
  if (ticks.length === 0) return list
  let lines = list.lines
  let extras = list.extras
  let delta = 0
  for (const op of ticks) {
    const li = lines.findIndex((line) => applyToLine(line, op, list.to, ctx.who) !== null)
    if (li >= 0) {
      const before = lines[li]!
      const next = applyToLine(before, op, list.to, ctx.who)!
      delta += Number(next.ticked) - Number(before.ticked)
      lines = lines.map((l, i) => (i === li ? next : l))
      continue
    }
    const ei = extras.findIndex((extra) => applyToExtra(extra, op, ctx.who) !== null)
    if (ei >= 0) {
      const before = extras[ei]!
      const next = applyToExtra(before, op, ctx.who)!
      delta += Number(next.ticked) - Number(before.ticked)
      extras = extras.map((e, i) => (i === ei ? next : e))
    }
  }
  if (lines === list.lines && extras === list.extras) return list
  return { ...list, lines, extras, progress: { ...list.progress, ticked: list.progress.ticked + delta } }
}

/** The keys ("line:<ingredientId>", "extra:<id>") of the entries a refused Tick belongs to. */
export function failedKeys(ops: readonly Op[]): Set<string> {
  const keys = new Set<string>()
  for (const op of ops) {
    if (op.kind !== 'shop_tick') continue
    if (op.extraId !== undefined) keys.add(`extra:${op.extraId}`)
    else if (op.ingredientId !== undefined) keys.add(`line:${op.ingredientId}`)
  }
  return keys
}
