// DS-12 R-A (no tertiary action): the surfaces whose actions must look like buttons. Tile, Toast, the BottomSheet footer,
// Dialog, OfflineBanner and notices provide it; a `link` Button inside one logs console.error (a link is for running text only).
import { createContext, createElement, useContext, type ReactNode } from 'react'

export const ActionSurfaceContext = createContext(false)

/** Marks its subtree as an action surface. */
export function ActionSurface({ children }: { children?: ReactNode }) {
  return createElement(ActionSurfaceContext.Provider, { value: true }, children)
}

/** True inside an ActionSurface. */
export function useActionSurface(): boolean {
  return useContext(ActionSurfaceContext)
}
