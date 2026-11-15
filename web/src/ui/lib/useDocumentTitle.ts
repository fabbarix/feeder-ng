// B9-19 (A11Y-01): the document title names the page, then its context, then the app: "Pasta al pomodoro · Recipes · Feeder".
import { useEffect } from 'react'

const APP_NAME = 'Feeder'
const SEPARATOR = ' · '

/** Joins the defined, non-blank parts and the app name with " · ". */
export function documentTitle(parts: (string | undefined)[]): string {
  const kept = parts.map((p) => p?.trim()).filter((p): p is string => !!p)
  return [...kept, APP_NAME].join(SEPARATOR)
}

/** Sets document.title from `parts` whenever the joined title changes. It does not restore on unmount: the next page sets its own. */
export function useDocumentTitle(parts: (string | undefined)[]): void {
  const title = documentTitle(parts)
  useEffect(() => {
    document.title = title
  }, [title])
}
