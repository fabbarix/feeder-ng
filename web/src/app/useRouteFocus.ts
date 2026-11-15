// B9-49 (A11Y-01, A11Y-10): where focus goes when the page changes. On an in-app pathname change (a link, the nav, back and forward)
// focus moves to the new page's h1 (#page-title, tabIndex -1), so a screen reader reads the page name; with no h1 within 2 s, to
// <main id="main-content">. A search-param change (a filter, a sort) never moves focus, nor does the first render.
// With lazy routes (B9-59) the route's loading state shows a header of its own: focus waits for the screen itself, not that header.
import { useContext, useEffect, useLayoutEffect, useRef } from 'react'
import { UNSAFE_DataRouterContext, useLocation } from 'react-router-dom'

export const FOCUS_WAIT_MS = 2000
/** How long focus keeps waiting for a screen whose code is still loading after FOCUS_WAIT_MS (Slow 4G). */
const LOADING_WAIT_MS = 10_000

const PAGE_TITLE_ID = 'page-title'
const MAIN_ID = 'main-content'

let loadingShown = 0

/** RouteLoading marks itself while it shows (a layout effect), so focus is not put on the loading state's header. */
export function markRouteLoading(): () => void {
  loadingShown += 1
  return () => {
    loadingShown = Math.max(0, loadingShown - 1)
  }
}

const focusQuietly = (el: HTMLElement) => el.focus({ preventScroll: true })

/** The skip link's target, and the fallback of a route change: the page's h1, else <main>. True when something took focus. */
export function focusPageStart(): boolean {
  const target = document.getElementById(PAGE_TITLE_ID) ?? document.getElementById(MAIN_ID)
  if (!target) return false
  focusQuietly(target)
  return true
}

/** The page's own h1, once no route loading state is showing. */
function readyTitle(): HTMLElement | null {
  if (loadingShown > 0) return null
  return document.getElementById(PAGE_TITLE_ID)
}

export function useRouteFocus(): void {
  const { pathname } = useLocation()
  const first = useRef(true)
  // The 2 s count from the moment the router moved (a data router tells at once; React renders the new page a little later).
  const movedAt = useRef<number | null>(null)
  const router = useContext(UNSAFE_DataRouterContext)?.router
  useEffect(() => {
    if (!router) return
    let shown = router.state.location.pathname
    return router.subscribe((state) => {
      if (state.location.pathname === shown) return
      shown = state.location.pathname
      movedAt.current = Date.now()
    })
  }, [router])

  // A layout effect: the wait starts with the commit that shows the new page, not whenever React gets to passive effects.
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    let done = false
    let observer: MutationObserver | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (el: HTMLElement | null) => {
      if (done) return
      done = true
      observer?.disconnect()
      clearTimeout(timer)
      if (el) focusQuietly(el)
    }
    const check = () => {
      const title = readyTitle()
      if (title) finish(title)
    }
    check()
    if (done) return
    const giveUp = () => finish(document.getElementById(PAGE_TITLE_ID) ?? document.getElementById(MAIN_ID))
    const waited = movedAt.current === null ? 0 : Math.max(0, Date.now() - movedAt.current)
    movedAt.current = null
    const afterWait = () => {
      // The screen's code is still on its way: keep waiting for it a while, rather than leaving focus on <main>.
      if (loadingShown > 0) timer = setTimeout(giveUp, LOADING_WAIT_MS)
      else giveUp()
    }
    if (waited >= FOCUS_WAIT_MS) {
      afterWait()
      if (done) return
    }
    observer = new MutationObserver(check)
    observer.observe(document.body, { childList: true, subtree: true })
    if (!timer) timer = setTimeout(afterWait, FOCUS_WAIT_MS - waited)
    return () => {
      done = true
      observer?.disconnect()
      clearTimeout(timer)
    }
  }, [pathname])
}
