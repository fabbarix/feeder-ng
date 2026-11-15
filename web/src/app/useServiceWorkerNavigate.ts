// B9-49 (TB-14): a notification click the service worker hands to this window ({ type: 'navigate', url }) moves the router: no reload,
// nothing lost. Only a same-origin app path is followed, and a chromeless window (Cook Mode, the board, a receipt) is never navigated
// away, whatever it is told. React hook; called once from AppRoot.
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { isChromeless } from './chromeless'

/** The app path a message names, or null: an object { type: 'navigate', url } whose url is a path on this origin ("/plan?x"). */
export function navigateTarget(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null
  const { type, url } = data as { type?: unknown; url?: unknown }
  if (type !== 'navigate' || typeof url !== 'string') return null
  if (!url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) return null
  return url
}

export function useServiceWorkerNavigate(): void {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const here = useRef(pathname)
  here.current = pathname
  useEffect(() => {
    const sw = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker
    if (!sw) return
    const onMessage = (event: MessageEvent) => {
      const url = navigateTarget(event.data)
      if (!url || isChromeless(here.current)) return
      void navigate(url)
    }
    sw.addEventListener('message', onMessage)
    return () => sw.removeEventListener('message', onMessage)
  }, [navigate])
}
