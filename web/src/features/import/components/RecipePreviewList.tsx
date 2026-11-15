import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChoiceChip, Icon, IconButton, ListGroup, ListRow, RecipeThumb, Tile } from '../../../ui'
import { recipeRowId, recipeRowMeta, recipeRowState } from '../lib/reviewSummary'
import { importStrings as s } from '../strings'
import type { RecipeAction, RecipeStatus } from '../types'
import { RecipePreviewPanel } from './RecipePreviewPanel'
import { RowState } from './RowState'
import { RowTitle } from './RowTitle'

export interface RecipePreviewListProps {
  recipes: RecipeStatus[]
  onChoose: (index: number, action: RecipeAction) => void
}

const t = s.reviewRows
const actions: Array<{ action: RecipeAction; label: string }> = [
  { action: 'replace', label: s.replace },
  { action: 'keep_both', label: s.keepBoth },
  { action: 'skip', label: s.skip },
]

/** The Recipes that start open: the first one when the file holds one or two Recipes, none from three. */
function initiallyOpen(recipes: RecipeStatus[]): number[] {
  return recipes.length > 0 && recipes.length <= 2 ? [recipes[0]!.index] : []
}

/**
 * B9-28 (RX-01): the "Recipes" tile of Import Review. One R-E row per Recipe of the file: its name, its detail line, its state at the end and an
 * outlined expand button that shows what the file says (RecipePreviewPanel). A Recipe that already exists asks Replace, Keep both or Skip on
 * its own row. Read-only otherwise (decision RX 3).
 */
export function RecipePreviewList({ recipes, onChoose }: RecipePreviewListProps): ReactNode {
  const headingId = useId()
  const [open, setOpen] = useState<number[]>(() => initiallyOpen(recipes))
  // A panel is drawn the first time it opens and then kept (hidden while closed), so a long file does not draw every Recipe up front.
  const [drawn, setDrawn] = useState<number[]>(() => initiallyOpen(recipes))
  const skipped = recipes.filter((r) => r.action === 'skip').length
  const toggle = (index: number) => {
    setOpen((list) => (list.includes(index) ? list.filter((i) => i !== index) : [...list, index]))
    setDrawn((list) => (list.includes(index) ? list : [...list, index]))
  }
  return (
    <Tile as="section" className="recipe-preview" aria-labelledby={headingId}>
      <div className="import-tile-head">
        <h2 id={headingId}>{s.recipesTitle}</h2>
        <span className="import-tile-head__meta">{t.recipesMeta(recipes.length - skipped, skipped)}</span>
      </div>
      <ListGroup label={t.recipesList}>
        {recipes.map((r) => (
          <RecipeRow key={r.index} recipe={r} expanded={open.includes(r.index)} drawn={drawn.includes(r.index)} onToggle={() => toggle(r.index)} onChoose={onChoose} />
        ))}
      </ListGroup>
    </Tile>
  )
}

interface RecipeRowProps {
  recipe: RecipeStatus
  expanded: boolean
  /** The panel has been opened once: it stays in the page, hidden while closed. */
  drawn: boolean
  onToggle: () => void
  onChoose: (index: number, action: RecipeAction) => void
}

function RecipeRow({ recipe: r, expanded, drawn, onToggle, onChoose }: RecipeRowProps): ReactNode {
  const panelId = useId()
  const state = recipeRowState(r)
  const asks = r.status === 'conflict' && !r.resolved
  return (
    <ListRow
      title={<RowTitle question={recipeRowId(r.index)}>{r.name}</RowTitle>}
      leading={<RecipeThumb name={r.name} size={40} />}
      meta={asks ? t.alreadyExists : recipeRowMeta(r)}
      metaStatus={asks ? 'info' : undefined}
      metaIcon={asks ? 'question' : undefined}
      wrapTitle
      trailing={
        <>
          <RowState state={state} />
          <IconButton
            icon="chevron"
            className="recipe-preview__expand"
            label={expanded ? t.hide(r.name) : t.show(r.name)}
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={onToggle}
          />
        </>
      }
      footer={
        <>
          {r.status === 'conflict' ? <ConflictAnswers recipe={r} onChoose={onChoose} /> : null}
          <div id={panelId} className="recipe-preview__panel-frame" hidden={!expanded}>
            {drawn ? <RecipePreviewPanel preview={r.preview} /> : null}
          </div>
        </>
      }
      data-row="recipe"
      data-expanded-panel={expanded ? 'true' : undefined}
    />
  )
}

/** Replace, Keep both and Skip as ChoiceChips (the answer pressed, with a check), and a link to the existing Recipe in a new tab. */
function ConflictAnswers({ recipe: r, onChoose }: { recipe: RecipeStatus; onChoose: RecipeRowProps['onChoose'] }): ReactNode {
  const chosen = r.resolved ? r.action : undefined
  return (
    <div className="import-row__answers">
      <div className="import-row__choices" role="group" aria-label={t.whatToDo(r.name)}>
        {actions.map(({ action, label }) => (
          <ChoiceChip key={action} pressed={chosen === action} onClick={() => onChoose(r.index, action)}>
            {label}
          </ChoiceChip>
        ))}
      </div>
      {r.existingId !== undefined ? (
        <Link className="button" data-variant="secondary" data-size="sm" to={`/recipes/${r.existingId}`} target="_blank" rel="noopener noreferrer">
          {t.openExisting}
          <Icon name="link" size={16} />
        </Link>
      ) : null}
    </div>
  )
}
