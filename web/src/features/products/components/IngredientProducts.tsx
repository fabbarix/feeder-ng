import { useState } from 'react'
import type { UnitSystem } from '../../../lib/units'
import { Button, SectionTitle, Tile, type TileSpan } from '../../../ui'
import { useIngredientProducts } from '../hooks/useIngredientProducts'
import { strings } from '../strings'
import type { BaseUnit } from '../types'
import { NewProductSheet } from './NewProductSheet'
import { ProductList } from './ProductList'
import '../products.css'

export interface IngredientProductsProps {
  ingredientId: number
  ingredientName: string
  baseUnit: BaseUnit
  /** The User's display system, passed by the Ingredient screen (useDisplayUnitSystem). */
  system?: UnitSystem
  /** B9-48 (SET-05): the Ingredient page pairs it with Unit Conversions (a half-width tile with that page's class). Default full. */
  span?: TileSpan
  className?: string
}

/**
 * The "Products" tile of an Ingredient page (embedded by the ingredients feature):
 * lists the Ingredient's Products (name, pack size, link to /products/:id) with an
 * EmptyState when there are none, and a "New Product" button opening the shared
 * NewProductSheet (SET-14a). A successful create closes the sheet.
 */
export function IngredientProducts({ ingredientId, ingredientName, baseUnit, system = 'metric', span = 'full', className }: IngredientProductsProps) {
  const { products, create } = useIngredientProducts(ingredientId)
  const [open, setOpen] = useState(false)
  return (
    <Tile as="section" span={span} className={className} aria-label={strings.ingredientProductsTitle}>
      <SectionTitle>{strings.ingredientProductsTitle}</SectionTitle>
      {products.length === 0 ? <p>{strings.ingredientProductsEmpty}</p> : <ProductList products={products} system={system} showIngredient={false} />}
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {strings.newProduct}
      </Button>
      <NewProductSheet
        open={open}
        onClose={() => setOpen(false)}
        ingredient={{ id: ingredientId, name: ingredientName, baseUnit }}
        onSubmit={async (body) => {
          await create(body)
          setOpen(false)
        }}
      />
    </Tile>
  )
}
