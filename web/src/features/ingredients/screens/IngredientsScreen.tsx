import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, EmptyState, ListPage, PageHeader, SearchField } from '../../../ui'
import { IngredientList } from '../components/IngredientList'
import { NewIngredientSheet } from '../components/NewIngredientSheet'
import { useDisplayUnitSystem } from '../hooks/useDisplayUnitSystem'
import { useIngredients } from '../hooks/useIngredients'
import { strings } from '../strings'

/** Route /ingredients: heading, "Search Ingredients" field, "New Ingredient" button (opens NewIngredientSheet), IngredientList or EmptyState (none yet / no match); opening a row navigates to /ingredients/:id. */
export function IngredientsScreen() {
  const navigate = useNavigate()
  const system = useDisplayUnitSystem()
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const list = useIngredients(query)

  const openNew = () => setCreating(true)
  let body
  if (list.error) {
    body = <p role="alert">{strings.actionFailed}</p>
  } else if (list.ingredients.length > 0) {
    body = <IngredientList ingredients={list.ingredients} system={system} onOpen={(id) => navigate(`/ingredients/${id}`)} />
  } else if (list.isEmpty) {
    body = <EmptyState title={strings.emptyTitle} description={strings.emptyText} action={<Button onClick={openNew}>{strings.newIngredient}</Button>} />
  } else {
    body = <p>{strings.noMatches}</p>
  }

  return (
    <ListPage
      header={<PageHeader title={strings.title} actions={<Button size="sm" icon="add" onClick={openNew}>{strings.newIngredient}</Button>} />}
      search={<SearchField label={strings.searchLabel} value={query} onChange={setQuery} />}
    >
      {body}
      <NewIngredientSheet open={creating} onClose={() => setCreating(false)} onCreate={list.create} />
    </ListPage>
  )
}
