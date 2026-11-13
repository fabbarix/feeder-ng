import './bought.css'
import type { BoughtInfo } from '../lib/bought'
import { boughtLine } from '../lib/bought'

/** The sheet line naming the Ingredients bought for a Planned Meal; renders nothing when not Bought. */
export function BoughtLine({ bought }: { bought: BoughtInfo | null | undefined }) {
  const text = boughtLine(bought)
  if (text === null) return null
  return <p className="bought-line">{text}</p>
}
