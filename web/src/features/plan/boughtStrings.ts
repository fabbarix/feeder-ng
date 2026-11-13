// Copy of Bought Planned Meals (b5-bow, beta5-plan 2.4). GLOSSARY terms only.
export const boughtStrings = {
  chip: 'Bought',
  line: (names: string) => `Bought for it: ${names}. Automatic plan changes leave it as it is.`,
  swapNote: (names: string) => `You bought ${names} for this; it stays in Stock.`,
  regenerateIntro: 'These have Ingredients you already bought and are replaced too:',
  regenerateRow: (day: string, slot: string, recipe: string, names: string) => `${day} ${slot} · ${recipe} (${names}).`,
  warnExcluded: (member: string, ingredient: string) => `${member} now excludes ${ingredient}, which this uses. Swap it to change it.`,
  warnExcludedRecipe: (member: string) => `${member} now excludes this Recipe. Swap it to change it.`,
  warnArchived: 'This Recipe is archived. Swap it to change it.',
  warnCourseLost: (course: string) => `This Recipe is no longer a ${course} Recipe. Swap it to change it.`,
  warnCourseLostAny: 'This Recipe is no longer a Recipe for this Course. Swap it to change it.',
  unknownMember: 'A Member',
  unknownIngredient: 'an Ingredient',
} as const
