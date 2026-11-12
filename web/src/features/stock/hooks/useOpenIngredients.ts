// Which By Ingredient rows of the Pantry are open. The device remembers them for the session only (sessionStorage; a
// per-viewer convenience, so a missing or throwing storage just means every row starts closed).
import { useState } from 'react'

/** Where the open Ingredient ids are kept for the session (a JSON array of numbers). */
export const OPEN_INGREDIENTS_KEY = 'feeder:pantry-open'

export interface OpenIngredients {
  isOpen: (ingredientId: number) => boolean
  toggle: (ingredientId: number) => void
}

function readOpen(): number[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(OPEN_INGREDIENTS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === 'number') : []
  } catch {
    return []
  }
}

function writeOpen(ids: number[]): void {
  try {
    sessionStorage.setItem(OPEN_INGREDIENTS_KEY, JSON.stringify(ids))
  } catch {
    // blocked storage: the rows stay as they are for this visit only
  }
}

export function useOpenIngredients(): OpenIngredients {
  const [open, setOpen] = useState<number[]>(readOpen)
  return {
    isOpen: (ingredientId) => open.includes(ingredientId),
    toggle: (ingredientId) => {
      const next = open.includes(ingredientId) ? open.filter((id) => id !== ingredientId) : [...open, ingredientId]
      setOpen(next)
      writeOpen(next)
    },
  }
}
