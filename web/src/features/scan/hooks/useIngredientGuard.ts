// The near-duplicate guard of a new Ingredient or Supply in the new-Product sheet (SR5): the matcher of Import Review asks whether the
// name already exists. A failed lookup only advises and never blocks; an answer for a name the User has since replaced is dropped.
import { useEffect, useRef, useState } from 'react'
import { duplicateGuard, type DuplicateGuard } from '../../ingredients/lib/newIngredient'
import type { SearchResult } from '../../ingredients/types'

export function useIngredientGuard(findSimilar?: (name: string) => Promise<SearchResult>) {
  const [guard, setGuard] = useState<DuplicateGuard>({ kind: 'clear' })
  const lookup = useRef(0)

  useEffect(() => () => void (lookup.current += 1), [])

  /** Forgets the current answer and drops any lookup still on its way. */
  const reset = () => {
    lookup.current += 1
    setGuard({ kind: 'clear' })
  }

  /** A new name was created: ask the matcher, if there is one. */
  const check = async (name: string) => {
    if (!findSimilar) return
    const mine = ++lookup.current
    let found: DuplicateGuard = { kind: 'clear' }
    try {
      found = duplicateGuard(await findSimilar(name))
    } catch {
      // The lookup only advises.
    }
    if (mine === lookup.current) setGuard(found)
  }

  return { guard, reset, check }
}
