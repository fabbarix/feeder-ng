import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button, DetailList, DetailRow, Icon, ListGroup, ListRow, RecipeThumb, Tile } from '../../../ui'
import { addedRows, resultRowMeta, resultRowState } from '../lib/reviewSummary'
import { importStrings as s } from '../strings'
import type { ImportResult as ImportResultData, Plan } from '../types'

export interface ImportResultProps {
  result: ImportResultData
  /** The plan the import was confirmed with: it names the file's Recipes, the created Ingredients and the answered units. */
  plan: Plan
  onImportMore: () => void
}

const t = s.reviewRows

/**
 * B9-28 (RX-01): the result of an import, a page (not a toast). The heading takes focus; one row per imported Recipe links to it, with what
 * happened as its state and an outlined Edit to its editor (decision RX 3: a misread is corrected there); "Also added" lists the Ingredients,
 * Unit Conversions and Courses the import added, as rows; then "Import more" and "Open Recipes".
 */
export function ImportResult({ result, plan, onImportMore }: ImportResultProps): ReactNode {
  const heading = useRef<HTMLHeadingElement>(null)
  const headingId = useId()
  useEffect(() => {
    heading.current?.focus()
  }, [])
  const added = addedRows(result, plan)
  return (
    <Tile as="section" className="import-result" aria-labelledby={headingId}>
      <div className="import-result__head">
        <Icon name="success" size={24} />
        <h2 ref={heading} id={headingId} tabIndex={-1}>
          {s.done(result.recipes.length)}
        </h2>
      </div>
      <ListGroup label={t.importedList}>
        {result.recipes.map((r) => {
          const status = plan.recipes.find((x) => x.index === r.index)
          // A kept-both Recipe keeps the file's name as its key; its state says the name it was saved under ("Kept as Soup (2)"), as
          // in the review. Repeating the new name in both made the row three lines tall at 390.
          const title = status?.action === 'keep_both' ? status.name : r.name
          return (
            <ListRow
              key={r.id}
              title={title}
              href={`/recipes/${r.id}`}
              leading={<RecipeThumb name={title} size={40} />}
              meta={status ? resultRowMeta(status) : undefined}
              wrapTitle
              value={resultRowState(r, status)}
              trailing={
                <Link className="icon-button" data-size="md" to={`/recipes/${r.id}/edit`} aria-label={t.edit(r.name)}>
                  <Icon name="edit" size={20} />
                </Link>
              }
            />
          )
        })}
      </ListGroup>
      {added.length > 0 ? (
        <div className="import-result__added">
          <h3 className="import-result__subhead">{t.alsoAdded}</h3>
          <DetailList>
            {added.map((row) => (
              <DetailRow key={row.key} label={row.label} state={row.state} detail={row.detail} />
            ))}
          </DetailList>
        </div>
      ) : null}
      <div className="import-result__actions">
        <Button variant="secondary" icon="import" onClick={onImportMore}>
          {t.importMore}
        </Button>
        <Link className="button" data-variant="secondary" data-size="md" to="/recipes">
          <Icon name="recipes" size={20} />
          {s.openRecipes}
        </Link>
      </div>
    </Tile>
  )
}
