import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../../lib/http'
import { shopsApi, type RuleBody } from '../api'
import type { Shop, ShopBarcode, ShopLocation, ShopRule } from '../types'

export interface UseShop {
  shop: Shop | undefined
  rules: ShopRule[]
  barcodes: ShopBarcode[]
  isLoading: boolean
  /** ApiError with status 404 when the id does not exist. */
  error: Error | null
  rename: (name: string) => Promise<void>
  /** any User: saves where the Shop is */
  saveLocation: (location: ShopLocation) => Promise<void>
  remove: () => Promise<void>
  addRule: (body: RuleBody) => Promise<void>
  updateRule: (id: number, body: RuleBody) => Promise<void>
  deleteRule: (id: number) => Promise<void>
  addBarcode: (body: Parameters<typeof shopsApi.addBarcode>[1]) => Promise<void>
  deleteBarcode: (id: number) => Promise<void>
}

/** One Shop with its rules and Shop Barcodes (keys ['shops', id, ...]); every mutation refreshes them and ['catalog']. */
export function useShop(id: number): UseShop {
  const client = useQueryClient()
  const list = useQuery({ queryKey: ['shops'], queryFn: () => shopsApi.list() })
  const rules = useQuery({ queryKey: ['shops', id, 'rules'], queryFn: () => shopsApi.rules(id) })
  const barcodes = useQuery({ queryKey: ['shops', id, 'barcodes'], queryFn: () => shopsApi.barcodes(id) })

  const changed = async (request: Promise<unknown>) => {
    await request
    await Promise.all([
      client.invalidateQueries({ queryKey: ['shops'] }),
      client.invalidateQueries({ queryKey: ['catalog'] }),
    ])
  }

  const shop = list.data?.find((s) => s.id === id)
  const missing = list.isSuccess && shop === undefined
  return {
    shop,
    rules: rules.data ?? [],
    barcodes: barcodes.data ?? [],
    isLoading: list.isLoading,
    error: missing ? new ApiError(404, 'not_found', 'Shop not found') : list.error,
    rename: (name) => changed(shopsApi.rename(id, name)),
    saveLocation: (location) => changed(shopsApi.setLocation(id, location)),
    remove: async () => {
      await shopsApi.remove(id)
      client.removeQueries({ queryKey: ['shops', id] })
      await Promise.all([
        client.invalidateQueries({ queryKey: ['shops'] }),
        client.invalidateQueries({ queryKey: ['products'] }),
        client.invalidateQueries({ queryKey: ['catalog'] }),
      ])
    },
    addRule: (body) => changed(shopsApi.createRule(id, body)),
    updateRule: (ruleId, body) => changed(shopsApi.updateRule(ruleId, body)),
    deleteRule: (ruleId) => changed(shopsApi.deleteRule(ruleId)),
    addBarcode: (body) => changed(shopsApi.addBarcode(id, body)),
    deleteBarcode: (barcodeId) => changed(shopsApi.deleteBarcode(barcodeId)),
  }
}
