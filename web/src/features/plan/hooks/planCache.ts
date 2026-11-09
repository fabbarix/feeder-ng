import type { QueryClient } from '@tanstack/react-query'

const PLAN_VIEWS = [['plan', 'view'], ['plan', 'to-confirm'], ['plan', 'couldnt-plan'], ['plan', 'leftovers']] as const

/** Refetches every plan read after a change (the per-slot previews and alternatives are not refetched). */
export async function invalidatePlan(client: QueryClient): Promise<void> {
  await Promise.all(PLAN_VIEWS.map((queryKey) => client.invalidateQueries({ queryKey })))
}
