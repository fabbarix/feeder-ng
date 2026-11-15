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
} as const
