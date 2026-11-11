// The phone's position for the Shop Location, as React state. React hook over lib/geolocation.
import { useCallback, useEffect, useRef, useState } from 'react'
import { currentPosition, positionPermission, PositionError, type Position, type PositionFailure } from '../../../lib/geolocation'

export type PositionStatus = 'idle' | 'locating' | 'ready' | 'failed'

export interface UsePosition {
  status: PositionStatus
  position: Position | null
  failure: PositionFailure | null
  /** asks for a fix now (this may show the browser's location prompt, so call it from a tap) */
  locate: () => void
}

export interface UsePositionOptions {
  /** 'granted': locate on mount only when it will not prompt; 'always': locate on mount; 'never' (default): wait for locate() */
  auto?: 'granted' | 'always' | 'never'
  /** injectable for tests */
  getPosition?: () => Promise<Position>
  getPermission?: () => Promise<string>
}

export function usePosition({ auto = 'never', getPosition = currentPosition, getPermission = positionPermission }: UsePositionOptions = {}): UsePosition {
  const [status, setStatus] = useState<PositionStatus>('idle')
  const [position, setPosition] = useState<Position | null>(null)
  const [failure, setFailure] = useState<PositionFailure | null>(null)
  const alive = useRef(true)
  const seq = useRef(0)

  const locate = useCallback(() => {
    const mine = ++seq.current
    setStatus('locating')
    setFailure(null)
    getPosition().then(
      (p) => {
        if (!alive.current || mine !== seq.current) return
        setPosition(p)
        setStatus('ready')
      },
      (err: unknown) => {
        if (!alive.current || mine !== seq.current) return
        setFailure(err instanceof PositionError ? err.reason : 'unavailable')
        setStatus('failed')
      },
    )
  }, [getPosition])

  useEffect(() => {
    alive.current = true
    if (auto === 'always') locate()
    else if (auto === 'granted') {
      void getPermission().then((state) => {
        if (alive.current && state === 'granted') locate()
      })
    }
    return () => {
      alive.current = false
    }
    // run once on mount: later changes of auto do not re-locate
  }, [])

  return { status, position, failure, locate }
}
