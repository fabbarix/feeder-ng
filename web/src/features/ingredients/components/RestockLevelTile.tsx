import { Button, FormActions, TextField, Tile } from '../../../ui'
import { baseUnitLabel, type BaseUnit, type UnitSystem } from '../../../lib/units'
import { restockSummary } from '../lib/kind'
import { useRestockForm } from '../hooks/useIngredientForms'
import { strings } from '../strings'
import '../ingredients.css'

export interface RestockLevelTileProps {
  level: number | null
  baseUnit: BaseUnit
  /** The household display: the summary follows it; the field stays in the metric Base Unit. */
  system: UnitSystem
  onSave: (level: number | null) => void
}

/** The Restock level of a Supply: a number in its Base Unit, saved on Enter or Save, cleared when emptied. */
export function RestockLevelTile({ level, baseUnit, system, onSave }: RestockLevelTileProps) {
  const form = useRestockForm(level, onSave)
  return (
    <Tile as="section" aria-label={strings.restock.label}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          form.submit()
        }}
      >
        <TextField
          label={strings.restock.label}
          value={form.text}
          onChange={form.setText}
          suffix={baseUnitLabel(baseUnit, 'metric', level ?? undefined)}
          helper={strings.restock.helper}
          error={form.error ?? undefined}
          inputMode="decimal"
          autoComplete="off"
        />
        <FormActions
          destructive={
            level !== null ? (
              <Button variant="danger-tertiary" onClick={form.clear}>
                {strings.restock.clear}
              </Button>
            ) : undefined
          }
          primary={<Button type="submit">{strings.restock.save}</Button>}
        />
      </form>
      <p className="restock__summary">{restockSummary(level, baseUnit, system)}</p>
    </Tile>
  )
}
