import type { ReadAvailability } from '../lib/readAvailability'

export type UseReadAvailability = ReadAvailability & {
  /** Fetches the status again (after "Could not check the Recipe Assistant"). */
  retry: () => void
}

/**
 * GET /api/recipe-assistant/status (react-query, key ['recipe-assistant','status'], fresh for 30 s, refetched on focus and after a
 * read started or ended) through lib/readAvailability, with the signed-in User's role from useMe. TODO(ra-e developer).
 */
export function useReadAvailability(): UseReadAvailability {
  return { loading: true, enabled: false, isAdmin: false, statusFailed: false, settingsLink: false, photos: false, retry: () => undefined }
}
