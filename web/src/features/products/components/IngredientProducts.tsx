import { useState } from 'react'
import type { UnitSystem } from '../../../lib/units'
import { BottomSheet, Button, Tile } from '../../../ui'
import { useIngredientProducts } from '../hooks/useIngredientProducts'
import { strings } from '../strings'
import type { BaseUnit } from '../types'
import { ProductForm } from './ProductForm'
import { ProductList } from './ProductList'
import '../products.css'

export interface IngredientProductsProps {
  ingredientId: number
  ingredientName: string
  baseUnit: BaseUnit
  /** The User's display system, passed by the Ingredient screen (useDisplayUnitSystem). */
  system?: UnitSystem
}

/**
 * The "Products" tile of an Ingredient page (embedded by the ingredients feature):
 * lists the Ingredient's Products (name, pack size, link to /products/:id) with an
 * EmptyState when there are none, and a "New Product" button opening a BottomSheet
 * with ProductForm. A successful create closes the sheet.
 */
export function IngredientProducts({ ingredientId, ingredientName, baseUnit, system = 'metric' }: IngredientProductsProps) {
  const { products, create } = useIngredientProducts(ingredientId)
  const [open, setOpen] = useState(false)
  return (
    <Tile as="section" span="full" aria-label={strings.ingredientProductsTitle}>
      <h2 className="pg__tile-title">{strings.ingredientProductsTitle}</h2>
      {products.length === 0 ? <p>{strings.ingredientProductsEmpty}</p> : <ProductList products={products} system={system} showIngredient={false} />}
      <Button variant="tertiary" onClick={() => setOpen(true)}>
        {strings.newProduct}
      </Button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={strings.newProduct}>
        <ProductForm
          ingredientId={ingredientId}
          ingredientName={ingredientName}
          baseUnit={baseUnit}
          onSubmit={async (body) => {
            await create(body)
            setOpen(false)
          }}
        />
      </BottomSheet>
    </Tile>
  )
}
