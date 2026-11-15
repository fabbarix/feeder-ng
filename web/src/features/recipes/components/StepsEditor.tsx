import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Button, Chip, ChoiceChip, Icon, IconButton, IngredientSelect, Menu, Segmented, Sortable, TextArea, TextField, UnitSelect } from '../../../ui'
import { DurationField } from '../../../ui/fields/DurationField'
import type { DraftErrors, StepDraft, UseDraft } from '../lib/draft'
import { numberText, numberValue } from '../lib/draft'
import { afterOptions, changeKind, moveStep, newStepDraft, removeStep, toggleAfter } from '../lib/steps'
import { needsConversion, unitChoicesOf } from '../lib/lineUnits'
import { addUse, removeUse, setStepImage, updateUse, useChipText } from '../lib/stepUses'
import { codeMessage, recipeStrings } from '../strings'
import { StepPhoto } from './StepPhoto'
import type { IngredientRef, StepKind } from '../types'

export interface StepsEditorProps {
  steps: StepDraft[]
  errors: DraftErrors
  onChange: (steps: StepDraft[]) => void
  /** Every Ingredient, for the uses (IngredientSelect + UnitSelect). */
  ingredients?: IngredientRef[]
  /** PE: a Step's photo picker started or stopped uploading (the editor holds Save), by the Step's key. */
  onPhotoBusyChange?: (stepKey: string, busy: boolean) => void
  /** SAFE-10: Remove Step calls it instead of onChange (the screen removes the Step and offers Undo). Without it, onChange as before. */
  onRemoveStep?: (index: number) => void
  /** SAFE-10: the same for Remove ingredient use. */
  onRemoveUse?: (stepIndex: number, useIndex: number) => void
}

const t = recipeStrings.steps

const kindOptions: { value: StepKind; label: string; ariaLabel?: string }[] = [
  { value: 'active', label: t.active },
  { value: 'passive', label: t.passive },
  // B9-37 (RX-02): "Advance" on screen so the compact control never wraps; the name stays "Advance Step".
  { value: 'advance', label: t.advanceShort, ariaLabel: t.advance },
]

/** Step-level problems with no field of their own (SAFE-04: the text, Duration and Lead time show theirs under the field). */
const STEP_FIELDS = ['kind', 'after']

/** Focus wanted after the next render: an open use's Ingredient picker or Quantity, a use's chip, or a new Step's text. */
type FocusRequest = { useKey: string; field: 'picker' | 'quantity' | 'chip' } | { stepKey: string; field: 'text' }

/** Focus moving to `next` stays with the open use while it goes inside the row or into a list the row opened (a popover or a sheet). */
const staysWithRow = (row: HTMLElement, next: EventTarget | null) =>
  next instanceof Element && (row.contains(next) || next.closest('dialog, [role="dialog"], [popover]') !== null)

function focusTarget(root: HTMLElement, want: FocusRequest): HTMLElement | null | undefined {
  if (want.field === 'text') return root.querySelector<HTMLElement>(`li[data-focus-key="${want.stepKey}"] textarea`)
  if (want.field === 'chip') return root.querySelector<HTMLElement>(`[data-use-key="${want.useKey}"] .use-chip__edit`)
  const row = root.querySelector<HTMLElement>(`[data-use-row="${want.useKey}"]`)
  return want.field === 'picker' ? row?.querySelector<HTMLElement>('[role="combobox"]') : row?.querySelector<HTMLInputElement>('.use-row__quantity input')
}

/**
 * The Steps editor (RX-02): one compact card per Step. The lead column holds the number and the drag handle; the body the text, one
 * timing row (the compact kind Segmented and a DurationField), "After" chips when there are earlier Steps, then a chip row: each
 * Ingredient use as a chip with its own remove, and the ChoiceChips "Ingredient use" and "Photo". A use's fields open under the chips
 * (one at a time); a Photo picker shows only once a Step has a Photo or "Add Photo" was pressed. The actions (⋮ and Remove Step) end the
 * card; on a phone the CSS hides the trash, and Remove Step is in the ⋮. Add Step puts the cursor in the new Step's text. Every change
 * goes through lib/steps and lib/stepUses; the state here is only which use is open, which Steps show a picker and where focus goes.
 */
export function StepsEditor({ steps, errors, onChange, ingredients = [], onPhotoBusyChange, onRemoveStep, onRemoveUse }: StepsEditorProps): ReactNode {
  const listRef = useRef<HTMLDivElement>(null)
  const [openUse, setOpenUse] = useState<string | null>(null)
  const [photoShown, setPhotoShown] = useState<ReadonlySet<string>>(new Set())
  const [focus, setFocus] = useState<FocusRequest | null>(null)

  useEffect(() => {
    if (!focus || !listRef.current) return
    const target = focusTarget(listRef.current, focus)
    target?.focus()
    if (target instanceof HTMLInputElement) target.select()
    setFocus(null)
  }, [focus])

  const fieldError = (i: number, field: string) => (errors[`steps.${i}.${field}`] ? codeMessage(errors[`steps.${i}.${field}`]!) : undefined)
  const patch = (i: number, change: Partial<StepDraft>) => onChange(steps.map((s, j) => (j === i ? { ...s, ...change } : s)))
  const patchUse = (i: number, j: number, change: Partial<UseDraft>) => onChange(updateUse(steps, i, j, change))
  const pickUse = (i: number, j: number, ing: IngredientRef) => {
    const key = steps[i]?.uses[j]?.key
    patchUse(i, j, { ingredientId: ing.id, ingredientName: ing.name, unit: ing.baseUnit })
    if (key) setFocus({ useKey: key, field: 'quantity' })
  }
  const addUseTo = (i: number) => {
    const next = addUse(steps, i)
    const added = next[i]?.uses.at(-1)
    onChange(next)
    if (added) {
      setOpenUse(added.key)
      setFocus({ useKey: added.key, field: 'picker' })
    }
  }
  const addStep = () => {
    const added = newStepDraft()
    onChange([...steps, added])
    setFocus({ stepKey: added.key, field: 'text' })
  }
  const closeUse = (key: string, refocus: boolean) => {
    setOpenUse((current) => (current === key ? null : current))
    if (refocus) setFocus({ useKey: key, field: 'chip' })
  }
  const useHasError = (i: number, j: number) => Object.keys(errors).some((k) => k.startsWith(`steps.${i}.uses.${j}.`))
  const removeStepAt = (i: number) => (onRemoveStep ? onRemoveStep(i) : onChange(removeStep(steps, i)))

  /** Step-level problems; the fields of a use show their own. */
  const errorsFor = (i: number): string[] =>
    STEP_FIELDS.map((field) => errors[`steps.${i}.${field}`]).filter((code): code is string => code !== undefined)

  return (
    <div className="steps-editor" ref={listRef}>
      {steps.length === 0 ? <p className="steps-editor__empty">{t.empty}</p> : null}
      <Sortable
        as="ol"
        className="steps-editor__list"
        items={steps}
        getKey={(s) => s.key}
        getLabel={(_, i) => t.reorder(i + 1)}
        onReorder={(from, to) => onChange(moveStep(steps, from, to))}
        renderItem={(s, { index: i, position, positionOf, handle, itemProps }) => {
          const afterChoices = afterOptions(steps, i)
          const showsPhoto = s.image !== '' || photoShown.has(s.key)
          const nameOf = (u: UseDraft) => ingredients.find((ing) => ing.id === u.ingredientId)?.name
          const isOpen = (u: UseDraft, j: number) => u.key === openUse || useHasError(i, j)
          return (
            <li {...itemProps} className={`step-card ${itemProps.className ?? ''}`.trim()} data-focus-key={s.key}>
              <div className="step-card__lead">
                <span className="step-card__number" data-step-number="">
                  {position + 1}
                </span>
                {handle}
              </div>
              <div className="step-card__body">
                <TextArea label={t.text} rows={2} value={s.text} error={fieldError(i, 'text')} onChange={(text) => patch(i, { text })} />
                <div className="step-card__timing">
                  <Segmented compact labelHidden label={t.kindOf(position + 1)} options={kindOptions} value={s.kind} onChange={(kind) => onChange(changeKind(steps, i, kind))} />
                  {s.kind === 'advance' ? (
                    <DurationField
                      label={t.lead}
                      units={['min', 'h', 'd']}
                      error={fieldError(i, 'leadTimeMinutes')}
                      value={numberValue(s.leadTimeMinutes)}
                      onChange={(n) => patch(i, { leadTimeMinutes: numberText(n) })}
                    />
                  ) : (
                    <DurationField
                      label={t.duration}
                      error={fieldError(i, 'durationMinutes')}
                      value={numberValue(s.durationMinutes)}
                      onChange={(n) => patch(i, { durationMinutes: numberText(n) })}
                    />
                  )}
                </div>
                {afterChoices.length > 0 ? (
                  <div role="group" aria-label={t.after} className="step-card__after">
                    <span className="step-card__label">{t.after}</span>
                    {afterChoices.map((j) => (
                      <Chip key={j} kind="filter" selected={s.after.includes(j)} onClick={() => onChange(toggleAfter(steps, i, j, !s.after.includes(j)))}>
                        {t.afterStep(positionOf(j) + 1)}
                      </Chip>
                    ))}
                  </div>
                ) : null}
                <div className="step-card__extras">
                <ul className="step-card__more">
                  {s.uses.map((u, j) => (
                    <UseChip
                      key={u.key}
                      use={u}
                      text={useChipText(u, nameOf(u), t.useChip)}
                      open={isOpen(u, j)}
                      onToggle={() => setOpenUse((current) => (current === u.key ? null : u.key))}
                      onRemove={() => {
                        if (openUse === u.key) setOpenUse(null)
                        if (onRemoveUse) onRemoveUse(i, j)
                        else onChange(removeUse(steps, i, j))
                      }}
                    />
                  ))}
                  <li className="step-card__adds">
                    <ChoiceChip variant="outline" icon="add" label={t.addUse} onClick={() => addUseTo(i)}>
                      {t.useChip}
                    </ChoiceChip>
                    {showsPhoto ? null : (
                      <ChoiceChip variant="outline" icon="camera" label={t.addPhoto} onClick={() => setPhotoShown((cur) => new Set(cur).add(s.key))}>
                        {t.photoChip}
                      </ChoiceChip>
                    )}
                  </li>
                </ul>
                {showsPhoto ? (
                  <StepPhoto
                    imageId={s.image}
                    onChange={(id) => onChange(setStepImage(steps, i, id))}
                    onBusyChange={onPhotoBusyChange ? (busy) => onPhotoBusyChange(s.key, busy) : undefined}
                  />
                ) : null}
                </div>
                {s.uses.map((u, j) =>
                  isOpen(u, j) ? (
                    <UseRow
                      key={u.key}
                      use={u}
                      ingredients={ingredients}
                      errors={errors}
                      index={{ step: i, use: j }}
                      onPick={(ing) => pickUse(i, j, ing)}
                      onChange={(change) => patchUse(i, j, change)}
                      onClose={(refocus) => closeUse(u.key, refocus)}
                    />
                  ) : null,
                )}
                {errorsFor(i).map((code) => (
                  <p key={code} className="step-card__error">
                    {codeMessage(code)}
                  </p>
                ))}
              </div>
              <div className="step-card__actions">
                <Menu
                  label={t.actions}
                  items={[
                    { id: 'up', label: t.up, icon: 'moveUp', disabled: i === 0, onSelect: () => onChange(moveStep(steps, i, i - 1)) },
                    { id: 'down', label: t.down, icon: 'moveDown', disabled: i === steps.length - 1, onSelect: () => onChange(moveStep(steps, i, i + 1)) },
                    { id: 'remove', label: t.remove, icon: 'delete', onSelect: () => removeStepAt(i) },
                  ]}
                />
                <span className="step-card__remove">
                  <IconButton icon="delete" label={t.remove} onClick={() => removeStepAt(i)} />
                </span>
              </div>
            </li>
          )
        }}
      />
      <Button variant="secondary" icon="add" onClick={addStep}>
        {t.add}
      </Button>
    </div>
  )
}

interface UseChipProps {
  use: UseDraft
  text: string
  open: boolean
  onToggle: () => void
  onRemove: () => void
}

/** One use as a chip: the chip is a button that opens the use's fields; the × beside it, inside the chip, removes it. Two buttons, each with its own ring. */
function UseChip({ use, text, open, onToggle, onRemove }: UseChipProps): ReactNode {
  return (
    <li className="use-chip" data-use="" data-focus-scope="" data-use-key={use.key} data-open={open || undefined}>
      <button type="button" className="use-chip__edit" aria-expanded={open} onClick={onToggle}>
        {text}
      </button>
      <button type="button" className="use-chip__remove" aria-label={t.removeUse} onClick={onRemove}>
        <Icon name="close" size={16} />
      </button>
    </li>
  )
}

interface UseRowProps {
  use: UseDraft
  ingredients: IngredientRef[]
  errors: DraftErrors
  index: { step: number; use: number }
  onPick: (ingredient: IngredientRef) => void
  onChange: (change: Partial<UseDraft>) => void
  /** Enter (refocus: the chip takes the cursor back) or the cursor leaving the row (refocus false). */
  onClose: (refocus: boolean) => void
}

/** The open use: Ingredient, quantity (text, fractions typeable) and unit in one row, and a hint for a unit the Ingredient does not know. */
function UseRow({ use, ingredients, errors, index, onPick, onChange, onClose }: UseRowProps): ReactNode {
  const ingredient = ingredients.find((ing) => ing.id === use.ingredientId)
  const base = `steps.${index.step}.uses.${index.use}`
  const asks = needsConversion(use.unit, ingredient)
  const err = (f: string) => (errors[`${base}.${f}`] ? codeMessage(errors[`${base}.${f}`]!) : undefined)
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!staysWithRow(e.currentTarget, e.relatedTarget)) onClose(false)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
      e.preventDefault()
      onClose(true)
    }
  }
  return (
    <div className="use-row" data-use-row={use.key} onBlur={onBlur} onKeyDown={onKeyDown}>
      <div className="use-row__ingredient">
        <IngredientSelect
          size="full"
          label={t.useIngredient}
          ingredients={ingredients}
          value={use.ingredientId}
          error={err('ingredient')}
          onChange={(id) => {
            const picked = ingredients.find((ing) => ing.id === id)
            if (picked) onPick(picked)
          }}
        />
      </div>
      <div className="use-row__quantity">
        <TextField size="xs" label={t.useQuantity} inputMode="decimal" value={use.quantity} error={err('quantity')} onChange={(quantity) => onChange({ quantity })} />
      </div>
      <div className="use-row__unit">
        <UnitSelect
          size="sm"
          label={t.useUnit}
          units={ingredient ? unitChoicesOf(ingredient) : { baseUnit: use.unit, conversions: [], globalUnits: [] }}
          value={use.unit || null}
          disabled={!ingredient}
          error={err('unit')}
          onChange={(unit) => onChange({ unit })}
          onCreate={(unit) => onChange({ unit })}
          createLabel={recipeStrings.lines.useUnit}
        />
      </div>
      {asks ? <p className="use-row__hint">{recipeStrings.lines.unitNeedsConversion(use.unit)}</p> : null}
    </div>
  )
}
