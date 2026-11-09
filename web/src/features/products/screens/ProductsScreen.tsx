import { useState } from 'react'
import { ProductList } from '../components/ProductList'
import { useProducts } from '../hooks/useProducts'
import { useProductsLiveUpdates } from '../hooks/useProductsLiveUpdates'
import { strings } from '../strings'
import '../products.css'

/** /products: search field, ProductList. Hook: useProducts. */
export function ProductsScreen() {
  const [q, setQ] = useState('')
  const { products, isLoading, error } = useProducts(q)
  useProductsLiveUpdates()
  return (
    <div className="pg">
      <h1 className="pg__title">{strings.productsTitle}</h1>
      <input
        type="search"
        aria-label={strings.productsSearch}
        placeholder={strings.productsSearch}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {error ? (
        <p role="alert">{strings.actionFailed}</p>
      ) : isLoading ? (
        <p role="status">{strings.loading}</p>
      ) : (
        <ProductList products={products} />
      )}
    </div>
  )
}
