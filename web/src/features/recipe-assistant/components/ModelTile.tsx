import { Chip, IconButton, Select, Tile } from '../../../ui'
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

/** The model Select (price Chip as leading glyph), Refresh models and the notices around them. `id="model"` is the refusal link target. */
export function ModelTile({ value, options, error, notice, failedMessage, disabled, canRefresh, createLabel, onChange, onCreate, onRefresh }: ModelTileProps) {
  const withBadges = options.map((o) => ({
    ...o,
    leading: o.priceTier ? <Chip kind={o.warning ? 'status' : 'tag'} status={o.warning ? 'spoil' : undefined}>{o.priceTier}</Chip> : undefined,
  }))
  return (
    <Tile as="section" id="model" aria-label={raStrings.model} span="full">
      <div className="ra__field-row">
        <div className="ra__field-grow">
          <Select
            label={raStrings.model}
            value={value === '' ? null : value}
            options={withBadges}
            error={error}
            disabled={disabled}
            onChange={onChange}
            onCreate={onCreate}
            createLabel={createLabel}
          />
        </div>
        <IconButton icon={raIcons.refresh} label={raStrings.refreshModels} disabled={!canRefresh} onClick={onRefresh} />
      </div>
      {notice ? <p className="ra__muted">{notice}</p> : null}
      {failedMessage ? <p className="ra__muted">{failedMessage}</p> : null}
    </Tile>
  )
}
