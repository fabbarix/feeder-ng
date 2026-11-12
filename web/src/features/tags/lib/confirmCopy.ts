// The wording of the Merge and Delete confirms (spec 4.1) from the summaries of lib/tags. Plain TypeScript, no React.
import type { DeleteSummary, MergeSummary } from '../../../lib/tags'
import { recipesPhrase } from './usage'
import { slotRuleLine } from './ruleLine'

export interface ConfirmCopy {
  title: string
  body: string
}

/** "Merge fish into Seafood?" and the sentences of what moves, goes or stays. */
export function mergeConfirmCopy(summary: MergeSummary): ConfirmCopy {
  const { source, target, recipes, bothRecipes } = summary
  const sentences: string[] = []
  if (recipes > 0) {
    const both = bothRecipes > 0 ? ` (${bothRecipes} already ${bothRecipes === 1 ? 'has' : 'have'} both)` : ''
    sentences.push(`${source} comes off its ${recipesPhrase(recipes)} and ${target} goes on instead${both}.`)
  } else {
    sentences.push(`No Recipe has ${source}.`)
  }
  for (const rule of summary.movedRules) sentences.push(`Slot Rule ${slotRuleLine(rule, source)} becomes = ${target}.`)
  for (const rule of summary.droppedRules) sentences.push(`Slot Rule ${slotRuleLine(rule, source)} goes, because ${target} already has a Slot Rule there.`)
  if (summary.varietyRule === 'moves') sentences.push(`${source}'s Variety Rule moves to ${target}.`)
  if (summary.varietyRule === 'goes') sentences.push(`${source}'s Variety Rule goes, because ${target} has its own.`)
  return { title: `Merge ${source} into ${target}?`, body: sentences.join(' ') }
}

/** "Delete fish?" and what it takes off its Recipes and with it (Slot Rules, the Variety Rule). Never refuses. */
export function deleteConfirmCopy(summary: DeleteSummary): ConfirmCopy {
  const { name, recipes } = summary
  let body: string
  if (recipes === 0) body = `${name} is on no Recipes.`
  else if (recipes === 1) body = `${name} is on 1 Recipe. Deleting it takes it off that Recipe.`
  else body = `${name} is on ${recipes} Recipes. Deleting it takes it off them.`
  const goesWith = [
    ...summary.rules.map((rule) => `the Slot Rule ${slotRuleLine(rule, name)}`),
    ...(summary.varietyRule ? [`the Variety Rule for ${name}`] : []),
  ]
  if (goesWith.length > 0) body += ` These go too: ${goesWith.join('; ')}.`
  return { title: `Delete ${name}?`, body }
}
