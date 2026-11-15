// The toast after a Stock-take action (QA: "-1 pack gives no toast"). Plain TypeScript.
import { scanStrings } from '../strings'
import type { StockTakeAction } from '../types'

/**
 * B9-41 (SAFE-09): "+1 pack of Passata: 1.4 kg in Stock" / "−1 pack of Passata: 700 g in Stock" (U+2212, as scanStrings.minusPack) /
 * "Passata set to 1500 g" for set_total. `totalText` is the formatted new total.
 */
export function stockTakeMessage(action: StockTakeAction, ingredientName: string, totalText: string): string {
  if (action === 'set_total') return scanStrings.setTo(ingredientName, totalText)
  const change = action === 'plus_pack' ? scanStrings.plusPack : scanStrings.minusPack
  return `${change} of ${ingredientName}: ${totalText} in Stock`
}

/** B9-41 (SAFE-09): the Undo button's name: "Undo +1 pack of Passata", "Undo −1 pack of Passata", "Undo set total of Passata". */
export function stockTakeUndoLabel(action: StockTakeAction, ingredientName: string): string {
  const what = action === 'plus_pack' ? scanStrings.plusPack : action === 'minus_pack' ? scanStrings.minusPack : scanStrings.setTotalUndo
  return `Undo ${what} of ${ingredientName}`
}
