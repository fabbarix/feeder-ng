// Recipes strings, detail area (WP-RX-0): the Recipe detail, its actions, metrics, Cook entry and preferences.
// Glossary terms only (Recipe, Yield, Ready Meal, Step, Advance Step, Tag, Favourite, Dislike, Exclusion, Unit Conversion, Member,
// Cool-down, Use-by). Re-exported as part of recipeStrings by ../strings.ts.
export const recipeDetailStrings = {
  loading: 'Loading…',
  loadError: 'The Recipe could not be loaded.',
  archive: 'Archive',
  unarchive: 'Unarchive',
  delete: 'Delete',
  deleteDialog: {
    title: (name: string) => `Delete ${name}?`,
    body: 'It is removed from future Planned Meals. Archive keeps it for history.',
    confirm: 'Delete',
    alternate: 'Archive instead',
  },
  inUse: {
    title: (name: string) => `${name} is in use`,
  },
  more: 'More actions',
  portionsPerBatch: (yieldText: string) => `${yieldText} portions per Batch`,
  totalMetric: (t: string) => `${t} cooking`,
  aheadMetric: (t: string) => `+ ${t} ahead`,
  cook: {
    start: 'Start Cook Mode',
    barLabel: 'Cook',
    batches: 'Batches',
    batchesHint: (n: number, portions: string) => `${n} Batch${n === 1 ? '' : 'es'} · ${portions} portions`,
  },

  deleteBlocked: 'This Recipe was planned, so it can only be archived.',
  edit: 'Edit',
  ingredients: 'Ingredients',
  stepsTitle: 'Steps',
  favourite: 'Favourite',
  dislike: 'Dislike',
  exclusion: 'Exclusion',
  /** PT: the Recipe's preferences table, one row per Member (rx-pt.md section 5.3). */
  preferences: 'Preferences',
  preferencesFor: (name: string) => `Preferences for ${name}`,
  preferencesLoadError: 'The preferences could not be loaded.',
  memberColumn: 'Member',
  you: 'You',
  noMembers: 'No Members yet',
  addMembers: 'Add Members',
  askAdmin: 'Ask an Admin to add Members',
  viaNote: "An Exclusion via an Ingredient is changed on that Ingredient's line, under Ingredients.",
  /** Read-only Exclusion cell: the screen reader says "Excluded", the text says "via garlic". */
  excludedVia: 'Excluded',
  via: 'via',
  alsoVia: 'also via',
  stateToggle: (member: string, state: string) => `${member}: ${state}`,
  saveFailed: (member: string, state: string) => `Couldn't save ${member}'s ${state}. Try again.`,
  exclusionSaveFailed: (member: string) => `Couldn't save ${member}'s Exclusions. Try again.`,
  /** PT: who excludes an Ingredient (the Ingredient page's Excluded by Tile). */
  members: 'Members',
  excludesToggle: (member: string, ingredient: string) => `${member}: excludes ${ingredient}`,
} as const
