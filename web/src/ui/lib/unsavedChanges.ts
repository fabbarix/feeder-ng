// B9-31 (SAFE-01 "Connect the update prompt"): the app-wide flag "a form has unsaved changes". A tiny external store
// (useSyncExternalStore), so an editor and the shell, which are not in one subtree, share it without a provider. Each mounted,
// dirty reporter is one holder; the flag is on while any holder exists. AppUpdate reads it to hold the "new version" prompt.
import { useEffect, useSyncExternalStore } from 'react'

const holders = new Set<object>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}
const snapshot = () => holders.size > 0

/** An editor calls it every render with its dirty state. Mounted and dirty, it holds the flag; clean or unmounted, it lets go. */
export function useReportUnsavedChanges(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return
    const holder = {}
    holders.add(holder)
    emit()
    return () => {
      if (holders.delete(holder)) emit()
    }
  }, [dirty])
}

/** True while any form reports unsaved changes. */
export function useHasUnsavedChanges(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** Forgets every holder (tests). */
export function resetUnsavedChanges(): void {
  if (holders.size === 0) return
  holders.clear()
  emit()
}
