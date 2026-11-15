import { useCallback } from 'react'

/** Copies text to the clipboard through our own button, never a native prompt or the legacy execCommand. `copy` resolves true
 *  when the text is on the clipboard and false when it is not (no clipboard on an insecure page, a refusal, a throw); it never
 *  rejects, so the caller shows its own fallback on false. */
export function useCopyText(): { copy: (text: string) => Promise<boolean> } {
  const copy = useCallback(async (text: string): Promise<boolean> => {
    try {
      const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
      if (!clipboard || typeof clipboard.writeText !== 'function') return false
      await clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }, [])
  return { copy }
}
