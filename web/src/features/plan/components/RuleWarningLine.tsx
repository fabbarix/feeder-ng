import './bought.css'
import type { MealWarning, WarningContext } from '../lib/bought'
import { warningLine } from '../lib/bought'

/** The warn line for a Pinned or Bought meal that breaks a hard rule; renders nothing without a warning. */
export function RuleWarningLine({ warning, context }: { warning: MealWarning | null | undefined; context: WarningContext }) {
  const text = warningLine(warning, context)
  if (text === null) return null
  return (
    <p className="rule-warning-line" role="note">
      {text}
    </p>
  )
}
