// The changed mode's map from a Go area (internal/<area>/...) to what a change there can affect (scripts/lib/check-plan.mjs):
//   bdd     the BDD areas (the @area-<name> tag every bdd/features file carries; bdd/area_tags_test.go keeps the tags honest)
//   routes  the page-layout route patterns (scripts/lib/page-layout-rules.mjs ROUTES) whose screens read that area's API
// 'all' means every one. An internal/<area> that is not listed here is shared (app, db, httpx, household, …): every BDD feature and
// every route. This map only narrows the changed mode; the full and ci profiles run everything.
const R = {
  today: ['/'],
  plan: ['/', '/plan', '/plan/couldnt-plan/excluded', '/board'],
  shop: ['/shop'],
  scan: ['/scan', '/shop'],
  receipt: ['/scan/receipt', '/scan/receipt/review'],
  pantry: ['/pantry', '/supplies', '/supplies/:id'],
  recipes: ['/recipes', '/recipes/:id', '/recipes/:id/edit', '/recipes/new'],
  importExport: ['/recipes/import', '/recipes/export'],
  ingredients: ['/ingredients', '/ingredients/:id'],
  products: ['/products', '/products/:id', '/supplies', '/supplies/:id'],
  shops: ['/settings/shops', '/settings/shops/:id'],
  access: ['/settings/members', '/settings/allowlist', '/settings/access-requests'],
}

export const GO_AREAS = {
  access: { bdd: ['auth'], routes: R.access },
  away: { bdd: ['planning', 'household'], routes: [...R.plan, '/settings/members'] },
  backup: { bdd: ['notify-ops'], routes: [] },
  barcode: { bdd: ['products-shops', 'scan'], routes: [...R.scan, ...R.products] },
  cook: { bdd: ['cook-board'], routes: ['/board', '/recipes/:id'] },
  course: { bdd: ['courses', 'planning'], routes: ['/settings/courses', ...R.plan, '/recipes', '/recipes/:id/edit'] },
  ingredient: { bdd: ['ingredients', 'recipes', 'products-shops'], routes: [...R.ingredients, ...R.recipes, ...R.products] },
  notify: { bdd: ['notify-ops'], routes: ['/settings/notifications', '/'] },
  plan: { bdd: ['planning', 'shopping-scan', 'cook-board', 'notify-ops'], routes: [...R.plan, '/settings/planning', '/settings/meal-slots'] },
  planner: { bdd: ['planning'], routes: R.plan },
  product: { bdd: ['products-shops', 'scan', 'shopping-scan', 'supplies', 'stock', 'receipt'], routes: [...R.products, ...R.scan, ...R.pantry] },
  receipt: { bdd: ['receipt'], routes: R.receipt },
  recipe: { bdd: ['recipes', 'planning', 'import-export', 'cook-board'], routes: [...R.recipes, ...R.plan] },
  recipeassistant: { bdd: ['recipe-assistant', 'import-export', 'receipt'], routes: ['/settings/recipe-assistant', ...R.importExport, ...R.receipt] },
  recipefile: { bdd: ['import-export'], routes: R.importExport },
  scan: { bdd: ['scan', 'shopping-scan'], routes: R.scan },
  scheduler: { bdd: ['notify-ops'], routes: [] },
  shopping: { bdd: ['shopping-scan', 'scan'], routes: R.shop },
  stock: { bdd: ['stock', 'supplies', 'shopping-scan', 'scan', 'receipt'], routes: [...R.pantry, ...R.shop] },
  sun: { bdd: ['cook-board'], routes: ['/board'] },
  tag: { bdd: ['tags', 'recipes'], routes: ['/settings/tags', '/recipes'] },
  today: { bdd: ['notify-ops', 'household'], routes: R.today },
}
