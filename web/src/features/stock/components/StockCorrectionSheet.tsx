// B9-45 (PC-02): the ONE Correct Stock sheet: a row per short Ingredient (name, what the Recipe used and what Stock showed, a Stepper
// in its unit at the end), the sheet's one circular Close (no Cancel) and one primary Save.
import { useState, type ReactElement } from 'react'
import { baseUnitLabel, formatQuantity, type UnitSystem } from '../../../lib/units'
import { BottomSheet, Stepper } from '../../../ui'
import { FormError } from '../../../ui/fields/FormError'
import { correctionStep, type CorrectionRow } from '../lib/shortfall'
import { stockStrings } from '../strings'
import './ShortfallNotice.css'

export interface StockCorrectionSheetProps {
  open: boolean
  onClose: () => void
  /** "After cooking Cauliflower al gorgonzola". */
  context: string
  rows: CorrectionRow[]
  system?: UnitSystem
  /** Save: the value of every row by ingredientId (0 where the User changed nothing). */
  onSave: (values: Record<number, number>) => void
  busy?: boolean
  error?: string | null
}

const FORM_ID = 'stock-correction-form'

function CorrectionForm({ rows, system, onSave, error }: Pick<StockCorrectionSheetProps, 'rows' | 'onSave' | 'error'> & { system: UnitSystem }) {
  const [values, setValues] = useState<Record<number, number>>({})
  const s = stockStrings.shortfall
  return (
    <form
      id={FORM_ID}
      className="stock-correction"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(Object.fromEntries(rows.map((r) => [r.ingredientId, values[r.ingredientId] ?? 0])))
      }}
    >
      <p className="stock-correction__lede">{s.lede}</p>
      <ul role="list" className="stock-correction__rows">
        {rows.map((row) => {
          const converted = system === 'imperial' && row.baseUnit !== 'piece'
          return (
            <li key={row.ingredientId} className="stock-correction__row">
              <div className="stock-correction__text">
                <p className="stock-correction__name">{row.name}</p>
                <p className="stock-correction__detail">{row.detail}</p>
              </div>
              <Stepper
                size="sm"
                label={s.leftNow(row.name)}
                value={values[row.ingredientId] ?? 0}
                onChange={(next) => setValues((v) => ({ ...v, [row.ingredientId]: next }))}
                min={0}
                step={correctionStep(row.baseUnit)}
                unit={converted ? undefined : baseUnitLabel(row.baseUnit, system)}
                format={converted ? (n) => formatQuantity(n, row.baseUnit, system) : undefined}
              />
            </li>
          )
        })}
      </ul>
      <FormError>{error}</FormError>
    </form>
  )
}

export function StockCorrectionSheet({ open, onClose, context, rows, system = 'metric', onSave, busy = false, error = null }: StockCorrectionSheetProps): ReactElement | null {
  const s = stockStrings.shortfall
  return (
    <BottomSheet open={open} onClose={onClose} title={s.sheetTitle} context={context} submit={{ label: s.save, form: FORM_ID, disabled: busy, loading: busy }}>
      <CorrectionForm rows={rows} system={system} onSave={onSave} error={error} />
    </BottomSheet>
  )
}
