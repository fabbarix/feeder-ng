// The toast after a Stock-take action (QA: "-1 pack gives no toast"). Plain TypeScript. WP7 stub.
import type { StockTakeAction } from '../types'

/**
 * "+1 pack: Passata, 1400 g in Stock" / "−1 pack: Passata, 700 g in Stock" (U+2212, as scanStrings.minusPack) /
 * "Passata: 1500 g in Stock" for set_total. `totalText` is the formatted new total.
 */
export function stockTakeMessage(action: StockTakeAction, ingredientName: string, totalText: string): string {
  void action
  void ingredientName
  void totalText
  return ''
}
