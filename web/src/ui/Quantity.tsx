// B9-22 / B9-55: an amount as a person reads it ("12 kg") and as a screen reader says it ("12 kilograms"). The abbreviated text is
// aria-hidden and the spoken text sits beside it in a .visually-hidden span, so the accessible name of a row reads the unit in full.
// Renders only: the wording is lib/units formatQuantity and spokenQuantity.
import type { ReactNode } from 'react'
import { formatQuantity, spokenQuantity, type BaseUnit, type UnitSystem } from '../lib/units'

export interface QuantityProps {
  amount: number
  base: BaseUnit
  system: UnitSystem
  className?: string
}

export function Quantity({ amount, base, system, className }: QuantityProps): ReactNode {
  return (
    <span className={className}>
      <span aria-hidden="true">{formatQuantity(amount, base, system)}</span>
      <span className="visually-hidden">{spokenQuantity(amount, base, system)}</span>
    </span>
  )
}
