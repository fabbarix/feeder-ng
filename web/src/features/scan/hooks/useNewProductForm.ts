// The state and the steps of the new-Product sheet (SR5, 13.5): which Line, Ingredient or Supply, the pack size, the name, the scope, the
// weight, the Picture, and Add. The components render what this hook decides and wire its handlers. Plain React state over lib functions.
import { useMemo, useState } from 'react'
import type { Ingredient, IngredientKind, SearchResult } from '../../ingredients/types'
import { choiceFromLine, lineChips, type LineCandidate, type LineChip } from '../lib/lineChoice'
import type { PictureHandlers } from '../lib/newProductPicture'
import { newProductPictures } from '../lib/newProductPicture'
import { suggestPackChips, type PackChip, type PackProduct } from '../lib/packChips'
import { choiceValue, noPackSelection, packSelectionFor, type PackSelection } from '../lib/newProductSelect'
import {
  choiceKind,
  defaultName,
  defaultNewBaseUnit,
  emptyForm,
  newRowKey,
  validateUnknownForm,
  type FormErrors,
  type IngredientChoice,
  type UnknownFormValues,
  type UnknownMode,
} from '../lib/unknownForm'
import type { BaseUnit, BarcodeScope } from '../types'
import { useIngredientGuard } from './useIngredientGuard'
import { useNewProductPicture } from './useNewProductPicture'

export interface NewProductFormOptions {
  mode: UnknownMode
  shopName: string
  ingredients: IngredientChoice[]
  lines: LineCandidate[]
  products: PackProduct[]
  canUpload: boolean
  findSimilar?: (name: string) => Promise<SearchResult>
  pictures?: PictureHandlers
  newClientUuid: () => string
  onSave: (values: UnknownFormValues) => void | Promise<void>
  onAdded?: (rowKey: string, clientUuid: string) => void
}

export function useNewProductForm(o: NewProductFormOptions) {
  const weighed = o.mode !== 'pack'
  const lines = useMemo(() => lineChips(o.lines), [o.lines])
  const noLines = lines.chips.length + lines.more.length === 0

  const [line, setLine] = useState<LineChip | null>(null)
  const [somethingElse, setSomethingElse] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [kind, setKind] = useState<IngredientKind>('food')
  const [choice, setChoice] = useState<IngredientChoice | null>(null)
  const [pack, setPack] = useState<PackSelection>(noPackSelection('g'))
  const [typedName, setTypedName] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [scope, setScope] = useState<BarcodeScope>('global')
  const [weightText, setWeightText] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [saving, setSaving] = useState(false)
  const guardState = useIngredientGuard(o.findSimilar)
  const picture = useNewProductPicture(o.pictures ?? newProductPictures, o.canUpload)
  const formOpen = somethingElse || noLines

  // The values of the form as the handlers and the summary see them.
  const draft: UnknownFormValues = { ...emptyForm(), ingredient: choice, packSize: pack.size, packUnit: pack.unit, scope, weightText }
  const suggested = defaultName(draft, o.mode)
  const productName = typedName ?? suggested
  const values: UnknownFormValues = { ...draft, productName }
  const errors: FormErrors = attempts > 0 ? validateUnknownForm(values, o.mode) : {}

  const packChips = choice ? suggestPackChips({ ingredientId: choice.id, baseUnit: choice.baseUnit }, o.products).chips : []

  const applyChoice = (next: IngredientChoice) => {
    setChoice(next)
    setKind(choiceKind(next))
    setPack(packSelectionFor(next, o.products))
  }

  const pickLine = (chip: LineChip) => {
    setLine(chip)
    applyChoice(choiceFromLine(chip))
  }

  const pickAnotherLine = () => {
    setLine(null)
    setChoice(null)
    setKind('food')
    setPack(noPackSelection('g'))
    setSomethingElse(false)
    guardState.reset()
  }

  const pickFromSelect = (id: number) => {
    const found = o.ingredients.find((i) => i.id === id)
    if (!found) return
    guardState.reset()
    applyChoice(found)
  }

  const createChoice = (name: string) => {
    const trimmed = name.trim()
    const next: IngredientChoice = { name: trimmed, baseUnit: defaultNewBaseUnit(kind), kind }
    guardState.reset()
    applyChoice(next)
    void guardState.check(trimmed)
  }

  /** The near-duplicate the matcher found: the existing Ingredient or Supply, with its own kind. */
  const adopt = (existing: Ingredient) => {
    guardState.reset()
    applyChoice({ id: existing.id, name: existing.name, baseUnit: existing.baseUnit, kind: existing.kind ?? 'food' })
  }

  const changeKind = (next: IngredientKind) => {
    guardState.reset()
    setKind(next)
    setChoice(null)
    setPack(noPackSelection('g'))
  }

  const changeBaseUnit = (unit: BaseUnit) => {
    if (!choice) return
    applyChoice({ ...choice, baseUnit: unit })
  }

  const pickPackChip = (chip: PackChip) => setPack({ size: chip.value, unit: chip.unit, key: chip.key, other: false })
  const pickOther = () => setPack({ size: '', unit: choice ? choice.baseUnit : 'g', key: null, other: true })

  const save = async () => {
    if (saving || picture.busy) return
    const blocked = Object.keys(validateUnknownForm(values, o.mode)).length > 0 || guardState.guard.kind !== 'clear'
    if (blocked) {
      setAttempts((n) => n + 1)
      return
    }
    const clientUuid = o.newClientUuid()
    const payload: UnknownFormValues = { ...values, clientUuid }
    if (o.canUpload) {
      if (picture.imageId) payload.image = picture.imageId
    } else if (picture.picture) {
      payload.picture = picture.picture
    }
    setSaving(true)
    try {
      await o.onSave(payload)
      o.onAdded?.(newRowKey(clientUuid), clientUuid)
    } catch {
      // The sheet stays open for another try.
      setSaving(false)
    }
  }

  return {
    weighed,
    lines,
    noLines,
    showLines: !formOpen && line === null,
    showKind: formOpen && line === null,
    moreOpen,
    expandLines: () => setMoreOpen(true),
    openSomethingElse: () => setSomethingElse(true),
    pickLine,
    pickAnotherLine,
    kind,
    changeKind,
    choice,
    choiceValue: choiceValue(choice),
    pickFromSelect,
    createChoice,
    adopt,
    changeBaseUnit,
    pack,
    packChips,
    pickPackChip,
    pickOther,
    setOtherSize: (size: string) => setPack((p) => ({ ...p, size })),
    setOtherUnit: (unit: string) => setPack((p) => ({ ...p, unit })),
    line,
    values,
    productName,
    renaming,
    startRename: () => setRenaming(true),
    changeName: (name: string) => setTypedName(name),
    scope,
    toggleScope: () => setScope((s) => (s === 'global' ? 'shop' : 'global')),
    shopName: o.shopName,
    weightText,
    setWeightText,
    errors,
    guard: guardState.guard,
    picture,
    saving,
    busy: saving || picture.busy,
    attempts,
    save,
    keepNew: guardState.reset,
    chosenKind: choice ? choiceKind(choice) : kind,
  }
}
