import { Icon } from '../../../ui'
import { checkCopy } from '../lib/errors'
import { raStrings } from '../strings'
import type { TestResult } from '../types'
import '../recipe-assistant.css'

export interface TestResultTileProps {
  running: boolean
  result?: TestResult
  /** A request that did not run (not a failed check). */
  errorMessage?: string
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

/** The Test connection answer: progress, then one line per check (Failed is a word, not only a colour). Always a polite live region. */
export function TestResultTile({ running, result, errorMessage }: TestResultTileProps) {
  return (
    <div className="ra__result" role="status" aria-live="polite">
      {running ? <p className="ra__muted">{raStrings.testing}</p> : null}
      {!running && errorMessage ? (
        <p className="ra__line">
          <Icon name="error" size={20} />
          <span>{errorMessage}</span>
        </p>
      ) : null}
      {!running && result ? (
        <>
          <ul className="ra__checks">
            {result.checks.map((check) => (
              <li key={check.name} className="ra__check">
                <Icon name={check.ok ? 'success' : 'error'} size={20} />
                <span>{checkCopy(check)}</span>
                {check.ok ? null : <strong>{raStrings.failed}</strong>}
              </li>
            ))}
          </ul>
          {result.ok ? (
            <p className="ra__line">
              <strong>{result.model ? `Connected to ${result.model.name}` : 'Connected'}</strong>
              <span className="ra__muted">{seconds(result.latencyMs)}</span>
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
