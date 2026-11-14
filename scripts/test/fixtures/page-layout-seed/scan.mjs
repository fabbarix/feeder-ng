// The page-layout seed, scan area (B9-03: scripts/test/fixtures/page-layout-seed.mjs split by area; the calls are unchanged).
// The Scan session's barcodes, the receipt Product and the Recipe Assistant on the fake Anthropic API.
// seed(ctx) reads step, ean13, ing, shops, today from ctx and adds scanBarcodes, unknownBarcode, assistant.

export async function seed(ctx) {
  const { step, ean13, ing, shops, today } = ctx
  // beta.7 (SR6, RR5): the Scan screen's shop session. The guard types these barcodes (the camera is missing in a headless run): two
  // seeded Products, then one whose name carries the fake Anthropic API's receipt marker, so "Read the receipt" gets a readable
  // receipt built from the Scanned rows (internal/recipeassistant/fakeanthropic receipt.go). unknownBarcode is a valid EAN-13 of no
  // Product: it opens the new-Product sheet. With the fake's URL (PAGE_LAYOUT_FAKE_ANTHROPIC_URL, set by check-page-layout.sh) the
  // Recipe Assistant is turned on against it.
  const scanBarcodes = [0, 1].map((i) => ean13(`800000000${100 + i}`.slice(0, 12)))
  const receiptBarcode = ean13('800000000400')
  if (ing[3]) {
    const r = await step('receipt product', 'POST', '/api/products', { name: 'Passata #fake:receipt', ingredientId: ing[3].id, packSize: 700, barcodes: [receiptBarcode] })
    if (r.ok && r.json?.id && shops[0]) await step('receipt price', 'PUT', `/api/products/${r.json.id}/prices`, { shopId: shops[0].id, date: today, priceCents: 129 })
  }
  scanBarcodes.push(receiptBarcode)
  const unknownBarcode = ean13('800000000999')
  const fakeAnthropic = process.env.PAGE_LAYOUT_FAKE_ANTHROPIC_URL ?? ''
  let assistant = false
  if (fakeAnthropic) {
    const r = await step('recipe assistant', 'PUT', '/api/recipe-assistant/settings', { enabled: true, baseUrl: fakeAnthropic, model: 'claude-haiku-5-5', apiKey: 'sk-page-layout-fake' })
    assistant = r.ok
  }
  Object.assign(ctx, { scanBarcodes, unknownBarcode, assistant })
}
