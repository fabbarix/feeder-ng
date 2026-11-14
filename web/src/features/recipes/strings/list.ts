import { filterBarStrings } from '../../../ui/FilterBar/strings'

// Recipes strings, list area (WP-RX-0): the Recipes screen, its tiles, sort, filters and empty states.
// Glossary terms only (Recipe, Yield, Ready Meal, Step, Advance Step, Tag, Favourite, Dislike, Exclusion, Unit Conversion, Member,
// Cool-down, Use-by). Re-exported as part of recipeStrings by ../strings.ts.
export const recipeListStrings = {
  units: { days: 'days', min: 'min' },
  title: 'Recipes',
  newRecipe: 'New Recipe',
  search: 'Search Recipes',
  allTags: 'All Tags',
  /** Beta.5 F7: the Sort select of the list (lib/sort): the three sorts, longest ago first and most recent first. */
  sort: {
    label: 'Sort',
    name: 'Name',
    longestAgo: 'Last cooked: longest ago first',
    mostRecent: 'Last cooked: most recent first',
    /** hf-recipes-filter: the short value the Sort chip shows (the list keeps the long labels). */
    longestAgoShort: 'Longest ago',
    mostRecentShort: 'Most recent',
  },
  /** hf-recipes-filter: the header's Filters button, its panel, the Tag list and the active filter chips (docs/design/recipes-filter.md 9). */
  filters: {
    button: filterBarStrings.button,
    panelTitle: filterBarStrings.panelTitle,
    courseHeading: 'Course',
    tagHeading: 'Tag',
    tagListLabel: 'Filter by Tag',
    tagSearch: 'Search Tags',
    clear: filterBarStrings.clear,
    showRecipes: 'Show Recipes',
    activeLabel: filterBarStrings.activeLabel,
    moreLabel: filterBarStrings.moreLabel,
    removeCourse: (name: string) => `Remove Course: ${name}`,
    removeTag: (name: string) => `Remove Tag: ${name}`,
    buttonLabel: filterBarStrings.buttonLabel,
    noTagMatch: (query: string) => `No Tag matches '${query}'`,
    noTags: 'No Tag to choose from',
  },
  /** Beta.5 F7: "Last cooked ..." on a tile, a row and the detail (lib/lastCooked). */
  cookedLabel: {
    never: 'Not cooked yet',
    today: 'Last cooked today',
    yesterday: 'Last cooked yesterday',
    since: (when: string) => `Last cooked ${when}`,
  },
  tagsLabel: 'Tags',
  moreTags: (n: number) => (n === 1 ? '1 more Tag' : `${n} more Tags`),
  showArchived: 'Show archived',
  empty: 'No Recipes yet. Add your first one.',
  noMatch: 'No Recipe matches.',
  listError: 'The Recipes could not be loaded.',
  totalTime: (t: string) => `Total ${t}`,
  noSteps: 'No Steps',
  advanceChip: (lead: string, text: string) => `+${lead} ${text}`,
  advanceWord: 'ahead',
  yieldLabel: (n: string) => `Yield ${n}`,
  readyMeal: 'Ready Meal',
  archived: 'Archived',
  overflow: { title: 'More', showArchived: 'Show archived' },
} as const
