// Mounted once in the app shell (b8-rxweb, design 3.3). It renders nothing. On mount it picks up a read that survived a reload; when a
// read finishes while the User is elsewhere it shows the toast lib/backgroundCopy plans, and the toast's action opens the plan's screen.
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { readCachedMe } from '../../../app/meCache'
import { useOptionalToast } from '../../../ui'
import { finishedToast } from '../lib/backgroundCopy'
import { backgroundReadSession, dismissBackgroundRead, onBackgroundReadFinished, resumeBackgroundRead } from '../lib/backgroundRead'
import { publishReceiptSession } from '../lib/receiptSession'

export function ReceiptReadWatcher(): null {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const toast = useOptionalToast()
  // The listener reads where the User is when the read ends, not when it was set up. The remembered User (no query, so the shell's
  // tests and an offline start need no QueryClient) says whether they are an Admin.
  const where = useRef(pathname)
  useEffect(() => {
    where.current = pathname
  })

  useEffect(() => {
    void resumeBackgroundRead()
  }, [])

  useEffect(
    () =>
      onBackgroundReadFinished((state) => {
        const plan = finishedToast(state, where.current, { isAdmin: readCachedMe()?.isAdmin === true })
        if (plan === undefined) return
        toast?.show(plan.message, {
          status: plan.status,
          actionLabel: plan.actionLabel,
          onAction: () => {
            const session = backgroundReadSession()
            if (state.status === 'failed') dismissBackgroundRead()
            if (session !== undefined) publishReceiptSession(session)
            navigate(plan.to)
          },
        })
      }),
    [toast, navigate],
  )

  return null
}
