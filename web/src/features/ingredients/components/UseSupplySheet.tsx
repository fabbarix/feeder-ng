import { useEffect, useState } from 'react'
import { BottomSheet, Button, TextField } from '../../../ui'
import { baseUnitLabel, type UnitSystem } from '../../../lib/units'
import { displayName } from '../lib/names'
import { checkUseAmount, parseAmountText, sheetStart } from '../lib/supplyUse'
import { strings } from '../strings'
import type { Ingredient } from '../types'

const S = strings.supplyUse

export interface UseSupplySheetProps {
  supply: Ingredient
  /** The Supply's Stock in Base Units: the most that can be used. */
  stock: number
  /** The pack size of the Product last bought, null when none is known (yet). */
  packSize: number | null
  system: UnitSystem
  busy?: boolean
  onConfirm: (quantity: number) => void
  onClose: () => void
}

const asText = (amount: number | null) => (amount === null ? '' : String(amount))

/** The "how much" sheet of a g or ml Supply: an amount in its Base Unit, prefilled (sheetStart), with Use and Use all. */
export function UseSupplySheet({ supply, stock, packSize, system, busy = false, onConfirm, onClose }: UseSupplySheetProps) {
  const [text, setText] = useState(() => asText(sheetStart(packSize, stock)))
  const [error, setError] = useState<string | null>(null)
  // The pack size arrives after the sheet opens: prefill it then.
  useEffect(() => {
    setText(asText(sheetStart(packSize, stock)))
    setError(null)
  }, [packSize, stock])

  const submit = () => {
    const checked = checkUseAmount(parseAmountText(text), stock, supply.baseUnit, system)
    if (!checked.ok) {
      setError(checked.error)
      return
    }
    setError(null)
    onConfirm(checked.value)
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={S.sheetTitle(displayName(supply.name))}
      footer={
        <>
          <Button variant="secondary" onClick={() => onConfirm(stock)} disabled={busy}>
            {S.useAll}
          </Button>
          <Button onClick={submit} disabled={busy}>
            {S.useButton}
          </Button>
        </>
      }
    >
      <TextField
        label={S.howMuch}
        value={text}
        onChange={(next) => {
          setText(next)
          setError(null)
        }}
        suffix={baseUnitLabel(supply.baseUnit, system)}
        inputMode="decimal"
        autoComplete="off"
        error={error ?? undefined}
      />
    </BottomSheet>
  )
}
