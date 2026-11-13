import { useId, useRef, useState } from 'react'
import { BottomSheet, Button, CROP_ASPECTS, ImagePicker, Segmented, TextField } from '../../../ui'
import { baseUnitLabel, type BaseUnit } from '../../../lib/units'
import { ingredientsApi } from '../api'
import { errorMessage } from '../lib/errorMessage'
import { baseUnitAfterKindChange, checkKindIngredient, defaultBaseUnit, duplicateGuard, type DuplicateGuard, type KindIngredientErrors } from '../lib/newIngredient'
import { wordsFor } from '../lib/kind'
import { strings } from '../strings'
import '../ingredients.css'
import type { Ingredient, IngredientKind, NewIngredient, SearchResult } from '../types'
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
  /** R14: near-duplicate lookup in one kind; default ingredientsApi.search (the matcher Import Review uses). A rejection is ignored. */
  findSimilar?: (name: string) => Promise<SearchResult>
  /** R14: offered next to "Did you mean" and "already exists"; picking calls it with the Ingredient and closes the sheet. Without it those rows only warn. */
  onUseExisting?: (ingredient: Ingredient) => void
  /** R14: when set, Create is disabled and this reason is shown (offline). */
  disabledReason?: string
  /** H5: the kind the sheet opens on (food when left out). */
  kind?: IngredientKind
  /** H5: offers the Food | Supply choice; off, the sheet is fixed to `kind` (a catalogue list). */
  chooseKind?: boolean
}

const KIND_OPTIONS: Array<{ value: IngredientKind; label: string }> = [
  { value: 'food', label: strings.kind.food },
  { value: 'supply', label: strings.kind.supply },
]

/** BottomSheet "New Ingredient" (or "New Supply"): a Food | Supply choice where both are allowed, Name, Base Unit, then Shelf Life (food) or Restock level (Supply), Picture, Cancel and Create. */
export function NewIngredientSheet(props: NewIngredientSheetProps) {
  const { open, onClose } = props
  const initialKind = props.kind ?? 'food'
  const formId = useId()
  const [busy, setBusy] = useState(false)
  // PE: Create waits for a Picture that is still uploading.
  const [pictureBusy, setPictureBusy] = useState(false)
  const [kind, setKind] = useState<IngredientKind>(initialKind)
  const reasonId = `${formId}-reason`
  // The sheet opens on its kind each time: a close (from the sheet itself) puts the choice back.
  const close = () => {
    setKind(initialKind)
    onClose()
  }
  const words = wordsFor(kind)
  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={kind === 'supply' ? strings.newSupply : strings.newIngredient}
      footer={
        <div className="new-ingredient__actions">
          <Button variant="tertiary" onClick={close}>
            {strings.sheet.cancel}
          </Button>
          <Button type="submit" form={formId} disabled={busy || pictureBusy || props.disabledReason !== undefined} aria-describedby={props.disabledReason ? reasonId : undefined}>
            {busy ? strings.sheet.creating : words.createLabel}
          </Button>
        </div>
      }
    >
      {open ? (
        <NewIngredientForm
          {...props}
          onClose={close}
          kind={kind}
          onKind={setKind}
          chooseKind={props.chooseKind ?? false}
          formId={formId}
          reasonId={reasonId}
          onBusy={setBusy}
          onPictureBusy={setPictureBusy}
        />
      ) : null}
    </BottomSheet>
  )
}

interface FormProps extends NewIngredientSheetProps {
  kind: IngredientKind
  onKind: (kind: IngredientKind) => void
  chooseKind: boolean
  formId: string
  reasonId: string
  onBusy: (busy: boolean) => void
  onPictureBusy: (busy: boolean) => void
}

/** The form itself; it mounts fresh each time the sheet opens. */
function NewIngredientForm({ formId, reasonId, onBusy, onPictureBusy, onClose, onCreate, initialName = '', unitHint, findSimilar, onUseExisting, disabledReason, kind, onKind, chooseKind }: FormProps) {
  // The default lookup stays inside the kind being created (a Supply is never offered as "Use ..." for food).
  const lookup = findSimilar ?? ((name: string) => ingredientsApi.search(name, undefined, kind))
  const formRef = useRef<HTMLFormElement>(null)
  const [name, setName] = useState(initialName)
  const [baseUnit, setBaseUnit] = useState<BaseUnit>(() => (kind === 'supply' ? 'piece' : defaultBaseUnit(unitHint)))
  const [shelfLife, setShelfLife] = useState('')
  const [restock, setRestock] = useState('')
  const [image, setImage] = useState('')
  const [errors, setErrors] = useState<KindIngredientErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [guard, setGuard] = useState<DuplicateGuard>({ kind: 'clear' })
  const [working, setWorking] = useState(false)
  const [asked, setAsked] = useState<NewIngredient | null>(null)

  const focus = (field: string) => formRef.current?.querySelector<HTMLInputElement>(`input[name="${field}"]`)?.focus()

  const create = async (body: NewIngredient) => {
    onBusy(true)
    setWorking(true)
    try {
      await onCreate(image ? { ...body, image } : body)
      onClose()
    } catch (e) {
      setServerError(errorMessage(e))
    } finally {
      onBusy(false)
      setWorking(false)
    }
  }

  const submit = async () => {
    if (disabledReason) return
    setServerError(null)
    const checked = checkKindIngredient({ name, baseUnit, shelfLife, kind, restock })
    if (!checked.ok) {
      setErrors(checked.errors)
      focus(checked.errors.name ? 'name' : checked.errors.shelfLife ? 'shelfLife' : 'restock')
      return
    }
    setErrors({})
    if (!asked) {
      onBusy(true)
      let found: DuplicateGuard = { kind: 'clear' }
      try {
        found = duplicateGuard(await lookup(checked.value.name))
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
  const isFood = kind === 'food'

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
      {chooseKind ? (
        <Segmented
          label={strings.kind.label}
          options={KIND_OPTIONS}
          value={kind}
          onChange={(next) =>
            edited(() => {
              onKind(next)
              setBaseUnit((current) => baseUnitAfterKindChange(next, current))
            })
          }
        />
      ) : null}
      <TextField
        label={strings.nameLabel}
        name="name"
        value={name}
        onChange={(v) => edited(() => setName(v))}
        error={nameError}
        autoComplete="off"
      />
      <BaseUnitPicker disabled={working} value={baseUnit} onChange={(u) => edited(() => setBaseUnit(u))} />
      {isFood ? (
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
      ) : (
        <TextField
          label={strings.restock.label}
          name="restock"
          value={restock}
          onChange={(v) => edited(() => setRestock(v))}
          suffix={baseUnitLabel(baseUnit, 'metric')}
          helper={strings.restock.helper}
          error={errors.restock}
          inputMode="decimal"
          autoComplete="off"
        />
      )}
      <ImagePicker label={strings.sheet.pictureLabel} value={image} onChange={setImage} onBusyChange={onPictureBusy} aspect={CROP_ASPECTS.landscape} listenOn="dialog" />
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
