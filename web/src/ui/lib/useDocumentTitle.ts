// B9-19 (A11Y-01): the document title names the page, then its context, then the app: "Pasta al pomodoro · Recipes · Feeder".
import { useEffect } from 'react'

const APP_NAME = 'Feeder'
const SEPARATOR = ' · '

/** Joins the defined, non-blank parts and the app name with " · ". */
export function documentTitle(parts: (string | undefined)[]): string {
  const kept = parts.map((p) => p?.trim()).filter((p): p is string => !!p)
  return [...kept, APP_NAME].join(SEPARATOR)
}

/** The titles of the mounted pages that named themselves, newest last (one in practice). */
const claims: { title: string }[] = []

/**
 * B9-49 (A11Y-01): sets document.title back to the title the mounted page claimed. The shell calls it after a route change, because
 * it sets a provisional section title the moment the router moves, and a page that stays mounted with the same title (two routes
 * served by one PageHeader) has no reason to set its own again. False when no mounted page has claimed a title.
 */
export function reassertDocumentTitle(): boolean {
  const claim = claims[claims.length - 1]
  if (!claim) return false
  document.title = claim.title
  return true
}

/** Sets document.title from `parts` whenever the joined title changes. It does not restore on unmount: the next page sets its own. */
export function useDocumentTitle(parts: (string | undefined)[]): void {
  const title = documentTitle(parts)
  useEffect(() => {
    const claim = { title }
    claims.push(claim)
    document.title = title
    return () => {
      const at = claims.indexOf(claim)
      if (at >= 0) claims.splice(at, 1)
    }
  }, [title])
}
