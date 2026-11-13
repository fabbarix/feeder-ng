// H5: changing an Ingredient's kind from its page (ADR 0017): asking first for food -> Supply, and the refusal in words.
import { useState } from 'react'
import { errorMessage } from '../lib/errorMessage'
import { kindInUseFrom } from '../lib/kind'
import type { IngredientKind } from '../types'

export interface KindRefusal {
  /** The kind the change was going to become. */
  kind: IngredientKind
  /** The 409 kind_in_use reason codes (kindInUseReasons turns them into words). */
  reasons: string[]
}

export interface UseKindChange {
  /** The kind being asked for while the confirm is open (only food -> Supply asks), else null. */
  pending: IngredientKind | null
  refusal: KindRefusal | null
  /** A failed change that was not a refusal, in words, or null. */
  failure: string | null
  /** Changes at once to food; asks first for a Supply. */
  request: (target: IngredientKind) => void
  /** The confirm's button: makes the pending change. */
  confirm: () => Promise<void>
  cancel: () => void
  dismissRefusal: () => void
}

/**
 * `setKind` is the PATCH; `onChanged` runs once the kind has changed (the page follows it to its new route).
 * A refusal (409 kind_in_use) stays on the page and keeps its reasons.
 */
export function useKindChange(setKind: (kind: IngredientKind) => Promise<unknown>, onChanged: (kind: IngredientKind) => void): UseKindChange {
  const [pending, setPending] = useState<IngredientKind | null>(null)
  const [refusal, setRefusal] = useState<KindRefusal | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const apply = async (target: IngredientKind) => {
    setPending(null)
    setFailure(null)
    try {
      await setKind(target)
    } catch (e) {
      const reasons = kindInUseFrom(e)
      if (reasons !== null) setRefusal({ kind: target, reasons })
      else setFailure(errorMessage(e))
      return
    }
    onChanged(target)
  }

  return {
    pending,
    refusal,
    failure,
    request: (target) => {
      if (target === 'supply') setPending('supply')
      else void apply(target)
    },
    confirm: () => (pending === null ? Promise.resolve() : apply(pending)),
    cancel: () => setPending(null),
    dismissRefusal: () => setRefusal(null),
  }
}
