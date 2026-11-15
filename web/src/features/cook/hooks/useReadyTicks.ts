// B9-45 (PC-05): the ticks of the Get ready list. Local to this device (localStorage `feeder.cook.ready.<scope>`, a JSON array of row
// keys) and shared by every mount of the same scope (the tile, the sheet and the rail list). Ticking never touches Stock.
import { useCallback, useMemo, useSyncExternalStore } from 'react'

export interface ReadyTicks {
  ticked: ReadonlySet<string>
  toggle: (key: string) => void
  /** Forgets every tick of the scope (after Cooked). */
  clear: () => void
}

const PREFIX = 'feeder.cook.ready.'
/** The ticks of each scope as this tab holds them (storage may be blocked: then they live here only). */
const memory = new Map<string, string[]>()
/** Scopes whose last write could not be stored: their ticks live in `memory` only, so a new mount must not read storage over them. */
const unstored = new Set<string>()
const listeners = new Set<() => void>()
const EMPTY: string[] = []

function read(scope: string): string[] {
  const held = memory.get(scope)
  if (held) return held
  let keys: string[] = EMPTY
  try {
    const raw = localStorage.getItem(PREFIX + scope)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed) && parsed.every((k) => typeof k === 'string')) keys = parsed
  } catch {
    keys = EMPTY
  }
  memory.set(scope, keys)
  return keys
}

function write(scope: string, keys: string[]) {
  memory.set(scope, keys)
  try {
    if (keys.length === 0) localStorage.removeItem(PREFIX + scope)
    else localStorage.setItem(PREFIX + scope, JSON.stringify(keys))
    unstored.delete(scope)
  } catch {
    unstored.add(scope)
    // storage blocked or full: the ticks stay in memory for this tab
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useReadyTicks(scope: string): ReadyTicks {
  // A fresh mount reads storage again (another tab or an earlier visit may have changed it), unless storage refused the last write.
  useMemo(() => {
    if (!unstored.has(scope)) memory.delete(scope)
  }, [scope])
  const keys = useSyncExternalStore(subscribe, () => read(scope))
  const ticked = useMemo(() => new Set(keys), [keys])
  const toggle = useCallback(
    (key: string) => {
      const now = read(scope)
      write(scope, now.includes(key) ? now.filter((k) => k !== key) : [...now, key])
    },
    [scope],
  )
  const clear = useCallback(() => write(scope, []), [scope])
  return { ticked, toggle, clear }
}
