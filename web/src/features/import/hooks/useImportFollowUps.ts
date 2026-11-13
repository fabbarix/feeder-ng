// BR-E (design §13): the bulk link queue after a Confirm: one sheet per Base recipe the import created or converted, nothing ticked.
// The sheet needs the Base recipe's Ingredient (for a merge), which the Confirm answer does not carry: GET /api/recipes/{id}.baseIngredientId.
import { useQueries } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { importApi } from '../api'
import { bulkLinkTargets, readNextItems, type ReadNextTarget } from '../lib/confirmFollowUps'
import type { ImportResult } from '../types'

export interface FollowUpTarget {
  id: number
  name: string
  ingredientId: number
}

export interface UseImportFollowUps {
  /** The Base recipe whose sheet is open, or null when the queue is done (or still loading). */
  target: FollowUpTarget | null
  /** Sheets still to show, the current one included. */
  remaining: number
  /** The current sheet is done (linked, or closed): the next one opens. */
  next: () => void
  /** The created Base recipes the User asked to read next ("Read Béchamel now"). */
  readNext: ReadNextTarget[]
}

/** The sheets of an import, one at a time, in the answer's order. A Base recipe whose detail cannot be read is skipped. */
export function useImportFollowUps(result: ImportResult | undefined): UseImportFollowUps {
  const targets = useMemo(() => (result ? bulkLinkTargets(result) : []), [result])
  const [done, setDone] = useState<number[]>([])
  const queries = useQueries({
    queries: targets.map((t) => ({ queryKey: ['recipes', t.id, 'import-follow-up'], queryFn: () => importApi.baseIngredientOf(t.id) })),
  })

  const open = targets.map((t, i) => ({ t, q: queries[i]! })).filter(({ t }) => !done.includes(t.id))
  let target: FollowUpTarget | null = null
  let waiting = false
  let remaining = 0
  for (const { t, q } of open) {
    // A Base recipe that cannot be read, or has no Ingredient (null), gets no sheet.
    if (q.isError || q.data === null) continue
    remaining += 1
    // A sheet still loading holds the queue: the ones after it wait rather than open first.
    if (target === null && !waiting) {
      if (q.data === undefined) waiting = true
      else target = { id: t.id, name: t.name, ingredientId: q.data }
    }
  }

  const current = target
  const next = () => {
    if (current) setDone((d) => [...d, current.id])
  }
  return { target, remaining, next, readNext: result ? readNextItems(result) : [] }
}
