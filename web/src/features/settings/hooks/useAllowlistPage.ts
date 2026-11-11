import { useState } from 'react'
import { useMe } from '../../../app/useMe'
import { errorMessage } from '../lib/errors'
import { useAllowlist } from './useAllowlist'
import { useHouseholdLiveUpdates } from './useHouseholdLiveUpdates'

/** The Allowlist page (Admins only: nothing is fetched for a plain User). Failures are kept as the page's alert. */
export function useAllowlistPage() {
  useHouseholdLiveUpdates()
  const me = useMe()
  const isAdmin = Boolean(me.data?.isAdmin)
  const allowlist = useAllowlist(isAdmin)
  const [error, setError] = useState<string>()
  const [addError, setAddError] = useState<string>()

  const guard = async <T,>(action: () => Promise<T>): Promise<T> => {
    try {
      const result = await action()
      setError(undefined)
      return result
    } catch (err) {
      setError(errorMessage(err))
      throw err
    }
  }

  return {
    isAdmin,
    allowlist,
    currentUserId: me.data?.id ?? 0,
    error,
    addError,
    clearAddError: () => setAddError(undefined),
    add: async (email: string) => {
      try {
        const result = await allowlist.add(email)
        setError(undefined)
        setAddError(undefined)
        return result
      } catch (err) {
        setAddError(errorMessage(err))
        throw err
      }
    },
    setAdmin: (id: number, makeAdmin: boolean) => void guard(() => allowlist.setAdmin(id, makeAdmin)).catch(() => {}),
    remove: (id: number) => void guard(() => allowlist.remove(id)).catch(() => {}),
  }
}
