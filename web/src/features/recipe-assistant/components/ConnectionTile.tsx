import type { ReactNode } from 'react'
import { TextField, Tile } from '../../../ui'
import { raStrings } from '../strings'
import '../recipe-assistant.css'

export interface ConnectionTileProps {
  baseUrl: string
  error?: string
  disabled?: boolean
  onBaseUrlChange: (baseUrl: string) => void
  /** The API key row. */
  children: ReactNode
}

/** The API base URL and, under it, the key row. */
export function ConnectionTile({ baseUrl, error, disabled, onBaseUrlChange, children }: ConnectionTileProps) {
  return (
    <Tile as="section" aria-label={raStrings.connection} span="full">
      <div className="ra__stack">
        <TextField
          label={raStrings.baseUrl}
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={baseUrl}
          helper={raStrings.baseUrlHelper}
          error={error}
          disabled={disabled}
          onChange={onBaseUrlChange}
        />
        {children}
      </div>
    </Tile>
  )
}
