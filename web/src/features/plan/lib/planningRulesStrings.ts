// B9-51: the copy Planning rules adds beyond planStrings (pinned by strings.snapshot.json): the Cooking times tile (PC-14, A2) and the
// light removals of Slot Rules and Variety Rules (SAFE-02). GLOSSARY terms only: Earliest start, Latest start, Recipe, Meal Slot,
// Advance Step, Slot Rule, Variety Rule, Admin.
export const cookingTimesStrings = {
  title: 'Cooking times',
  lede: "The planner won't plan a Recipe in a Meal Slot if cooking would have to start outside these times. Advance Steps the day before are not affected.",
  earliest: 'Earliest start',
  earliestTime: 'Earliest start time',
  earliestOn: 'Cooking never has to start before this time.',
  earliestOff: 'Off: cooking may start at any time.',
  latest: 'Latest start',
  latestTime: 'Latest start time',
  latestOn: 'Cooking may start the day before a meal, up to this time.',
  latestOff: 'Off: cooking starts on the day of the meal.',
  save: 'Save Cooking times',
  saving: 'Saving',
  saved: 'Cooking times saved',
  saveFailed: "Couldn't save the Cooking times. Try again.",
  readOnly: 'Only an Admin can change the Cooking times.',
  // A plain User reads the times as rows (R-E): the time or "Off" at the row's end, what it means under it.
  off: 'Off',
  earliestOffNote: 'Cooking may start at any time.',
  latestOffNote: 'Cooking starts on the day of the meal.',
  latestNotLater: 'Latest start must be later than Earliest start.',
  earliestInvalid: 'Earliest start must be a time, or Off.',
  loadFailed: "Couldn't load the Cooking times.",
  // The example line (lib/cookingTimes.startExample)
  or: 'or',
  exampleRecipe: (name: string, length: string) => `${name} (${length})`,
  exampleAny: (recipe: string) => `${recipe} can be planned for any Meal Slot.`,
  exampleNone: (recipe: string) => `${recipe} can't be planned for any Meal Slot.`,
  exampleFrom: (recipe: string, slot: string, time: string, refused: string) => `${recipe} can be planned for ${slot} at ${time} or later, not for ${refused}.`,
  exampleSome: (recipe: string, allowed: string, refused: string) => `${recipe} can be planned for ${allowed}, not for ${refused}.`,
} as const

export const ruleRemovalStrings = {
  /** "Slot Rule Friday Dinner · Main = Curry" */
  slotRuleName: (title: string, what: string) => `Slot Rule ${title} = ${what}`,
  /** "Variety Rule for fish" */
  varietyRuleName: (tag: string) => `Variety Rule for ${tag}`,
  removeLabel: (name: string) => `Remove ${name}`,
  removed: (name: string) => `${name} removed`,
  back: (name: string) => `${name} is back`,
} as const
