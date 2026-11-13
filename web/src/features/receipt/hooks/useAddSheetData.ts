// What the new-Product sheet needs on the receipt review (the Add… seam, design 3.4): the Shop's name, the Ingredients and Supplies,
// the Shop's open Lines, the known Products for the pack chips, and the near-duplicate lookup while online. The same sources as the
// Scan screen's sheet.
import { useConnectivity } from '../../../app/useConnectivity'
import { ingredientsApi } from '../../ingredients/api'
import type { SearchResult } from '../../ingredients/types'
import { useOfflineData } from '../../scan/hooks/useOfflineData'
import type { IngredientChoice } from '../../scan/lib/unknownForm'
import type { OfflineProduct } from '../../scan/types'
import { useShoppingList } from '../../shop/hooks/useShoppingList'
import type { ShoppingLine } from '../../shop/types'
import { useShops } from '../../shops/hooks/useShops'
import { useIngredientChoices } from '../../stock/hooks/useIngredientChoices'

export interface AddSheetData {
  shopName: string
  ingredients: IngredientChoice[]
  lines: ShoppingLine[] | undefined
  products: OfflineProduct[]
  findSimilar?: (name: string) => Promise<SearchResult>
}

export function useAddSheetData(shopId: number | null): AddSheetData {
  const { shops } = useShops()
  const { choices } = useIngredientChoices()
  const list = useShoppingList({ shopId })
  const offline = useOfflineData(shopId)
  const { offline: isOffline } = useConnectivity()
  return {
    shopName: shops.find((s) => s.id === shopId)?.name ?? '',
    ingredients: choices,
    lines: list.data?.lines,
    products: offline.offline?.products ?? [],
    ...(isOffline ? {} : { findSimilar: (name: string) => ingredientsApi.search(name) }),
  }
}
