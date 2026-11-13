// The body of the new-Product sheet (SR5): the steps in order, each a component, wired to useNewProductForm. Mounted only while open, so
// every opening starts empty.
import { useEffect, useRef } from 'react'
import { Button, FormActions, NumberField, useMediaQuery } from '../../../ui'
import { scanStrings } from '../strings'
import { useNewProductForm } from '../hooks/useNewProductForm'
import { newProductStrings } from '../newProductStrings'
import { numberText, numberValue } from '../lib/newProductSelect'
import type { NewProductSheetProps } from './NewProductSheet'
import { NewProductLines } from './NewProductLines'
import { NewProductKind } from './NewProductKind'
import { NewProductPack } from './NewProductPack'
import { NewProductPicture } from './NewProductPicture'
import { NewProductSummary } from './NewProductSummary'
import './NewProductSheet.css'

export function NewProductForm(p: NewProductSheetProps) {
  const coarseMedia = useMediaQuery('(pointer: coarse)')
  const form = useNewProductForm({
    mode: p.mode,
    shopName: p.shopName,
    ingredients: p.ingredients,
    lines: p.lines ?? [],
    products: p.products ?? [],
    canUpload: p.canUpload ?? true,
    findSimilar: p.findSimilar,
    pictures: p.pictures,
    newClientUuid: p.newClientUuid ?? (() => crypto.randomUUID()),
    onSave: p.onSave,
    onAdded: p.onAdded,
  })
  const formRef = useRef<HTMLFormElement>(null)

  // A refused Add moves the focus to the first field that needs an answer (or to the near-duplicate guard that waits for one).
  useEffect(() => {
    if (form.attempts === 0) return
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], .new-product__guard')?.focus()
  }, [form.attempts])

  const { errors, choice, pack } = form
  const packError = errors.packSize ? (pack.size.trim() === '' ? 'pick' : 'positive') : undefined
  const addLabel = form.line ? newProductStrings.addTicks(form.line.name) : newProductStrings.add
  const eyebrowKind = form.chosenKind === 'supply' ? 'supply' : 'food'

  return (
    <form
      ref={formRef}
      className="new-product__form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void form.save()
      }}
    >
      {p.barcode ? <p className="new-product__barcode">{newProductStrings.barcodeNotKnown(p.barcode)}</p> : null}

      {form.showLines ? (
        <NewProductLines chips={form.lines} system={p.system ?? 'metric'} expanded={form.moreOpen} onExpand={form.expandLines} onPick={form.pickLine} onSomethingElse={form.openSomethingElse} />
      ) : null}

      {form.showKind ? (
        <NewProductKind
          kind={form.kind}
          onKind={form.changeKind}
          choices={p.ingredients}
          chosen={choice}
          error={Boolean(errors.ingredient)}
          onPick={form.pickFromSelect}
          onCreate={form.createChoice}
          onBaseUnit={form.changeBaseUnit}
          weighed={form.weighed}
          guard={form.guard}
          onAdopt={form.adopt}
          onKeepNew={form.keepNew}
        />
      ) : null}

      {choice ? (
        <div className="new-product__eyebrow">
          <p>{newProductStrings.eyebrow(choice.name, eyebrowKind)}</p>
          {form.line ? (
            <Button variant="tertiary" size="sm" onClick={form.pickAnotherLine}>
              {newProductStrings.otherLine}
            </Button>
          ) : null}
        </div>
      ) : null}

      {choice && !form.weighed ? (
        <NewProductPack
          chips={form.packChips}
          pack={pack}
          base={choice.baseUnit}
          error={packError}
          onPick={form.pickPackChip}
          onOther={form.pickOther}
          onSize={form.setOtherSize}
          onUnit={form.setOtherUnit}
        />
      ) : null}

      {choice && p.mode === 'weighed_price' ? (
        <>
          <p className="new-product__hint">{newProductStrings.weightHint(p.priceText ?? '')}</p>
          <NumberField
            label={scanStrings.weight}
            value={numberValue(form.weightText)}
            onChange={(n) => form.setWeightText(numberText(n))}
            error={errors.weight ? newProductStrings.mustBePositive : undefined}
          />
        </>
      ) : null}

      {choice && p.mode === 'pack' ? (
        <NewProductPicture coarse={p.coarsePointer ?? coarseMedia} state={form.picture} onPick={form.picture.pick} onPicking={p.onPicturePicking} />
      ) : null}

      {choice ? (
        <NewProductSummary
          name={form.productName}
          renaming={form.renaming}
          scope={form.scope}
          shopName={form.shopName}
          error={Boolean(errors.productName)}
          onRename={form.startRename}
          onName={form.changeName}
          onToggleScope={form.toggleScope}
        />
      ) : null}

      {!form.showLines ? <FormActions primary={<Button type="submit" disabled={form.busy}>{addLabel}</Button>} /> : null}
    </form>
  )
}
