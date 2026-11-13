// The short new-Product sheet for an unknown barcode (SR5, shop-scan-proposals 13.5): Which Line is it?, Ingredient | Supply, pack chips,
// an optional Picture from the phone's own camera, a summary line, Add. It replaced UnknownBarcodeSheet (beta.7). The sheet only opens the form;
// the form's state and steps live in hooks/useNewProductForm.
import { BottomSheet } from '../../../ui'
import type { LineCandidate } from '../lib/lineChoice'
import type { PackProduct } from '../lib/packChips'
import type { PictureHandlers } from '../lib/newProductPicture'
import type { IngredientChoice, UnknownFormValues, UnknownMode } from '../lib/unknownForm'
import type { SearchResult } from '../../ingredients/types'
import type { UnitSystem } from '../../../lib/units'
import { newProductStrings } from '../newProductStrings'
import { NewProductForm } from './NewProductForm'
import './NewProductSheet.css'

export type { PictureHandlers } from '../lib/newProductPicture'

/** The sheet of an unknown barcode. ScanScreen passes what it has: the barcode, the live Lines, the offline Products, the unit system. */
export interface NewProductSheetProps {
  open: boolean
  onClose: () => void
  mode: UnknownMode
  /** the "This Shop only" choice names this Shop */
  shopName: string
  /** the Ingredients and Supplies to search; a choice without `kind` is food */
  ingredients: IngredientChoice[]
  /** a price-valued weighed code: shown to explain why the weight is asked */
  priceText?: string
  /** The valid form. The sheet's Add calls it once and then, when it settles, `onAdded`. */
  onSave: (values: UnknownFormValues) => void | Promise<void>
  /** true (default) = online: the Picture is uploaded at once and `values.image` is its id; false = offline: `values.picture` is the Blob for the queue. */
  canUpload?: boolean
  /** the near-duplicate lookup for a new Ingredient or Supply; absent offline: no guard. A rejection is ignored. */
  findSimilar?: (name: string) => Promise<SearchResult>
  /** the barcode, shown at the top ("8001234567890 · not in Feeder yet") */
  barcode?: string
  /** the Shopping List's Lines; the sheet picks the open ones (lib/lineChoice.lineChips). Absent or none open: step 1 is skipped. */
  lines?: LineCandidate[]
  /** the known Products, for the pack chips (OfflineProduct fits) */
  products?: PackProduct[]
  /** the Household's unit system for amounts on the Line chips; default metric */
  system?: UnitSystem
  /** replaceable Picture handling; the defaults are the shared ImagePicker pipeline and POST /api/images */
  pictures?: PictureHandlers
  /** the phone rather than a computer: "Take a Picture" instead of "Choose a Picture". Default: matchMedia('(pointer: coarse)'). */
  coarsePointer?: boolean
  /** true when the camera app is about to open (the scanner should stop its stream), false when the Picture or the cancel is back */
  onPicturePicking?: (picking: boolean) => void
  /** the Op's clientUuid; default crypto.randomUUID() */
  newClientUuid?: () => string
  /**
   * After onSave settles: the key of the new row in the Scanned list (`new:<clientUuid>`) and the clientUuid. The caller opens the keypad on
   * that row ("Add price"). The sheet itself never asks for a Price.
   */
  onAdded?: (rowKey: string, clientUuid: string) => void
}

export function NewProductSheet(props: NewProductSheetProps) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title={newProductStrings.title}>
      {props.open ? <NewProductForm {...props} /> : null}
    </BottomSheet>
  )
}
