import { Button, Tile } from '../../../ui'
import { raIcons } from '../icons'
import { raStrings } from '../strings'
import type { TestResult } from '../types'
import { TestResultTile } from './TestResultTile'
import '../recipe-assistant.css'

export interface TestConnectionTileProps {
  canRun: boolean
  running: boolean
  /** Why the test is unavailable, in text. */
  hint?: string
  result?: TestResult
  errorMessage?: string
  onRun: () => void
}

/** The Test connection button, why it is unavailable, and its result. */
export function TestConnectionTile({ canRun, running, hint, result, errorMessage, onRun }: TestConnectionTileProps) {
  return (
    <Tile as="section" aria-label={raStrings.testConnection} span="full">
      <div>
        <Button variant="tertiary" icon={raIcons.connect} disabled={!canRun} loading={running} onClick={onRun}>
          {raStrings.testConnection}
        </Button>
      </div>
      {hint ? <p className="ra__muted">{hint}</p> : null}
      <TestResultTile running={running} result={result} errorMessage={errorMessage} />
    </Tile>
  )
}
