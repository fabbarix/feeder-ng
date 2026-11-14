// STUB for the B9-01 tests to compile; the Developer replaces it (DS-12 build notes: a context that Tile, Toast, the
// BottomSheet footer, Dialog, OfflineBanner and notices provide, so a `link` Button inside it logs console.error).
import { createContext, createElement, type ReactNode } from 'react'

export const ActionSurfaceContext = createContext(false)

export function ActionSurface({ children }: { children?: ReactNode }) {
  return createElement(ActionSurfaceContext.Provider, { value: false }, children)
}
