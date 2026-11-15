// B9-59 (RES-04): what a route shows while its code loads (the Suspense fallback of app/lazyScreen.tsx). Inside the shell it
// is the page's own loading state: its header (title, trail) and the skeleton the screen shows while its data loads, so the
// shell never jumps and the document title names the page at once. A chromeless route gets a minimal frame of its own.
// It renders only; app/routeLoading.ts decides what.
import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { PageHeader } from '../ui/PageHeader'
import { parentCrumb } from '../ui/lib/pageTitle'
import { documentTitle } from '../ui/lib/useDocumentTitle'
import { Skeleton, SkeletonBlock, SkeletonGroup, SkeletonList } from '../ui/Skeleton'
import { PlanSkeleton } from '../features/plan/components/PlanSkeleton'
import { RecipeDetailSkeleton } from '../features/recipes/components/RecipeDetailSkeleton'
import { RecipesSkeleton } from '../features/recipes/components/RecipesSkeleton'
import { routeLoadingFor, type LoadingBody } from './routeLoading'
import { shellStrings } from './strings'
import { markRouteLoading } from './useRouteFocus'
import './RouteLoading.css'

function Body({ body }: { body: LoadingBody }) {
  const label = shellStrings.loading
  switch (body) {
    case 'plan':
      return <PlanSkeleton label={label} />
    case 'recipes':
      return <RecipesSkeleton label={label} />
    case 'recipe':
      return <RecipeDetailSkeleton label={label} />
    case 'tiles':
      return <Skeleton variant="tile" count={2} label={label} />
    case 'list':
      return (
        <SkeletonGroup label={label}>
          <SkeletonList rows={6} />
        </SkeletonGroup>
      )
  }
}

export function RouteLoading() {
  const { pathname } = useLocation()
  const view = routeLoadingFor(pathname)
  const title = view.frame === 'shell' && view.title ? documentTitle([view.title, parentCrumb(view.crumbs)]) : null
  // The document title names the page from the first frame, as the page's PageHeader will. A layout effect: React does not
  // run a Suspense fallback's passive effects while the boundary waits, so PageHeader's own effect would come only later.
  useLayoutEffect(() => {
    if (title) document.title = title
  }, [title])
  // B9-49 (A11Y-01): route focus waits for the screen's own h1, not this loading header.
  useLayoutEffect(() => markRouteLoading(), [])
  if (view.frame === 'chromeless') {
    return (
      <SkeletonGroup label={shellStrings.loading} className="route-loading--chromeless">
        <SkeletonBlock variant="title" />
        <SkeletonBlock variant="line" />
        <SkeletonBlock variant="line" />
        <SkeletonBlock variant="card" />
      </SkeletonGroup>
    )
  }
  return (
    <>
      {view.title ? <PageHeader title={view.title} subtitle={view.subtitle} breadcrumbs={view.crumbs.length > 0 ? view.crumbs : undefined} /> : null}
      <Body body={view.body} />
    </>
  )
}
