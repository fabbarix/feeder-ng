// Shared fixtures and setup of the NewProductSheet suites (SR5). Not shipped: only *.test.* files import it.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { RawImage } from '../../../ui'
import type { LineCandidate } from '../lib/lineChoice'
import type { IngredientChoice } from '../lib/unknownForm'
import { NewProductSheet, type NewProductSheetProps, type PictureHandlers } from './NewProductSheet'

export const mozzarellaLine: LineCandidate = { ingredientId: 11, name: 'Mozzarella', baseUnit: 'g', quantity: 125, ticked: false }
export const basilLine: LineCandidate = { ingredientId: 12, name: 'Fresh basil', baseUnit: 'piece', quantity: 1, ticked: false }
export const lemonsLine: LineCandidate = { ingredientId: 13, name: 'Lemons', baseUnit: 'piece', quantity: 4, ticked: false }
export const eggsLine: LineCandidate = { ingredientId: 14, name: 'Eggs', baseUnit: 'piece', quantity: 6, ticked: false }
export const dishSoapLine: LineCandidate = { ingredientId: 15, name: 'Dish soap', baseUnit: 'ml', quantity: 500, ticked: false, kind: 'supply' }
export const tickedPastaLine: LineCandidate = { ingredientId: 16, name: 'Pasta', baseUnit: 'g', quantity: 0, ticked: true }
export const lines: LineCandidate[] = [mozzarellaLine, basilLine, lemonsLine, eggsLine, dishSoapLine, tickedPastaLine]

export const ingredients: IngredientChoice[] = [
  { id: 1, name: 'passata', baseUnit: 'g' },
  { id: 2, name: 'milk', baseUnit: 'ml' },
  { id: 11, name: 'Mozzarella', baseUnit: 'g' },
  { id: 14, name: 'Eggs', baseUnit: 'piece' },
  { id: 15, name: 'Dish soap', baseUnit: 'ml', kind: 'supply' },
  { id: 17, name: 'Dishwasher tablets', baseUnit: 'piece', kind: 'supply' },
]

export const CAPTURED: RawImage = { kind: 'blob', blob: new Blob([new Uint8Array(10)], { type: 'image/jpeg' }), width: 1600, height: 1200, type: 'image/jpeg', origin: 'camera' }
export const UPLOADED_ID = 'a'.repeat(32)
export const photo = () => new File([new Uint8Array(8)], 'IMG_0001.jpg', { type: 'image/jpeg' })

export function fakePictures(over: Partial<PictureHandlers> = {}): PictureHandlers & { prepare: ReturnType<typeof vi.fn>; upload: ReturnType<typeof vi.fn> } {
  return {
    prepare: vi.fn(async () => CAPTURED),
    upload: vi.fn(async () => UPLOADED_ID),
    ...over,
  } as PictureHandlers & { prepare: ReturnType<typeof vi.fn>; upload: ReturnType<typeof vi.fn> }
}

export function setup(over: Partial<NewProductSheetProps> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    mode: 'pack',
    shopName: 'Coop',
    ingredients,
    barcode: '8001234567890',
    pictures: fakePictures(),
    coarsePointer: true,
    newClientUuid: () => 'uuid-new-1',
    onSave: vi.fn(),
    onAdded: vi.fn(),
    ...over,
  } as NewProductSheetProps & { onSave: ReturnType<typeof vi.fn>; onAdded: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn>; pictures: ReturnType<typeof fakePictures> }
  const view = render(<NewProductSheet {...props} />)
  return { props, ...view }
}

export const dialog = () => screen.getByRole('dialog', { name: 'What is this?' })
export const lineGroup = () => within(dialog()).getByRole('group', { name: 'Which Line is it?' })
export const kindGroup = () => within(dialog()).getByRole('radiogroup', { name: 'What it is' })
export const packGroup = () => within(dialog()).getByRole('group', { name: 'Pack size' })
export const addButton = (name: string | RegExp = /^Add/) => within(dialog()).getByRole('button', { name })
export const fileInput = (c: HTMLElement) => c.ownerDocument.querySelector<HTMLInputElement>('input[type=file]')!

/** Opens the Select named `label` in the dialog, searches for `query` (when given) and picks the option whose name matches. */
export async function choose(label: string | RegExp, option: string | RegExp, query?: string) {
  await userEvent.click(within(dialog()).getByRole('combobox', { name: label }))
  if (query !== undefined) await userEvent.type(screen.getByRole('searchbox'), query)
  await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: option }))
}

/** Gets past step 1 on "Something else" (when there are Lines) so the Ingredient | Supply form shows. */
export async function openSomethingElse() {
  await userEvent.click(within(lineGroup()).getByRole('button', { name: 'Something else' }))
}
