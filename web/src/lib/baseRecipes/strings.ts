// BR-D: the copy of the Base recipe link flows that live in lib hooks (toasts, fallbacks). Glossary terms only.
export const baseRecipeLinkStrings = {
  linkedTo: (name: string) => `Linked to ${name} (Base recipe).`,
  plainIngredient: (name: string) => `${name} is a plain Ingredient on this line.`,
  undo: 'Undo',
  couldNotLink: 'The line could not be linked. Try again.',
  couldNotLoadBases: 'The Base recipes could not be loaded.',
  couldNotLoadCandidates: 'The lines could not be loaded. Try again.',
  couldNotMerge: 'The Ingredient could not be merged. Try again.',
  differentBaseUnits: (a: string, b: string) => `${a} and ${b} have different Base Units, so they cannot be merged.`,
  hasConflicts: 'It has conflicts to settle first. Merge it on its Ingredient page.',
} as const
