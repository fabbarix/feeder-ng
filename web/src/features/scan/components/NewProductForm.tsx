// The body of the new-Product sheet (SR5): the steps in order, each a component, wired to useNewProductForm. Mounted only while open, so
// every opening starts empty.
import { useEffect, useRef } from 'react'
import { Button, FormActions, NumberField, useMediaQuery } from '../../../ui'
import { useFocusStepStart } from '../../../ui/lib/focusStepStart'
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
import { NewProductCodeLine } from './NewProductCodeLine'
import { WeightCodeNote } from './WeightCodeNote'
// B9-50 (SSP-08): a receipt line's Add…
import { useReceiptMatchStep } from '../hooks/useReceiptMatchStep'
import { ReceiptLineBlock } from './ReceiptLineBlock'
import { ReceiptMatchChips } from './ReceiptMatchChips'
import { ProductNameGuard } from './ProductNameGuard'
import './NewProductSheet.css'

/** B9-41: the ids of the sheet's description (the hint tile, then the code line), set by NewProductSheet on the dialog. */
export interface NewProductDescribeIds {
  note: string
  code: string
  /** B9-50: the "On the receipt" row */
  receipt?: string
}

export function NewProductForm(p: NewProductSheetProps & { describeIds?: NewProductDescribeIds }) {
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
    // Without a barcode (a receipt line's Add…) the sheet only hands its values back: no row to price afterwards.
    onAdded: p.noBarcode ? undefined : p.onAdded,
    initial: p.initial,
    gramsFirst: p.weighed !== undefined,
    ...(p.weightCodeHint ? { defaultScope: 'shop' as const } : {}),
  })
  // B9-50 (SSP-08): "Is it one of these?", "Use <Product>" and the Product-name guard of a receipt line's Add…
  const receipt = useReceiptMatchStep({
    noBarcode: p.noBarcode === true,
    matches: p.matches,
    receiptLine: p.receiptLine,
    lines: p.lines ?? [],
    chips: form.lines,
    products: p.products ?? [],
    choice: form.choice,
    onPickLine: form.pickLine,
    onUseProduct: p.onUseProduct,
  })
  const formRef = useRef<HTMLFormElement>(null)
  // A11Y-07: a step change moves the focus to the new step's heading (never left on <body> when the focused chip goes).
  useFocusStepStart(formRef, form.stepKey)

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
      {p.weighed ? (
        <NewProductCodeLine id={p.describeIds?.code} weighed={p.weighed} shopName={p.shopName} system={p.system ?? 'metric'} />
      ) : p.barcode && !p.noBarcode ? (
        <NewProductCodeLine id={p.describeIds?.code} barcode={p.barcode} />
      ) : null}

      {p.weightCodeHint ? <WeightCodeNote id={p.describeIds?.note} shopName={p.shopName} admin={p.weightCodeHint.admin} onSetUp={p.weightCodeHint.onSetUp} /> : null}

      {/* B9-50 (SSP-08) */}
      {p.noBarcode && p.receiptLine ? <ReceiptLineBlock line={p.receiptLine} id={p.describeIds?.receipt} /> : null}
      {form.showLines && receipt.active ? (
        <ReceiptMatchChips matches={receipt.matches} value={receipt.chosen} system={p.system ?? 'metric'} onPick={receipt.pick} />
      ) : null}

      {form.showLines ? (
        <NewProductLines
          {...(receipt.active ? { title: newProductStrings.receipt.otherLines, hint: '' } : {})}
          chips={receipt.chips}
          system={p.system ?? 'metric'}
          expanded={form.moreOpen}
          {...(receipt.active ? {} : { hint: p.weighed ? newProductStrings.whichLineHintWeighed : newProductStrings.whichLineHint })}
          onExpand={form.expandLines}
          onPick={form.pickLine}
          onSomethingElse={form.openSomethingElse}
        />
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

      {/* B9-50 (SSP-08) */}
      {form.showKind && receipt.clash && p.onUseProduct ? <ProductNameGuard product={receipt.clash} onUse={p.onUseProduct} /> : null}

      {choice ? (
        <div className="new-product__eyebrow">
          <h3 className="new-product__eyebrow-title" tabIndex={-1} data-step-heading="">
            {newProductStrings.eyebrow(choice.name, eyebrowKind)}
          </h3>
          {form.line ? (
            <Button variant="secondary" size="sm" onClick={form.pickAnotherLine}>
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

      {choice && p.mode === 'pack' && !p.noBarcode ? (
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

      {/* B9-50 (SSP-08): a chosen Product needs nothing more */}
      {form.showLines && receipt.product && receipt.use ? (
        <>
          <p className="new-product__hint new-product__use-note">{receipt.note}</p>
          <FormActions
            primary={
              <Button type="button" onClick={receipt.use}>
                {newProductStrings.receipt.use(receipt.product.name)}
              </Button>
            }
          />
        </>
      ) : null}
    </form>
  )
}
