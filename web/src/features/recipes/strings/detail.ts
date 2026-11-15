// Recipes strings, detail area (WP-RX-0): the Recipe detail, its actions, metrics, Cook entry and preferences.
// Glossary terms only (Recipe, Yield, Ready Meal, Step, Advance Step, Tag, Favourite, Dislike, Exclusion, Unit Conversion, Member,
// Cool-down, Use-by). Re-exported as part of recipeStrings by ../strings.ts.
export const recipeDetailStrings = {
  loading: 'Loading…',
  loadError: 'The Recipe could not be loaded.',
  /** B9-20: the page title while the Recipe's own name is not known (loading, offline, failed). */
  detailTitle: 'Recipe',
  /** B9-20 (RES-02): offline, and this Recipe was never loaded on this phone. */
  detailOfflineTitle: 'This Recipe isn’t on this phone yet',
  detailOfflineText: 'Feeder needs a connection to load it the first time. It will appear here as soon as the connection is back.',
  archive: 'Archive',
  unarchive: 'Unarchive',
  delete: 'Delete',
  /** SAFE-05: the danger dialog of a Recipe that can be deleted. */
  deleteDialog: {
    title: (name: string) => `Delete ${name}?`,
    body: 'Nobody has planned it yet.',
    note: "Nothing else changes. This can't be undone.",
    confirm: 'Delete',
    alternate: 'Archive instead',
  },
  /** Ruling 3 (B9-27): a Base recipe in use can't be deleted; the dialog lists the Recipes that use it (up to 5, then "and N more"). */
  inUse: {
    lead: (n: number) => `It is used in ${n} ${n === 1 ? 'Recipe' : 'Recipes'}.`,
    rowsLabel: 'Recipes',
    archived: 'Archived',
    more: (n: number) => `and ${n} more`,
  },
  more: 'More actions',
  /** RX-06: the Yield metric. A plannable Recipe: value "4", label "portions per Batch"; a Base recipe: value "800 g", label "per Batch". */
  portionsPerBatch: (n: number) => (n === 1 ? 'portion per Batch' : 'portions per Batch'),
  perBatch: 'per Batch',
  totalMetric: (t: string) => `${t} cooking`,
  /** RX-13: the time metric's label under the value ("37 min" / "cooking"). */
  cookingLabel: 'cooking',
  aheadMetric: (t: string) => `+ ${t} ahead`,
  /** RX-07: Steps without a Duration are not "No Steps". */
  noTimeSet: 'No time set',
  untimedSteps: (n: number) => (n === 1 ? '1 Step, not timed' : `${n} Steps, none timed`),
  cook: {
    start: 'Start Cook Mode',
    /** SHORT-04: the button's visible label at 375 px and below; its name stays "Start Cook Mode". */
    short: 'Cook',
    barLabel: 'Cook',
    batches: 'Batches',
    /** RX-06: "1 Batch · 4 portions", "2 Batches · 1.6 kg". */
    batchesHint: (n: number, amount: string) => `${n} Batch${n === 1 ? '' : 'es'} · ${amount}`,
  },
  /** RX-05: the lede (description and Source). */
  about: {
    showMore: 'Show more',
    showLess: 'Show less',
    source: 'Source:',
    sourceLink: (host: string) => `Source: ${host}, opens in a new tab`,
  },
  /** RX-04: the hero's one chip line (Courses, Archived, Whole meal, Ready Meal, then the Tags). */
  heroChips: {
    label: 'Courses and Tags',
    showAll: (n: number) => `Show all ${n} Tags`,
    showFewer: 'Show fewer Tags',
    fewer: 'Show fewer',
  },
  /** RX-04: a Step row's time at its end, and the Steps it comes after (1-based). */
  stepRow: {
    noTime: 'No time',
    before: (t: string) => `${t} before`,
    after: (numbers: string, count: number) => `After ${count === 1 ? 'Step' : 'Steps'} ${numbers}`,
  },
  /** RX-06: the Base recipe section's heading, always, and the sentence when nothing uses it. */
  usedIn: {
    title: 'Used in',
    none: "Not used in any Recipe yet. Link it from a Recipe's ingredient line.",
  },
  /** SAFE-05 and ruling 3: Delete of a Recipe that is not deletable says why before asking, and offers only Archive. */
  deleteBlocked: {
    title: (name: string) => `${name} can't be deleted`,
    planned: 'It was planned before, so Feeder keeps it in the history of what was Cooked.',
    note: 'Archive takes it out of the Recipes list, the pickers and the plan. You can unarchive it later.',
    archive: 'Archive',
  },
  /** RX-04 / SAFE-05 toasts (R-D+): plain success toasts, an outline Undo; failures are error toasts with Retry. */
  toasts: {
    archived: (name: string) => `${name} archived`,
    unarchived: (name: string) => `${name} unarchived`,
    undoUnarchive: (name: string) => `Undo: unarchive ${name}`,
    undoArchive: (name: string) => `Undo: archive ${name}`,
    deleted: (name: string) => `${name} deleted`,
    archiveFailed: (name: string) => `Couldn't archive ${name}`,
    unarchiveFailed: (name: string) => `Couldn't unarchive ${name}`,
    deleteFailed: (name: string) => `Couldn't delete ${name}`,
    retry: 'Retry',
  },
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
  /** PT: who excludes an Ingredient (the Ingredient page's Exclusions Tile). */
  members: 'Members',
  /** A11Y 3: the toggle's name, without a colon, and the excluding Member's row meta. */
  excludesToggle: (member: string, ingredient: string) => `${member} excludes ${ingredient}`,
  excludesMeta: (ingredient: string) => `Excludes ${ingredient}`,
  /** A11Y 3: the Exclusions tile's summary (lib/preference exclusionSummary picks the form). */
  exclusionSummary: {
    nobody: (ingredient: string) => `Nobody excludes ${ingredient}.`,
    one: (name: string, ingredient: string) => `${name} excludes ${ingredient}.`,
    two: (a: string, b: string, ingredient: string) => `${a} and ${b} exclude ${ingredient}.`,
    many: (a: string, b: string, more: number, ingredient: string) => `${a}, ${b} and ${more} more exclude ${ingredient}.`,
  },
} as const
