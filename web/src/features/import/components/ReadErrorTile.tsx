import type { ReactNode, Ref } from 'react'
import { Link } from 'react-router-dom'
import { Button, Tile } from '../../../ui'
import { readErrorCopy, type ReadErrorInput } from '../lib/readErrors'
import { readStrings as t } from '../strings'

export interface ReadErrorTileProps {
  error: ReadErrorInput
  isAdmin: boolean
  onRetry: () => void
  /** The alert Tile itself, which the step focuses after a failure (tabindex -1), so the alert is read and the User is where the problem is. */
  focusRef?: Ref<HTMLElement>
}

const SETTINGS = '/settings/recipe-assistant'

/** `Tile variant="status" status="danger"` role=alert with the mapped copy, details, and the action (Try again / Open Recipe Assistant settings / Choose another model). */
export function ReadErrorTile({ error, isAdmin, onRetry, focusRef }: ReadErrorTileProps): ReactNode {
  const copy = readErrorCopy(error, { isAdmin })
  return (
    <Tile ref={focusRef} tabIndex={-1} className="read-error" variant="status" status="danger" role="alert" as="section">
        <p>{copy.message}</p>
        {copy.hint ? <p className="read-error__hint">{copy.hint}</p> : null}
        {copy.details.length > 0 ? (
          <ul className="read-error__details">
            {copy.details.map((d) => (
              <li key={d}>
                <code>{d}</code>
              </li>
            ))}
          </ul>
        ) : null}
        {copy.action === 'retry' && copy.retryable ? (
          <Button variant="secondary" icon="refresh" onClick={onRetry}>
            {t.tryAgain}
          </Button>
        ) : null}
        {copy.action === 'settings' ? (
          <Link className="import-text-link" to={SETTINGS}>
            {t.settingsLink}
          </Link>
        ) : null}
        {copy.action === 'chooseModel' ? (
          <Link className="import-text-link" to={`${SETTINGS}#model`}>
            {t.chooseModelLink}
          </Link>
        ) : null}
    </Tile>
  )
}
