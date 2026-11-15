import { useId, useRef, type ReactNode } from 'react'
import { Button, EditableStepper, FormActions, Tile, useToast } from '../../../ui'
import { FormError } from '../../../ui/fields/FormError'
import { useFocusFirstInvalid } from '../../../ui/fields/useFocusFirstInvalid'
import { baseUnitLabel, type UnitSystem } from '../../../lib/units'
import type { UseKeepingForm } from '../hooks/useKeepingForm'
import { MAX_SHELF_LIFE_DAYS } from '../lib/conversionForm'
import { baseUnitHint, restockNumber, restockStep, shelfLifeHint } from '../lib/keeping'
import { restockSummary } from '../lib/kind'
import { displayName } from '../lib/names'
import { strings } from '../strings'
import type { IngredientKind } from '../types'
import { BaseUnitPicker } from './BaseUnitPicker'
import '../ingredients.css'

export interface KeepingTileProps {
  kind: IngredientKind
  /** The stored name; the toast after a save shows its display form. */
  name: string
  form: UseKeepingForm
  /** While above 0 the Base Unit is shown as a value with its reason, not as the picker. */
  referenceCount: number
  system: UnitSystem
}

/**
 * SET-05: the one "Keeping" tile. Rows of a label and hint at the start and the control at the end: Base Unit, then Shelf Life and
 * Frozen Shelf Life (food) or Restock level (a Supply), each a "type or step" control. One Save changes (the page's only accent),
 * a Cancel while there are changes, errors at their field, a refusal as the one FormError. It never calls the API: form.submit does.
 */
export function KeepingTile({ kind, name, form, referenceCount, system }: KeepingTileProps) {
  const ids = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const toast = useToast()
  useFocusFirstInvalid(formRef, form.errors, form.submitCount)
  const { draft } = form
  const headingId = `${ids}-heading`
  const noChangesId = `${ids}-no-changes`
  const locked = referenceCount > 0
  const saved = form.saved

  const submit = async () => {
    const wasDirty = form.dirty
    if ((await form.submit()) && wasDirty) toast.show(strings.keeping.saved(displayName(name)))
  }

  const restockValue = restockNumber(draft.restockText)
  return (
    <Tile as="section" span="full" aria-labelledby={headingId} className="kp">
      <h2 id={headingId}>{strings.keeping.title}</h2>
      <form
        ref={formRef}
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <KeepingRow id={`${ids}-base`} label={strings.baseUnitLabel} hint={locked ? baseUnitHint(referenceCount) : strings.sheet.baseUnitHelper}>
          {(labelId, hintId) =>
            locked ? (
              <span className="kp-value" data-testid="base-unit-value">
                {draft.baseUnit}
              </span>
            ) : (
              <BaseUnitPicker value={draft.baseUnit} onChange={form.setBaseUnit} bare={{ labelledBy: labelId, describedBy: hintId }} />
            )
          }
        </KeepingRow>

        {kind === 'food' ? (
          <>
            <DaysRow
              id={`${ids}-shelf`}
              label={strings.shelfLifeLabel}
              hint={shelfLifeHint('shelfLife', saved.shelfLifeDays ?? null, draft.shelfLifeDays)}
              value={draft.shelfLifeDays}
              onChange={form.setShelfLife}
              error={form.errors.shelfLife}
            />
            <DaysRow
              id={`${ids}-frozen`}
              label={strings.frozenShelfLifeLabel}
              hint={shelfLifeHint('frozen', saved.frozenShelfLifeDays ?? null, draft.frozenShelfLifeDays)}
              value={draft.frozenShelfLifeDays}
              onChange={form.setFrozenShelfLife}
              error={form.errors.frozenShelfLife}
            />
          </>
        ) : (
          <KeepingRow
            id={`${ids}-restock`}
            label={strings.restock.label}
            hint={restockSummary(restockValue ?? null, draft.baseUnit, system)}
            error={form.errors.restock}
          >
            {(_labelId, describedBy) => (
              <>
                <EditableStepper
                  decimal
                  name="restock"
                  label={strings.restock.label}
                  value={restockValue}
                  onChange={(v) => form.setRestockText(v === null ? '' : String(v))}
                  unit={baseUnitLabel(draft.baseUnit, 'metric', restockValue ?? undefined)}
                  min={1}
                  step={restockStep(draft.baseUnit)}
                  start={restockStep(draft.baseUnit)}
                  placeholder={strings.keeping.notSet}
                  describedBy={describedBy}
                  invalid={Boolean(form.errors.restock)}
                />
                {draft.restockText !== '' ? <ClearButton row={strings.restock.label} onClear={() => form.setRestockText('')} /> : null}
              </>
            )}
          </KeepingRow>
        )}

        <FormError>{form.failure}</FormError>
        <div className="kp-actions">
          <FormActions
            tertiary={
              form.dirty ? (
                <Button variant="secondary" block="phone" onClick={form.cancel}>
                  {strings.keeping.cancel}
                </Button>
              ) : undefined
            }
            primary={
              <Button
                type="submit"
                variant="primary"
                block="phone"
                disabled={!form.dirty}
                loading={form.saving}
                aria-describedby={form.dirty ? undefined : noChangesId}
              >
                {strings.keeping.save}
              </Button>
            }
          />
          {form.dirty ? null : (
            <span id={noChangesId} className="visually-hidden">
              {strings.keeping.noChanges}
            </span>
          )}
        </div>
      </form>
    </Tile>
  )
}

interface KeepingRowProps {
  id: string
  label: string
  hint?: string
  error?: string
  /** The control, given the row label's id and what describes it (the hint, then the error). */
  children: (labelId: string, describedBy: string | undefined) => ReactNode
}

/** One Keeping row: the label (body-strong) and the hint (meta, muted) at the start, the control at the end, the error under both. */
function KeepingRow({ id, label, hint, error, children }: KeepingRowProps) {
  const labelId = `${id}-label`
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  return (
    <div className="kp-row" data-invalid={error ? '' : undefined}>
      <div className="kp-row__text">
        <span id={labelId} className="kp-row__label">
          {label}
        </span>
        {hint ? (
          <p id={hintId} className="kp-row__hint">
            {hint}
          </p>
        ) : null}
      </div>
      <div className="kp-row__ctrl">{children(labelId, describedBy)}</div>
      {error ? (
        <p id={errorId} className="ui-field__error kp-row__error">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function DaysRow({ id, label, hint, value, onChange, error }: { id: string; label: string; hint?: string; value: number | null; onChange: (days: number | null) => void; error?: string }) {
  return (
    <KeepingRow id={id} label={label} hint={hint} error={error}>
      {(_labelId, describedBy) => (
        <>
          <EditableStepper
            label={label}
            value={value}
            onChange={onChange}
            unit={strings.keeping.days}
            min={1}
            max={MAX_SHELF_LIFE_DAYS}
            placeholder={strings.keeping.notSet}
            describedBy={describedBy}
            invalid={Boolean(error)}
          />
          {value !== null ? <ClearButton row={label} onClear={() => onChange(null)} /> : null}
        </>
      )}
    </KeepingRow>
  )
}

function ClearButton({ row, onClear }: { row: string; onClear: () => void }) {
  return (
    <Button variant="secondary" size="sm" aria-label={strings.keeping.clearLabel(row)} onClick={onClear}>
      {strings.keeping.clear}
    </Button>
  )
}
