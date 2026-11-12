import { createElement } from 'react'
import { Navigate, type RouteObject } from 'react-router-dom'

// A signed-in visit to a signed-out page goes home.
export const routes: RouteObject[] = [
  { path: '/sign-in', element: createElement(Navigate, { to: '/', replace: true }) },
  { path: '/email-not-verified', element: createElement(Navigate, { to: '/', replace: true }) },
  { path: '/not-invited', element: createElement(Navigate, { to: '/email-not-verified', replace: true }) },
  { path: '/waiting-for-approval', element: createElement(Navigate, { to: '/', replace: true }) },
]
