// English copy for Settings, the Settings index (hub), its section names and the shared loading and error lines. Glossary terms only. Re-exported as part of settingsStrings by ../strings.ts.
export const settingsHubStrings = {
  title: 'Settings',
  household: 'Household',
  members: 'Members',
  mealSlots: 'Meal Slots',
  allowlist: 'Allowlist',
  preferences: 'Your preferences',
  index: {
    title: 'Settings',
    groups: { catalogue: 'Catalogue', household: 'Household', you: 'You' },
    /** The row's accessible name when requests wait: the count is shown once, as the badge. */
    rowWithCount: (title: string, n: number) => `${title}, ${n} waiting`,
    /** DS-10: each description is at most 60 characters, two lines at 375 px even with text spacing. "Use\u2011by" keeps its hyphen
     *  unbroken (U+2011). */
    sections: {
      ingredients: { title: 'Ingredients', meta: 'What you cook with, and what it means' },
      supplies: { title: 'Supplies', meta: "What you keep but don't cook with: toilet paper, batteries" },
      products: { title: 'Products', meta: 'What you buy: brands and pack sizes' },
      household: { title: 'Household', meta: 'Time zone, Planning Horizon, Planner Style, currency' },
      members: { title: 'Members', meta: 'Who eats from the plan' },
      mealSlots: { title: 'Meal Slots', meta: 'When the Household eats, by weekday' },
      courses: { title: 'Courses', meta: 'What a Meal Slot serves, and which Course is main' },
      planningRules: { title: 'Planning rules', meta: 'Cooking times, Slot Rules, Variety Rules' },
      tags: { title: 'Tags', meta: 'Names and colours of Recipe Tags' },
      shops: { title: 'Shops', meta: 'Where you buy, and their barcodes' },
      storagePlaces: { title: 'Storage Places', meta: 'Where you keep Stock: pantry, fridge, freezer' },
      preferences: { title: 'Your preferences', meta: 'Colour mode, units, accent' },
      accessRequests: { title: 'Sign-in requests', meta: 'Who asked to join' },
      notifications: { title: 'Notifications', meta: 'Which alerts reach this device' },
      allowlist: { title: 'Allowlist', meta: 'Who may sign in to Feeder' },
      recipeAssistant: { title: 'Recipe Assistant', meta: 'Reads recipes from a photo or a web page' },
    },
  },
  loading: 'Loading',
  loadError: 'Settings could not load. Try again in a moment.',
  /** B9-20 (RES-02): a Settings list offline and never loaded on this phone (a LoadState, never an empty list). */
  offline: {
    title: 'Your settings aren’t on this phone yet',
    text: 'Feeder loads them the first time this phone is online. They’ll appear here as soon as the connection is back.',
  },
}
