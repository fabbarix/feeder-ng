// English UI strings of the planning feature: the Swap, Choose a Recipe and Planned Meal sheets, and a Meal Slot on one date. Glossary terms only. Re-exported by ../strings.ts as part of planStrings.
export const sheetsStrings = {
  // Swap sheet and its Undo
  /** B9-38 (PC-10): "Swap Risotto ai funghi", under the context line "Tue 17 · Breakfast · Main". */
  swapTitle: (recipe: string) => `Swap ${recipe}`,
  swapNow: 'Now',
  swapInstead: 'Instead',
  swapNote: "Later meals that aren't Pinned may move to make room. You can review and undo them.",
  /** The value column of an alternative: the Leftover it would leave. */
  leftoverGain: (portions: number) => `+${portions} Leftover`,
  swapLoading: 'Finding alternatives…',
  swapNone: 'No other Recipe fits this Meal Slot.',
  swapKeep: 'Keep it',
  swapped: 'Swapped',
  undo: 'Undo',
  // Choose a Recipe sheet
  chooseTitle: 'Choose a Recipe',
  chooseNone: 'There are no Recipes yet.',
  searchRecipes: 'Search Recipes',
  recipesList: 'Recipes',
  /** B9-38: a pick from "Other Recipes": "Baked apples chosen for Tue Dinner and marked as Dessert". */
  chosenAndMarked: (recipe: string, slot: string, course: string) => `${recipe} chosen for ${slot} and marked as ${course}`,
  staysMarked: (course: string) => `It stays marked as ${course}.`,
  // B9-38 (PC-10): the groups of Choose a Recipe for a Course other than the main one
  searchCourseRecipes: (course: string) => `Search ${course} Recipes`,
  markedAs: (course: string) => `Marked as ${course}`,
  otherRecipes: 'Other Recipes',
  notMarkedAs: (course: string) => `Not marked as ${course}`,
  // Planned Meal sheet
  /** B9-38 (SHORT-02): the ⋮ of the Mark as Cooked footer: "More for Cucumber tomato feta salad". */
  moreFor: (name: string) => `More for ${name}`,
  // B9-38 (PC-09): the Planned Meal sheet's footer, ⋮ and body
  sheet: {
    /** The ⋮ of the footer: "More for Tue Dinner", " Side" added when the slot has several Courses. */
    moreFor: (day: string, slot: string, course?: string) => (course ? `More for ${day} ${slot} ${course}` : `More for ${day} ${slot}`),
    /** A disabled ⋮ item's trailing words: "from Mon 16". */
    markCookedFrom: (day: string) => `from ${day}`,
    disabledItem: (label: string, note: string) => `${label} · ${note}`,
    openRecipe: 'Open Recipe',
    openRecipeFor: (portions: string) => `Ingredients for ${portions}, Steps, Notes`,
    openRecipePlain: 'Ingredients, Steps, Notes',
    leftoverOf: (recipe: string) => `Leftover of ${recipe}`,
    leftoverMore: 'More for the Leftover',
  },
  sheetFacts: {
    start: (time: string) => `start ${time}`,
    outside: (time: string) => `Cooking would start at ${time}, outside your cooking times.`,
    outsideOn: (day: string, time: string) => `Cooking would start on ${day} at ${time}, outside your cooking times.`,
    startOn: (day: string, time: string) => `Start cooking on ${day} at ${time}.`,
    leftoverTitle: (portions: string, useBy: string) => `${portions} left · Use by ${useBy}`,
    partPlanned: (planned: string, rest: string) => `${planned} planned. ${rest} not planned yet.`,
    noneYet: 'None planned yet.',
    allPlanned: 'All planned.',
  },
  // B5-F1: a Meal Slot on one date (lib/slotDate, hooks/useSlotDate, components/NotServedRow, SlotTimeDialog)
  slotDate: {
    whosEating: "Who's eating",
    notServed: 'Not served',
    timeToday: 'Time today',
    timeOn: (day: string) => `Time on ${day}`,
    needsConnection: 'Needs a connection',
    /** A menu choice that is unavailable offline: "Not served · Needs a connection". */
    unavailable: (label: string) => `${label} · Needs a connection`,
    confirmTitle: (dayName: string) => `Not serving ${dayName}?`,
    confirmBody: (dayName: string) => `${dayName} is left out of the plan, the Shopping List and reminders.`,
    theseGo: 'These go:',
    pinnedNote: 'Pinned',
    boughtNote: (names: string) => `Bought: ${names}`,
    boughtStays: 'What you bought stays in Stock.',
    toast: (dayName: string) => `${dayName} is not served`,
    row: (slot: string) => `${slot} · Not served`,
    planAgain: (slot: string) => `Plan ${slot} again`,
    timeTitle: (dayName: string) => `Time for ${dayName}`,
    timeLabel: 'Time',
    timeHelper: (usual: string) => `Usually ${usual}`,
    timeSave: 'Save',
    timeBack: (usual: string) => `Back to ${usual}`,
    timeCancel: 'Cancel',
    timeCaption: (time: string, usual: string) => `${time} · usually ${usual}`,
    guestsSuffix: (n: number) => (n === 1 ? '+1 Guest' : `+${n} Guests`),
    guestsCount: (n: number) => (n === 1 ? '1 Guest' : `${n} Guests`),
    datePast: 'That date has passed, so it cannot change.',
    slotStarted: (slot: string) => `Part of ${slot} is already Cooked or Not cooked, so it cannot be left out.`,
    timeInvalid: 'Enter a time such as 19:30.',
    failed: 'Could not save that. Try again.',
  },
} as const
