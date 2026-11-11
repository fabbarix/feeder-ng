import { Navigate, useLocation } from 'react-router-dom'

/** `/stock` is the old address of Pantry (PN): forward to `/pantry` with the query and hash, replacing the history entry. */
export function StockRedirect() {
  const { search, hash } = useLocation()
  return <Navigate to={{ pathname: '/pantry', search, hash }} replace />
}
