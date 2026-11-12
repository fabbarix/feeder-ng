// When a photo read ends, the photos it was made from are finished with (photo-store.md "Finished read"): only a read that reached review
// (outcome 'done') empties the Photo tab. A failure, a Cancel here, and a read the server cancelled (another tab) keep the photos.
import { useEffect, useRef } from 'react'
import type { ReadInput } from '../types'
import type { UseRecipeRead } from './useRecipeRead'

export function usePhotoReadEnd(read: Pick<UseRecipeRead, 'busy' | 'kind' | 'outcome'>, finished: () => void): void {
  // The kind of the read that is running (the hook clears `kind` when it goes idle).
  const running = useRef<ReadInput['kind'] | undefined>(undefined)

  useEffect(() => {
    if (read.busy) {
      running.current = read.kind ?? running.current
      return
    }
    const kind = running.current
    running.current = undefined
    if (kind === 'photo' && read.outcome === 'done') finished()
  }, [read.busy, read.kind, read.outcome, finished])
}
