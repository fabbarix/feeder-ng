export interface ReadyTicks {
  ticked: ReadonlySet<string>
  toggle: (key: string) => void
  /** Forgets every tick of the scope (after Cooked). */
  clear: () => void
}

/** B9-45 (PC-05) STUB. The ticks of a cook scope, kept on this device in localStorage under `feeder.cook.ready.<scope>` (a JSON array of row keys). Never touches Stock. */
export function useReadyTicks(_scope: string): ReadyTicks {
  throw new Error('B9-45: not built yet')
}
