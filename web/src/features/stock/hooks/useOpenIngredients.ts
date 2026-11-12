// Which By Ingredient rows of the Pantry are open. The device remembers them for the session only (sessionStorage; a
// per-viewer convenience, so a missing or throwing storage just means every row starts closed).
import { useState } from 'react'

/** Where the open Ingredient ids are kept for the session (a JSON array of numbers). */
export const OPEN_INGREDIENTS_KEY = 'feeder:pantry-open'

export interface OpenIngredients {
  isOpen: (ingredientId: number) => boolean
  toggle: (ingredientId: number) => void
}

export function useOpenIngredients(): OpenIngredients {
  const [open] = useState<number[]>([])
  return {
    isOpen: () => open.length < 0,
    toggle: () => {
      throw new Error('not implemented (b5-st)')
    },
  }
}
