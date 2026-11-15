import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { ingredientsApi } from '../../ingredients/api'
import { useProducts } from '../../products/hooks/useProducts'
import { productChoices } from '../lib/productChoices'

/** Every Product as a ProductChoice for the Shop; the Ingredients read (for Food and Supplies) may fail without harm. */
export function useProductChoices(shopId: number, soldAtProductIds: number[]) {
  const { products, isLoading } = useProducts('')
  const ingredients = useQuery({ queryKey: ['ingredients'], queryFn: () => ingredientsApi.list(), retry: false })
  const choices = useMemo(
    () => productChoices(products, ingredients.data, soldAtProductIds, shopId),
    [products, ingredients.data, soldAtProductIds, shopId],
  )
  return { choices, isLoading }
}
