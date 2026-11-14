import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { Button, EmptyState, ListPage, PageHeader, SearchField, Skeleton } from '../../../ui'
import { IngredientList } from '../components/IngredientList'
import { NewIngredientSheet } from '../components/NewIngredientSheet'
import { useDisplayUnitSystem } from '../hooks/useDisplayUnitSystem'
import { useIngredients } from '../hooks/useIngredients'
import { kindBasePath, wordsFor } from '../lib/kind'
import { strings } from '../strings'
import type { IngredientKind } from '../types'

/**
 * Route /ingredients (food) and /supplies (kind "supply"): heading, search, "New Ingredient" or "New Supply" (the sheet is fixed to the kind),
 * the list or EmptyState (none yet / no match); opening a row navigates to that kind's page.
 */
export function IngredientsScreen({ kind = 'food' }: { kind?: IngredientKind }) {
  const navigate = useNavigate()
  const system = useDisplayUnitSystem()
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const list = useIngredients(query, kind)
  const breadcrumbs = useBreadcrumbs()
  const words = wordsFor(kind)

  const openNew = () => setCreating(true)
  let body
  if (list.error) {
    body = <p role="alert">{strings.actionFailed}</p>
  } else if (list.isLoading) {
    // The first load: rows to come, not "no match" (which would flash before the list).
    body = <Skeleton variant="row" count={5} />
  } else if (list.ingredients.length > 0) {
    body = <IngredientList ingredients={list.ingredients} system={system} label={words.title} onOpen={(id) => navigate(`${kindBasePath(kind)}/${id}`)} />
  } else if (list.isEmpty) {
    body = <EmptyState title={words.emptyTitle} description={words.emptyText} action={<Button onClick={openNew}>{words.newLabel}</Button>} />
  } else {
    body = <p>{words.noMatches}</p>
  }

  return (
    <ListPage
      header={<PageHeader title={words.title} breadcrumbs={breadcrumbs} actions={<Button size="sm" icon="add" onClick={openNew}>{words.newLabel}</Button>} />}
      search={<SearchField label={words.searchLabel} value={query} onChange={setQuery} />}
    >
      {body}
      <NewIngredientSheet open={creating} onClose={() => setCreating(false)} onCreate={list.create} kind={kind} chooseKind={false} />
    </ListPage>
  )
}
