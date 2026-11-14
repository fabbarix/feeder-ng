// "Any Shop" in the Shop picker (G3). The ShopSelect has no clear option yet (the WP3b primitive follow-up), so "Any Shop"
// is an ordinary option with a sentinel id that the screen maps back to "no Shop".
// TODO(WP3b): when ShopSelect gets a clear option, drop this sentinel and pass the real choice.
import type { ShopChoice } from '../../../ui/Select/options'

/** The sentinel id of the "Any Shop" option; no Shop has id 0. */
export const ANY_SHOP_ID = 0

/**
 * The Shops with "Any Shop" first, in the order the picker lists them. b8-shop: `anyShopShort` ("Any") is the value a narrow chip
 * shows for the sentinel; the list keeps `anyShopName`.
 */
export function shopPickerChoices(shops: ShopChoice[], anyShopName: string, anyShopShort?: string): ShopChoice[] {
  return [{ id: ANY_SHOP_ID, name: anyShopName, ...(anyShopShort ? { shortName: anyShopShort } : {}) }, ...shops]
}
