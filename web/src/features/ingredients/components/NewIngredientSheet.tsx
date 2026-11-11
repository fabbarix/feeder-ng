import { useId, useRef, useState } from 'react'
import { BottomSheet, Button, TextField } from '../../../ui'
import type { BaseUnit } from '../../../lib/units'
import { ingredientsApi } from '../api'
import { checkNewIngredient, defaultBaseUnit, duplicateGuard, type DuplicateGuard, type NewIngredientErrors } from '../lib/newIngredient'
import { errorMessage } from '../lib/errorMessage'
import { strings } from '../strings'
import '../ingredients.css'
import type { Ingredient, NewIngredient, SearchResult } from '../types'
import { BaseUnitPicker } from './BaseUnitPicker'

export interface NewIngredientSheetProps {
  open: boolean
  onClose: () => void
  /** Rejects with ApiError; code 'name_taken' shows strings.nameTaken, 'invalid_ingredient' shows the server message. */
  onCreate: (body: NewIngredient) => Promise<unknown>
  /** R14: the name to prefill (quick create from a Recipe line). */
  initialName?: string
  /** R14: a unit already known (Recipe line, Scan); lib/newIngredient.defaultBaseUnit turns it into the preselected Base Unit. */
  unitHint?: string
  /** R14: near-duplicate lookup; default ingredientsApi.search (the matcher Import Review uses). A rejection is ignored. */
  findSimilar?: (name: string) => Promise<SearchResult>
  /** R14: offered next to "Did you mean" and "already exists"; picking calls it with the Ingredient and closes the sheet. Without it those rows only warn. */
  onUseExisting?: (ingredient: Ingredient) => void
  /** R14: when set, Create is disabled and this reason is shown (offline). */
  disabledReason?: string
}

const searchByName = (name: string) => ingredientsApi.search(name)

/** BottomSheet "New Ingredient": Name, Base Unit (g preselected, or the unit of the line), optional Shelf Life, Cancel and Create Ingredient. */
export function NewIngredientSheet(props: NewIngredientSheetProps) {
  const { open, onClose } = props
  const formId = useId()
  const [busy, setBusy] = useState(false)
  const reasonId = `${formId}-reason`
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={strings.newIngredient}
      footer={
        <div className="new-ingredient__actions">
          <Button variant="tertiary" onClick={onClose}>
            {strings.sheet.cancel}
          </Button>
          <Button type="submit" form={formId} disabled={busy || props.disabledReason !== undefined} aria-describedby={props.disabledReason ? reasonId : undefined}>
            {busy ? strings.sheet.creating : strings.createIngredient}
          </Button>
        </div>
      }
    >
      {open ? <NewIngredientForm {...props} formId={formId} reasonId={reasonId} onBusy={setBusy} /> : null}
    </BottomSheet>
  )
}

interface FormProps extends NewIngredientSheetProps {
  formId: string
  reasonId: string
  onBusy: (busy: boolean) => void
}

/** The form itself; it mounts fresh each time the sheet opens. */
function NewIngredientForm({ formId, reasonId, onBusy, onClose, onCreate, initialName = '', unitHint, findSimilar = searchByName, onUseExisting, disabledReason }: FormProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const [name, setName] = useState(initialName)
  const [baseUnit, setBaseUnit] = useState<BaseUnit>(() => defaultBaseUnit(unitHint))
  const [shelfLife, setShelfLife] = useState('')
  const [errors, setErrors] = useState<NewIngredientErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [guard, setGuard] = useState<DuplicateGuard>({ kind: 'clear' })
  const [asked, setAsked] = useState<NewIngredient | null>(null)

  const focus = (field: string) => formRef.current?.querySelector<HTMLInputElement>(`input[name="${field}"]`)?.focus()

  const create = async (body: NewIngredient) => {
    onBusy(true)
    try {
      await onCreate(body)
      onClose()
    } catch (e) {
      setServerError(errorMessage(e))
    } finally {
      onBusy(false)
    }
  }

  const submit = async () => {
    if (disabledReason) return
    setServerError(null)
    const checked = checkNewIngredient({ name, baseUnit, shelfLife })
    if (!checked.ok) {
      setErrors(checked.errors)
      focus(checked.errors.name ? 'name' : 'shelfLife')
      return
    }
    setErrors({})
    if (!asked) {
      onBusy(true)
      let found: DuplicateGuard = { kind: 'clear' }
      try {
        found = duplicateGuard(await findSimilar(checked.value.name))
      } catch {
        // The lookup only advises: a failure never blocks creating.
      }
      onBusy(false)
      if (found.kind !== 'clear') {
        setGuard(found)
        setAsked(checked.value)
        return
      }
    }
    await create(checked.value)
  }

  const edited = (set: () => void) => {
    set()
    setGuard({ kind: 'clear' })
    setAsked(null)
    setServerError(null)
    setErrors({})
  }

  const nameError = errors.name ?? (serverError === strings.nameTaken ? serverError : undefined)
  const otherError = serverError !== null && serverError !== strings.nameTaken ? serverError : null
  const typed = name.trim().split(/\s+/).filter(Boolean).join(' ')

  return (
    <form
      id={formId}
      ref={formRef}
      className="new-ingredient__form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <TextField
        label={strings.nameLabel}
        name="name"
        value={name}
        onChange={(v) => edited(() => setName(v))}
        error={nameError}
        autoComplete="off"
      />
      <BaseUnitPicker value={baseUnit} onChange={(u) => edited(() => setBaseUnit(u))} />
      <TextField
        label={strings.sheet.shelfLifeLabel}
        name="shelfLife"
        value={shelfLife}
        onChange={(v) => edited(() => setShelfLife(v))}
        suffix={strings.sheet.shelfLifeUnit}
        helper={strings.sheet.shelfLifeHelper}
        error={errors.shelfLife}
        inputMode="numeric"
        autoComplete="off"
      />
      {guard.kind === 'exists' ? (
        <div className="new-ingredient__guard" role="status">
          <p>{strings.sheet.alreadyExists(guard.ingredient.name)}</p>
          {onUseExisting ? (
            <Button
              variant="tertiary"
              onClick={() => {
                onUseExisting(guard.ingredient)
                onClose()
              }}
            >
              {strings.sheet.useExisting(guard.ingredient.name)}
            </Button>
          ) : null}
        </div>
      ) : null}
      {guard.kind === 'similar' ? (
        <div className="new-ingredient__guard" role="status">
          <p>{strings.sheet.didYouMean(guard.suggestions.map((s) => s.ingredient.name).join(', '))}</p>
          <div className="new-ingredient__guard-actions">
            {onUseExisting
              ? guard.suggestions.map((s) => (
                  <Button
                    key={s.ingredient.id}
                    variant="tertiary"
                    onClick={() => {
                      onUseExisting(s.ingredient)
                      onClose()
                    }}
                  >
                    {strings.sheet.useExisting(s.ingredient.name)}
                  </Button>
                ))
              : null}
            <Button variant="tertiary" onClick={() => asked && void create(asked)}>
              {strings.sheet.createAnyway(typed)}
            </Button>
          </div>
        </div>
      ) : null}
      {otherError ? <p role="alert" className="new-ingredient__error">{otherError}</p> : null}
      {disabledReason ? (
        <p id={reasonId} className="new-ingredient__helper">
          {disabledReason}
        </p>
      ) : null}
    </form>
  )
}
