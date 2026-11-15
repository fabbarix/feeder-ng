// English UI strings of the planning feature: the Today hero and the To confirm tile. Glossary terms only. Re-exported by ../strings.ts as part of planStrings.
export const heroStrings = {
  // Today hero and To confirm
  startBy: (time: string) => `start ${time}`,
  askCooked: (recipe: string) => `${recipe} cooked?`,
  yesCooked: 'Yes, Cooked',
  reheat: 'Reheat',
  adjust: 'Adjust',
  toConfirmTitle: 'To confirm',
  couldntPlanTitle: "Couldn't plan",
  leftoversTitle: 'Leftovers to use',
  leftoversOverline: 'Leftovers',
  /** DS 5: the Use-by leads, so the deciding fact survives a cut ("Use by Thu · 2 portions"). */
  leftoverRowMeta: (portions: string, useBy: string) => `${useBy} · ${portions}`,
  cookedCheer: 'Cooked, nice one!',
  // B9-39 (TB-01): the eyebrow's start part from the start time until the slot time, and the hint under the Courses
  startNow: 'start now',
  heroHint: {
    one: (time: string, recipe: string, duration: string) => `Ready at ${time}. ${recipe} needs ${duration}, so start it now.`,
    several: (time: string, recipe: string) => `Ready at ${time}. Start with ${recipe} now.`,
  },
  // B9-39 (TB-10): a why chip on the hero opens the Planned Meal sheet; the hero's ⋮ leads with the sheet's own actions
  heroWhyChip: (label: string) => `Why: ${label}. Open the Planned Meal`,
  heroOpenRecipe: 'Open Recipe',
  // B9-39 (TB-01): the polite announcement when a slot whose time has come joins To confirm
  movedToConfirm: (names: string) => `${names} moved to To confirm.`,
  // B9-39 (A11Y-08): a To confirm button's name, "Cooked Lentil soup, Mon 9 Lunch"
  toConfirmAction: (action: string, recipe: string, when: string) => `${action} ${recipe}, ${when}`,
} as const
