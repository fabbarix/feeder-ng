// B9-29 (SSP-10): Put away many Stock Lots in one request. React hook over stockApi.putAway.
import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { stockApi } from '../api'
import type { PutAwayMove, PutAwayResult } from '../lib/putAway'

export interface UsePutAway {
  /** One request for all the moves; refreshes Stock when it answers. Rejects (and refreshes nothing) when refused. */
  putAway(moves: PutAwayMove[]): Promise<PutAwayResult>
}

export function usePutAway(): UsePutAway {
  const client = useQueryClient()
  const putAway = useCallback(
    async (moves: PutAwayMove[]) => {
      const result = await stockApi.putAway(moves)
      await client.invalidateQueries({ queryKey: ['stock'] })
      return result
    },
    [client],
  )
  return { putAway }
}
