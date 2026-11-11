import { useEffect, useRef } from 'react'
import { Button, ListGroup, ListRow, TextField } from '../../../ui'
import { raIcons } from '../icons'
import type { KeyRowState } from '../lib/settingsForm'
import { raStrings } from '../strings'
import '../recipe-assistant.css'

export interface ApiKeyRowProps {
  state: KeyRowState
  /** Last four characters of the saved key (never more). */
  last4: string
  /** What is typed in the key field. */
  value: string
  error?: string
  disabled?: boolean
  /** Changes when the field should take focus (Replace, Remove); the row focuses it once the field exists. */
  focusRequest?: number
  onChange: (value: string) => void
  onReplace: () => void
  onKeepSaved: () => void
  onRemove: () => void
}

/** The key as a saved row (Replace, Remove) or as a password field; it never shows the key and never holds it anywhere else. */
export function ApiKeyRow({ state, last4, value, error, disabled, focusRequest = 0, onChange, onReplace, onKeepSaved, onRemove }: ApiKeyRowProps) {
  const box = useRef<HTMLDivElement>(null)
  const handled = useRef(focusRequest)
  const backToRow = useRef(false)

  useEffect(() => {
    if (state.mode === 'entry' && focusRequest !== handled.current) {
      const input = box.current?.querySelector('input')
      if (input) {
        input.focus()
        handled.current = focusRequest
      }
    }
    if (state.mode === 'saved' && backToRow.current) {
      backToRow.current = false
      box.current?.querySelector('button')?.focus()
    }
  }, [focusRequest, state.mode])

  if (state.mode === 'saved') {
    return (
      <div ref={box}>
        <ListGroup label={raStrings.savedKey}>
          <ListRow
            icon={raIcons.key}
            title={raStrings.keySaved}
            meta={`••••${last4}`}
            trailing={
              <>
                <Button variant="tertiary" size="sm" disabled={disabled} onClick={onReplace}>
                  {raStrings.replace}
                </Button>
                <Button variant="danger-tertiary" size="sm" disabled={disabled} onClick={onRemove}>
                  {raStrings.remove}
                </Button>
              </>
            }
          />
        </ListGroup>
      </div>
    )
  }

  const helper = state.unreadable ? raStrings.keyUnreadable : state.required ? raStrings.newAddressNeedsKey : raStrings.apiKeyHelper
  return (
    <div ref={box} className="ra__stack">
      <TextField
        label={raStrings.apiKey}
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={value}
        helper={helper}
        error={error}
        required={state.required}
        disabled={disabled}
        onChange={onChange}
      />
      {state.canKeepSaved ? (
        <div>
          <Button
            variant="tertiary"
            size="sm"
            disabled={disabled}
            onClick={() => {
              backToRow.current = true
              onKeepSaved()
            }}
          >
            {raStrings.keepSaved}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
