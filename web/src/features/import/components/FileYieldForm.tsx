import { useState, type ReactNode } from 'react'
import { Button, NumberField, Select } from '../../../ui'
import { YIELD_UNITS } from '../../../lib/baseRecipes/yield'
import { importStrings as s } from '../strings'

export interface FileYieldFormProps {
  onSet: (amount: number, unit: string) => void
}

/**
 * BR-E (design §11.3): a Recipe of this file that is not marked a Base recipe needs its Yield when the server says so. Amount and unit
 * ("portion" first); "Set Yield" answers the tile again with them.
 */
export function FileYieldForm({ onSet }: FileYieldFormProps): ReactNode {
  const [amount, setAmount] = useState<number | null>(null)
  const [unit, setUnit] = useState('portion')
  const ready = amount !== null && amount > 0
  return (
    <div className="base-yield">
      <NumberField size="xs" label={s.baseRecipes.yieldLabel} value={amount} onChange={setAmount} />
      <Select size="xs" label={s.baseRecipes.yieldUnitLabel} options={YIELD_UNITS.map((u) => ({ value: u, label: u }))} value={unit} onChange={setUnit} />
      <Button variant="secondary" disabled={!ready} onClick={() => ready && onSet(amount, unit)}>
        {s.baseRecipes.setYield}
      </Button>
    </div>
  )
}
