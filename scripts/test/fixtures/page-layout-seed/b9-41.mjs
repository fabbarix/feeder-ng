// B9-41 (SSP-07; plan section 9 "a weighed Product"): a Weight Barcode Rule on the seeded Shop and a weighed barcode of an item code no Product
// has, so the `scan-weighed` scenario types a code that opens "What is this?" with the weighed header ("312 g · weighed at <Shop> · item 00123").
// The rule reads the weight in grams: prefix 20, item digits 3 to 7, value digits 8 to 12. The code is 2000123003122 (item 00123, 312 g).
// Best effort, like every area: a step the API refuses is reported and skipped; the scenario's setup says what is missing.
// seed(ctx) reads step, ean13, shops from ctx and adds weightRuleId and weighedBarcode.

export const order = 341

export async function seed(ctx) {
  const { step, ean13, shops } = ctx
  const shop = shops?.[0]
  let weightRuleId = null
  let weighedBarcode = null
  if (shop) {
    const r = await step('weight barcode rule', 'POST', `/api/shops/${shop.id}/weight-rules`, {
      prefix: '20',
      item: { start: 3, length: 5 },
      value: { start: 8, length: 5 },
      decimalPlaces: 0,
      valueKind: 'weight',
      valueUnit: 'g',
    })
    if (r.ok) {
      weightRuleId = r.json?.id ?? null
      weighedBarcode = ean13('200012300312')
    }
  }
  Object.assign(ctx, { weightRuleId, weighedBarcode })
}
