import { FieldRow, IconButton, Muted, Select, Tile } from '../../../ui'
import { raIcons } from '../icons'
import type { ModelOption } from '../lib/modelOptions'
import { raStrings } from '../strings'
import '../recipe-assistant.css'

export interface ModelTileProps {
  value: string
  options: ModelOption[]
  error?: string
  /** The catalogue fallback notice, when the live list could not be read. */
  notice?: string
  /** Why the list could not be loaded (only the saved model is offered). */
  failedMessage?: string
  disabled?: boolean
  canRefresh: boolean
  createLabel: (query: string) => string
  onChange: (model: string) => void
  onCreate: (query: string) => void
  onRefresh: () => void
}

/**
 * The model Select and Refresh models in one FieldRow (SET-14f), and the notices around them. The price tier is in each option's
 * meta line ("$ · Fastest · …"), explained once by the field's helper "Price per 1M tokens". `id="model"` is the refusal link target.
 */
export function ModelTile({ value, options, error, notice, failedMessage, disabled, canRefresh, createLabel, onChange, onCreate, onRefresh }: ModelTileProps) {
  return (
    <Tile as="section" id="model" aria-label={raStrings.model} span="full">
      <FieldRow align="end" className="ra__model-row">
        <Select
          label={raStrings.model}
          helper={raStrings.modelPriceHelper}
          value={value === '' ? null : value}
          options={options}
          error={error}
          disabled={disabled}
          onChange={onChange}
          onCreate={onCreate}
          createLabel={createLabel}
        />
        <IconButton icon={raIcons.refresh} label={raStrings.refreshModels} disabled={!canRefresh} onClick={onRefresh} />
      </FieldRow>
      {notice ? <Muted>{notice}</Muted> : null}
      {failedMessage ? <Muted>{failedMessage}</Muted> : null}
    </Tile>
  )
}
