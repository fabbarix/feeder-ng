// B9-49 (TB-14): the landing parameters a notification puts on "/" (internal/notify): `?step=<scope>:<step>` (Advance Step due) and
// `?leftover=<id>` (Leftover Use-by). Plain TypeScript; an unusable value is ignored.

export interface StepLanding {
  /** The Advance Step's scope: everything before the last colon ("meal:2026-11-09/3/5", "recipe:4"). */
  scope: string
  /** The Step's index in its Recipe. */
  index: number
}

export interface Landing {
  step?: StepLanding
  leftover?: number
}

export const LANDING_PARAMS = ['step', 'leftover'] as const

/** What the notices say when the landing's target is no longer waiting. Kept here until Today's strings take them (B9-44). */
export const landingNotices = {
  stepDone: 'That Advance Step is already done.',
  leftoverAnswered: 'That Leftover is already answered.',
}

const WHOLE = /^\d+$/

function parseStep(value: string | null): StepLanding | undefined {
  if (!value) return undefined
  const at = value.lastIndexOf(':')
  if (at <= 0) return undefined
  const scope = value.slice(0, at)
  const index = value.slice(at + 1)
  if (!WHOLE.test(index)) return undefined
  return { scope, index: Number(index) }
}

function parseLeftover(value: string | null): number | undefined {
  if (!value || !WHOLE.test(value)) return undefined
  const id = Number(value)
  return id > 0 ? id : undefined
}

export function parseLanding(search: string | URLSearchParams): Landing {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search
  const out: Landing = {}
  const step = parseStep(params.get('step'))
  if (step) out.step = step
  const leftover = parseLeftover(params.get('leftover'))
  if (leftover !== undefined) out.leftover = leftover
  return out
}

/** True when the location carries a landing parameter at all (usable or not: either way it is cleared). */
export function hasLanding(params: URLSearchParams): boolean {
  return LANDING_PARAMS.some((name) => params.has(name))
}

/** The parameters without the landing ones, every other one kept in order. */
export function withoutLanding(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams()
  for (const [key, value] of params) if (!(LANDING_PARAMS as readonly string[]).includes(key)) next.append(key, value)
  return next
}
