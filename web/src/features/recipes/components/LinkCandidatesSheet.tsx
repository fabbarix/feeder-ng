import type { ReactNode } from 'react'
import { Button, Checkbox, Dialog } from '../../../ui'
import { useLinkCandidates } from '../../../lib/baseRecipes/useLinkCandidates'
import { recipeStrings } from '../strings'

export interface LinkCandidatesSheetProps {
  open: boolean
  baseRecipe: { id: number; name: string; baseUnit: string; ingredientId: number }
  onClose: () => void
}

/**
 * BR-D (design §3.8): "N Recipes use an Ingredient named X. Link them to this Base recipe?" with a crafted Checkbox per line ("Lasagne · 500 ml béchamel"), nothing ticked,
 * disabled rows with their reasons, "Link N" and "Not now"; then the merge offer step ("Merge" / "Keep it"). Never silent: with no candidates it shows nothing and closes.
 */
export function LinkCandidatesSheet(props: LinkCandidatesSheetProps): ReactNode {
  if (!props.open) return null
  return <CandidatesBody {...props} />
}

function CandidatesBody({ baseRecipe, onClose }: LinkCandidatesSheetProps): ReactNode {
  const s = useLinkCandidates({
    baseRecipeId: baseRecipe.id,
    baseName: baseRecipe.name,
    baseUnit: baseRecipe.baseUnit,
    baseIngredientId: baseRecipe.ingredientId,
    onDone: onClose,
  })
  const t = recipeStrings.baseRecipe.links

  // With no candidates there is nothing to show; the hook has closed the sheet.
  if (s.status === 'ready' && s.rows.length === 0 && s.step === 'pick') return null

  if (s.step === 'merge' && s.offer) {
    return (
      <Dialog
        open
        onClose={onClose}
        title={s.offer.title}
        actions={
          <>
            <Button variant="tertiary" onClick={s.keep}>
              {t.keepIt}
            </Button>
            <Button variant="primary" onClick={() => void s.merge()}>
              {t.merge}
            </Button>
          </>
        }
      >
        <p>{s.offer.body}</p>
        {s.mergeIssue ? <p className="line-row__hint">{s.mergeIssue}</p> : null}
      </Dialog>
    )
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={s.status === 'ready' ? s.heading : recipeStrings.baseRecipe.picker.loading}
      actions={
        <>
          <Button variant="tertiary" onClick={s.notNow}>
            {t.notNow}
          </Button>
          <Button variant="primary" disabled={!s.canLink} onClick={() => void s.link()}>
            {s.linkLabel}
          </Button>
        </>
      }
    >
      {s.status === 'error' ? <p className="line-row__hint">{recipeStrings.baseRecipe.links.nothingTicked}</p> : null}
      {s.rows.map((row) => (
        <div key={row.lineId} className="link-candidate">
          <Checkbox label={row.label} description={row.reason} checked={row.checked} disabled={row.disabled} onChange={() => s.toggle(row.lineId)} />
          {row.archived ? <span className="link-candidate__archived">{recipeStrings.baseRecipe.links.archived}</span> : null}
        </div>
      ))}
      {s.error ? <p className="line-row__hint">{s.error}</p> : null}
    </Dialog>
  )
}
