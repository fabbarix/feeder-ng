import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { leaveTarget } from '../lib/leave'

/** B9-47 (TB-04): Esc leaves the board as Close does: back one entry when the app opened it, else to Today. */
export function useLeaveOnEscape(): void {
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      // Back only when the app has history to go back to (the session's first entry has the key "default"): SAFE-06.
      if (leaveTarget(location.key) === -1) navigate(-1)
      else navigate('/')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [location.key, navigate])
}
