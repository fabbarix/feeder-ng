import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../../../ui'
import { leaveTarget } from '../lib/leave'
import { boardStrings } from '../strings'

export interface CloseBoardProps {
  /** After 10 s without input it dims (data-idle); it never hides and stays in the tab order. */
  idle: boolean
}

/**
 * B9-47 (TB-04, R-B at board scale): the board's way out, a round "Close kitchen board" with an X. Opened directly (the session's
 * first entry) it is a link to Today; opened from inside the app it is a button that goes back one entry.
 */
export function CloseBoard({ idle }: CloseBoardProps): ReactNode {
  const location = useLocation()
  const navigate = useNavigate()
  const icon = <Icon name="close" size={28} />
  const dim = idle ? 'true' : undefined
  if (leaveTarget(location.key) === '/') {
    return (
      <Link to="/" className="board-close" aria-label={boardStrings.close} data-idle={dim}>
        {icon}
      </Link>
    )
  }
  return (
    <button type="button" className="board-close" aria-label={boardStrings.close} data-idle={dim} onClick={() => leaveTarget(location.key) === -1 && navigate(-1)}>
      {icon}
    </button>
  )
}
