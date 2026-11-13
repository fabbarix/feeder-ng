// English copy of the new-Product sheet (SR5). Kept apart from strings.ts, which SR4 owns while both work in parallel.
// Wording follows docs/design/shop-scan-proposals.md 13.5 and 13.8 and the SR5 mockups.

import { scanStrings } from './strings'

export const newProductStrings = {
  title: 'What is this?',
  barcodeNotKnown: (code: string) => `${code} · not in Feeder yet`,

  // Step 1: Which Line is it?
  whichLine: 'Which Line is it?',
  whichLineHint: 'Picking a Line sets what it is and ticks it. Lines you still need are listed first.',
  restock: 'Restock',
  somethingElse: 'Something else',
  moreLines: 'More Lines',
  otherLine: 'Pick another Line',

  // Step 2: what it is
  kindLabel: 'What it is',
  kindIngredient: 'Ingredient',
  kindSupply: 'Supply',
  groupIngredients: 'Ingredients',
  groupSupplies: 'Supplies',
  newIngredientRow: (query: string) => `New Ingredient “${query}”`,
  newSupplyRow: (query: string) => `New Supply “${query}”`,
  baseUnitLabel: 'Base Unit',
  /** The sheet's eyebrow once the Ingredient or Supply is known: "Dish soap · Supply". */
  eyebrow: (name: string, kind: 'food' | 'supply') => `${name} · ${kind === 'supply' ? 'Supply' : 'Ingredient'}`,

  // Step 3: pack size
  packSize: 'Pack size',
  packOther: 'Other',
  packOtherLabel: 'Other pack size',
  packUnit: 'Unit',

  // Step 4: Picture
  pictureLabel: 'Picture',
  takePicture: 'Take a Picture',
  choosePicture: 'Choose a Picture',
  retake: 'Retake',
  pictureOptional: 'Optional: you can add it later on the Product page.',
  pictureCropped: 'Cropped to 4:3 automatically',
  pictureAlt: 'The Picture of the new Product',
  pictureFailed: 'That Picture could not be used. Try another.',

  // Step 5: the summary
  savedAs: (name: string) => `Saved as “${name}”, Any Shop.`,
  savedAsShop: (name: string, shop: string) => `Saved as “${name}”, ${shop} only.`,
  rename: 'Rename',
  moreThisShop: 'More: This Shop only',
  moreAnyShop: 'More: Any Shop',
  productName: 'Product name',

  // Step 6: the primary
  add: 'Add',
  addTicks: (line: string) => `Add · ticks ${line}`,

  // a price-valued weighed code asks the weight once
  weightHint: (price: string) => `The label says ${price}. ${scanStrings.weightHint}`,

  // inline validation hints
  needKind: 'Pick what it is',
  needName: 'Give it a name',
  needPack: 'Pick a pack size',
  mustBePositive: 'Enter a number above 0',
} as const
