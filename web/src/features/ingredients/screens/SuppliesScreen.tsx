import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { Button, EmptyState, ListPage, PageHeader, SearchField } from '../../../ui'
import { NewIngredientSheet } from '../components/NewIngredientSheet'
import { SupplyList } from '../components/SupplyList'
import { UseSupplySheet } from '../components/UseSupplySheet'
import { useDisplayUnitSystem } from '../hooks/useDisplayUnitSystem'
import { useIngredients } from '../hooks/useIngredients'
import { useSupplyStock } from '../hooks/useSupplyStock'
import { useSupplyUse } from '../hooks/useSupplyUse'
import { kindBasePath, wordsFor } from '../lib/kind'
import { strings } from '../strings'

/**
 * Route /supplies (decision D5): the Supplies list with its own words, the stock level and the quick Use (H9). Opening a row
 * goes to /supplies/:id; "New Supply" creates one. The list and the sheet are rendered here; the rules live in the hooks and lib.
 */
export function SuppliesScreen() {
  const navigate = useNavigate()
  const system = useDisplayUnitSystem()
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const list = useIngredients(query, 'supply')
  const stock = useSupplyStock()
  const use = useSupplyUse()
  const breadcrumbs = useBreadcrumbs()
  const words = wordsFor('supply')

  let body
  if (list.error) {
    body = <p role="alert">{strings.actionFailed}</p>
  } else if (list.ingredients.length > 0) {
    body = (
      <SupplyList
        supplies={list.ingredients}
        stock={stock.totals}
        system={system}
        label={words.title}
        busyId={use.busyId}
        onOpen={(id) => navigate(`${kindBasePath('supply')}/${id}`)}
        onUse={(supply) => use.request(supply, stock.totals?.get(supply.id) ?? 0)}
      />
    )
  } else if (list.isEmpty) {
    body = <EmptyState title={words.emptyTitle} description={words.emptyText} action={<Button onClick={() => setCreating(true)}>{words.newLabel}</Button>} />
  } else {
    body = <p>{words.noMatches}</p>
  }

  return (
    <ListPage
      header={<PageHeader title={words.title} breadcrumbs={breadcrumbs} actions={<Button size="sm" icon="add" onClick={() => setCreating(true)}>{words.newLabel}</Button>} />}
      search={<SearchField label={words.searchLabel} value={query} onChange={setQuery} />}
    >
      {body}
      {use.sheet ? (
        <UseSupplySheet
          supply={use.sheet.supply}
          stock={use.sheet.stock}
          packSize={use.sheet.packSize}
          system={system}
          busy={use.busyId !== null}
          onConfirm={use.confirm}
          onClose={use.closeSheet}
        />
      ) : null}
      <NewIngredientSheet open={creating} onClose={() => setCreating(false)} onCreate={list.create} kind="supply" chooseKind={false} />
    </ListPage>
  )
}
