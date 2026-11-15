import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { Button, EmptyState, ErrorState, ListPage, LoadState, PageHeader, SearchField, Skeleton } from '../../../ui'
import { IngredientList } from '../components/IngredientList'
import { NewIngredientSheet } from '../components/NewIngredientSheet'
import { useDisplayUnitSystem } from '../hooks/useDisplayUnitSystem'
import { useIngredients } from '../hooks/useIngredients'
import { kindBasePath, tidyQuery, wordsFor } from '../lib/kind'
import { strings } from '../strings'
import type { IngredientKind } from '../types'

/**
 * Route /ingredients (food) and /supplies (kind "supply"): heading, search, "New Ingredient" or "New Supply" (the sheet is fixed to the kind),
 * the list or EmptyState (none yet), or a search that matched nothing, which names the query and offers to create it (SET-14e); opening a row navigates to that kind's page.
 */
export function IngredientsScreen({ kind = 'food' }: { kind?: IngredientKind }) {
  const navigate = useNavigate()
  const system = useDisplayUnitSystem()
  const [query, setQuery] = useState('')
  // The sheet's starting name: '' from the header's button, the typed search from the empty-search offer (SET-14e).
  const [creating, setCreating] = useState<string | null>(null)
  const list = useIngredients(query, kind)
  const breadcrumbs = useBreadcrumbs()
  const words = wordsFor(kind)

  const openNew = () => setCreating('')
  // B9-20 (RES-02): one state model; "unknown is not empty".
  let body
  if (list.state === 'loading') {
    // The first load: rows to come, not "no match" (which would flash before the list).
    body = <Skeleton variant="row" count={5} />
  } else if (list.state === 'offlineUnknown') {
    body = <LoadState title={words.offlineListTitle} text={strings.offlineListText} />
  } else if (list.state === 'failed') {
    body = <ErrorState message={words.listError} onRetry={list.refetch} />
  } else if (list.state === 'empty') {
    body = <EmptyState title={words.emptyTitle} description={words.emptyText} action={<Button onClick={openNew}>{words.newLabel}</Button>} />
  } else if (list.state === 'filteredEmpty') {
    const typed = tidyQuery(query)
    body = (
      <div className="ingredients__no-match">
        <p className="ingredients__no-match-text">{words.noMatchFor(typed)}</p>
        <Button variant="secondary" icon="add" onClick={() => setCreating(typed)}>
          {words.newFromSearch(typed)}
        </Button>
      </div>
    )
  } else {
    body = <IngredientList ingredients={list.ingredients} system={system} label={words.title} onOpen={(id) => navigate(`${kindBasePath(kind)}/${id}`)} />
  }

  return (
    <ListPage
      header={<PageHeader title={words.title} breadcrumbs={breadcrumbs} actions={<Button size="sm" icon="add" onClick={openNew}>{words.newLabel}</Button>} />}
      search={<SearchField label={words.searchLabel} value={query} onChange={setQuery} />}
    >
      {body}
      <NewIngredientSheet
        open={creating !== null}
        initialName={creating ?? ''}
        onClose={() => setCreating(null)}
        onCreate={list.create}
        kind={kind}
        chooseKind={false}
      />
    </ListPage>
  )
}
