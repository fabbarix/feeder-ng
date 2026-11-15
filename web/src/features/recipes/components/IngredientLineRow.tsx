import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { SortableItemProps } from '../../../ui'
import { Button, Checkbox, Chip, IconButton, IngredientSelect, Menu, TextField, UnitSelect } from '../../../ui'
import { BaseRecipeBadge } from './BaseRecipeBadge'
import { NeededAtMenu } from './NeededAtMenu'
import type { DraftErrors, LineDraft } from '../lib/draft'
import { needsConversion, unitChoicesOf } from '../lib/lineUnits'
import { codeMessage, recipeStrings } from '../strings'
import type { IngredientRef, RecipeStep } from '../types'

export interface IngredientLineRowProps {
  line: LineDraft
  index: number
  errors: DraftErrors
  /** The picked Ingredient (unit choices come from it), once known. */
  ingredient: IngredientRef | undefined
  /** Every Ingredient, for the IngredientSelect options (it searches and filters itself). */
  ingredients?: IngredientRef[]
  onPick: (ingredient: IngredientRef) => void
  onChange: (patch: Partial<LineDraft>) => void
  onRemove: () => void
  /** Sort-drag: the drag handle (from ui/Sortable) shown first in the Ingredient cell; omitted = not sortable. */
  handle?: ReactNode
  /** Sort-drag: spread on the `<li>` (ref, data-state, drag offset). */
  itemProps?: SortableItemProps
  /** Sort-drag: how many lines the list has, so the actions menu can disable Move up on the first and Move down on the last. */
  count?: number
  /** Sort-drag: the actions menu (Move ingredient up / down) moved the line by this many places. */
  onMove?: (delta: -1 | 1) => void
  /** R14: "Create Ingredient '<query>'" was chosen in the picker. Without it the picker has no create row. */
  onQuickCreate?: (query: string) => void
  /** R14: when set, the create row is shown disabled with this reason (offline). */
  quickCreateDisabledReason?: string
  /** R14: take focus in the Quantity field now (after a quick create); calls onAmountFocused once it has. */
  focusAmount?: boolean
  onAmountFocused?: () => void
  /** L13: take focus in the Ingredient picker now (a line just added); calls onIngredientFocused once it has. */
  focusIngredient?: boolean
  onIngredientFocused?: () => void
  /** BR-D: the Recipe's Steps, for the Needed at menu of a Base recipe line (line.baseRecipeId set). */
  steps?: ReadonlyArray<Pick<RecipeStep, 'text' | 'kind'>>
  /** BR-D: the default Needed at Step (0-based), marked "(default)"; null = unknown. */
  neededAtDefault?: number | null
  /** BR-D: a Step index = override, null = back to the default. */
  onNeededAt?: (step: number | null) => void
  /** BR-D: "Link to a Base recipe" in the actions menu of a plain line with an Ingredient. Without it the item is absent. */
  onLinkToBase?: () => void
  /** BR-D: "Use as a plain Ingredient" in the actions menu of a Base recipe line. Without it the item is absent. */
  onUseAsPlain?: () => void
  /**
   * B9-37 (RX-02): Enter in the last field of the last line: the Note, or the Quantity while the Note is hidden (a phone line without a
   * Note). The screen adds a line and puts the cursor in its picker. Without it Enter does nothing special.
   */
  onEnterLast?: () => void
}

/** The row's class names with the one the sortable adds. */
const rowClass = (base: string, itemProps: SortableItemProps | undefined, extra = '') =>
  [base, extra, itemProps?.className].filter(Boolean).join(' ')

/** The Move ingredient up / down items of the actions Menu (none without `onMove`). */
const moveItems = (index: number, count: number | undefined, onMove: ((delta: -1 | 1) => void) | undefined) =>
  onMove
    ? [
        { id: 'up', label: recipeStrings.lines.up, icon: 'moveUp' as const, disabled: index === 0, onSelect: () => onMove(-1) },
        {
          id: 'down',
          label: recipeStrings.lines.down,
          icon: 'moveDown' as const,
          disabled: count !== undefined && index >= count - 1,
          onSelect: () => onMove(1),
        },
      ]
    : []

const fieldError = (errors: DraftErrors, key: string) => (errors[key] ? codeMessage(errors[key]) : undefined)

/**
 * One ingredient line of the editor (RX-02, RX-10): the drag handle and Ingredient (IngredientSelect), Quantity (text, so "1 1/2" stays
 * typeable), Unit (UnitSelect with the Ingredient's units and a typed custom unit), Note, the Optional checkbox, then the ⋮ (Move up,
 * Move down, Add note, the Base recipe link, Remove) and the trash. One row from a 42 rem lines box; on a phone the CSS lays it out in
 * two rows and hides the Note until the line has one (`data-has-note`) and the trash (Remove is in the ⋮). A unit the Ingredient does
 * not know yet says that Feeder will ask for its Unit Conversion on save. Renders and calls back only.
 */
export function IngredientLineRow({
  line,
  index,
  errors,
  ingredient,
  ingredients = [],
  onPick,
  onChange,
  onRemove,
  handle,
  itemProps,
  count,
  onMove,
  onQuickCreate,
  quickCreateDisabledReason,
  focusAmount,
  onAmountFocused,
  focusIngredient,
  onIngredientFocused,
  steps,
  neededAtDefault,
  onNeededAt,
  onLinkToBase,
  onUseAsPlain,
  onEnterLast,
}: IngredientLineRowProps): ReactNode {
  const amountRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const noteRef = useRef<HTMLDivElement>(null)
  // "Add note" shows the Note of a line that has none (a phone hides it until then) and puts the cursor in it.
  const [noteOpen, setNoteOpen] = useState(false)
  const [focusNote, setFocusNote] = useState(false)
  useEffect(() => {
    if (!focusNote) return
    noteRef.current?.querySelector<HTMLInputElement>('input')?.focus()
    setFocusNote(false)
  }, [focusNote])
  useEffect(() => {
    if (!focusIngredient) return
    pickerRef.current?.querySelector<HTMLElement>('[role="combobox"], input, button')?.focus()
    onIngredientFocused?.()
  }, [focusIngredient, onIngredientFocused])
  useEffect(() => {
    if (!focusAmount) return
    const input = amountRef.current?.querySelector<HTMLInputElement>('input')
    input?.focus()
    input?.select()
    onAmountFocused?.()
  }, [focusAmount, onAmountFocused])

  if (line.auto && line.ingredientId === null) {
    return (
      <PendingLine
        line={line}
        index={index}
        onChange={onChange}
        onRemove={onRemove}
        handle={handle}
        itemProps={itemProps}
        count={count}
        onMove={onMove}
      />
    )
  }
  const units = ingredient ? unitChoicesOf(ingredient) : { baseUnit: line.unit, conversions: [], globalUnits: [] }
  const asks = needsConversion(line.unit, ingredient)
  const who = (line.ingredientName || ingredient?.name || '').trim() || recipeStrings.lines.lineLabel(index + 1)
  const isBase = (line.baseRecipeId ?? null) !== null
  const hasNote = line.note.trim() !== '' || noteOpen
  const linkItems = [
    ...(onLinkToBase && !isBase && line.ingredientId !== null ? [{ id: 'link', label: recipeStrings.baseRecipe.linkAction, icon: 'cook' as const, onSelect: onLinkToBase }] : []),
    ...(onUseAsPlain && isBase ? [{ id: 'plain', label: recipeStrings.baseRecipe.plainAction, icon: 'cook' as const, onSelect: onUseAsPlain }] : []),
  ]
  const noteItems = hasNote
    ? []
    : [{ id: 'note', label: recipeStrings.lines.addNote, icon: 'edit' as const, onSelect: () => (setNoteOpen(true), setFocusNote(true)) }]
  // Enter in the last field of the last line: the Note, or the Quantity while the CSS hides the Note (a phone line without one).
  const noteHidden = () => (noteRef.current ? getComputedStyle(noteRef.current).display === 'none' : false)
  const enter = (field: 'quantity' | 'note') => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !onEnterLast) return
    if (field === 'quantity' && !noteHidden()) return
    e.preventDefault()
    onEnterLast()
  }
  return (
    <li {...itemProps} className={rowClass('line-row', itemProps)} data-has-note={hasNote ? 'true' : 'false'}>
      <div className="line-row__ingredient">
        {handle ? <div className="line-row__handle">{handle}</div> : null}
        <div ref={pickerRef} className="line-row__ingredient-body">
          <IngredientSelect
            size="full"
            label={recipeStrings.lines.ingredient}
            ingredients={ingredients}
            value={line.ingredientId}
            error={fieldError(errors, `lines.${index}.ingredient`)}
            onCreate={onQuickCreate}
            createDisabledReason={onQuickCreate ? quickCreateDisabledReason : undefined}
            onChange={(id) => {
              const picked = ingredients.find((ing) => ing.id === id)
              if (picked) onPick(picked)
            }}
          />
          {isBase ? <BaseRecipeBadge /> : null}
        </div>
        {isBase && steps && onNeededAt ? (
          <NeededAtMenu
            steps={steps}
            value={line.neededAtStep ?? neededAtDefault ?? 0}
            defaultStep={neededAtDefault ?? null}
            lineName={line.baseRecipeName || line.ingredientName}
            onChange={onNeededAt}
          />
        ) : null}
      </div>
      <div ref={amountRef} className="line-row__quantity">
        <TextField
          size="xs"
          label={recipeStrings.lines.quantity}
          inputMode="decimal"
          enterKeyHint={onEnterLast ? 'next' : undefined}
          helper={line.auto && line.quantity.trim() === '' && line.ingredientId !== null ? recipeStrings.lines.packSizeHint : undefined}
          value={line.quantity}
          error={fieldError(errors, `lines.${index}.quantity`)}
          onChange={(quantity) => onChange({ quantity })}
          onKeyDown={enter('quantity')}
        />
      </div>
      <div className="line-row__unit">
        <UnitSelect
          size="sm"
          label={recipeStrings.lines.unit}
          units={units}
          value={line.unit || null}
          disabled={!ingredient}
          error={fieldError(errors, `lines.${index}.unit`)}
          onChange={(unit) => onChange({ unit })}
          onCreate={(unit) => onChange({ unit })}
          createLabel={recipeStrings.lines.useUnit}
        />
      </div>
      {asks ? <p className="line-row__hint">{recipeStrings.lines.unitNeedsConversion(line.unit)}</p> : null}
      {/* data-size-intent="inline": the Note is one cell of a one-row line (the chapter's minmax(6rem, 1fr) track), not a lone text field (P5). */}
      <div ref={noteRef} className="line-row__note" data-size-intent="inline">
        <TextField size="full" label={recipeStrings.lines.note} placeholder="note" value={line.note} onChange={(note) => onChange({ note })} onKeyDown={enter('note')} />
      </div>
      <div className="line-row__optional">
        <Checkbox
          label={recipeStrings.lines.optional}
          ariaLabel={recipeStrings.lines.optionalLine(who)}
          checked={line.optional}
          onChange={(optional) => onChange({ optional })}
        />
      </div>
      <div className="line-row__remove">
        <Menu
          label={recipeStrings.lines.actions(who)}
          items={[
            ...moveItems(index, count, onMove),
            ...noteItems,
            ...linkItems,
            { id: 'remove', label: recipeStrings.lines.removeLine(who), icon: 'delete' as const, onSelect: onRemove },
          ]}
        />
        <span className="line-row__trash">
          <IconButton icon="delete" label={recipeStrings.lines.removeLine(who)} onClick={onRemove} />
        </span>
      </div>
    </li>
  )
}

/**
 * The Ready Meal's pack when its Ingredient does not exist yet: a read-only summary. Feeder makes the Ingredient when the Recipe is saved.
 * "Choose another Ingredient" turns the line into an ordinary blank one.
 */
function PendingLine({
  line,
  index,
  onChange,
  onRemove,
  handle,
  itemProps,
  count,
  onMove,
}: Pick<IngredientLineRowProps, 'line' | 'index' | 'onChange' | 'onRemove' | 'handle' | 'itemProps' | 'count' | 'onMove'>): ReactNode {
  const text = recipeStrings.readyMealIngredient
  const who = line.ingredientName.trim() || recipeStrings.lines.lineLabel(index + 1)
  return (
    <li {...itemProps} className={rowClass('line-row', itemProps, 'line-row--pending')}>
      <div className="line-row__ingredient">
        {handle ? <div className="line-row__handle">{handle}</div> : null}
        <div className="line-row__pending-body">
          <p className="line-row__pending-name">
            <strong>{line.ingredientName}</strong> <Chip kind="state">{text.newBadge}</Chip>
          </p>
          <p className="line-row__pending-amount">
            {line.quantity} {line.unit}
          </p>
          <p className="line-row__hint">{text.helper(line.ingredientName)}</p>
          <Button
            variant="secondary"
            onClick={() =>
              onChange({
                auto: false,
                ingredientName: '',
                quantity: '',
                unit: '',
              })
            }
          >
            {text.changeIngredient}
          </Button>
        </div>
      </div>
      <div className="line-row__remove">
        {onMove ? <Menu label={recipeStrings.lines.actions(who)} items={moveItems(index, count, onMove)} /> : null}
        <IconButton icon="delete" label={recipeStrings.lines.removeLine(who)} onClick={onRemove} />
      </div>
    </li>
  )
}
