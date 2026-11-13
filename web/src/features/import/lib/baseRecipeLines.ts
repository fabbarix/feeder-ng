// BR-E (design §11.3): the rows, answers and "Confirm needs an answer" of the Base recipe line tiles, and the splits of the review's Problems and
// asks between the tiles and the rest. Pure TypeScript, no React.
import { joinNames } from '../../../lib/baseRecipes/refusals'
import type { LinkChoice } from '../../../lib/baseRecipes/useLineLink'
import { importStrings } from '../strings'
import type { BaseRecipeAnswer, BaseRecipeLine, ImportTakeOverAsk, Plan, Problem, Warning } from '../types'

const t = importStrings.baseRecipes

/** One answer the tile offers (a radio). `selected` marks the answer in force. */
export interface AnswerOption {
  id: string
  kind: 'use' | 'file' | 'create' | 'convert' | 'keep'
  label: string
  /** Second line of the option: the plain Ingredient's name beside Keep it as an Ingredient. */
  detail?: string
  /** The answer it sends; null for a convert, which opens the convert dialog first. */
  decision: BaseRecipeAnswer | null
  /** The plannable Recipe a convert option turns into a Base recipe. */
  recipe?: { id: number; name: string }
  selected: boolean
}

/** One Base recipe tile: the line as read, its answers, and whether it is answered. */
export interface BaseRecipeRow {
  path: string
  /** The Ingredient name of the line, for the Choose another picker. */
  name: string
  /** "500 ml béchamel · see page 42" */
  reading: string
  options: AnswerOption[]
  resolved: boolean
  effective?: BaseRecipeAnswer
}

/** The line as read: "500 ml béchamel", and the cue after a dot. */
export function lineReading(line: Pick<BaseRecipeLine, 'quantity' | 'unit' | 'name' | 'cue'>): string {
  const head = [String(line.quantity), line.unit, line.name].filter(Boolean).join(' ')
  return line.cue ? `${head} · ${line.cue}` : head
}

/** An option before its `selected` is known. */
type OptionDraft = Omit<AnswerOption, 'selected'>

/** Whether an option is the answer in force. */
function isEffective(o: OptionDraft, e: BaseRecipeAnswer | undefined): boolean {
  if (!e) return false
  switch (o.kind) {
    case 'use':
      return e.action === 'use' && e.recipeId === o.decision?.recipeId
    case 'file':
      return e.action === 'file' && e.recipeIndex === o.decision?.recipeIndex
    case 'create':
      return e.action === 'create' && Boolean(e.readNext) === Boolean(o.decision?.readNext)
    case 'convert':
      return e.action === 'convert' && e.recipeId === o.recipe?.id
    case 'keep':
      return e.action === 'keep'
  }
}

/**
 * The answers of a line, in order: existing Base recipes, Recipes of this file, the two new Base recipe variants (Fill in later,
 * Read it next), plannable Recipes (convert), and Keep it as an Ingredient. The always-present options come even with no suggestion.
 */
function optionsOf(line: BaseRecipeLine): AnswerOption[] {
  const drafts: OptionDraft[] = []
  for (const s of line.suggestions.filter((x) => x.kind === 'base')) {
    drafts.push({ id: `use:${s.recipeId}`, kind: 'use', label: t.useBase(s.name), decision: { action: 'use', recipeId: s.recipeId } })
  }
  for (const s of line.suggestions.filter((x) => x.kind === 'file')) {
    drafts.push({ id: `file:${s.recipeIndex}`, kind: 'file', label: t.useFile(s.name), decision: { action: 'file', recipeIndex: s.recipeIndex } })
  }
  drafts.push({ id: 'create', kind: 'create', label: t.createFillIn, decision: { action: 'create' } })
  drafts.push({ id: 'create-next', kind: 'create', label: t.createReadNext, decision: { action: 'create', readNext: true } })
  for (const s of line.suggestions.filter((x) => x.kind === 'plannable')) {
    drafts.push({ id: `convert:${s.recipeId}`, kind: 'convert', label: t.convert(s.name), decision: null, recipe: { id: s.recipeId!, name: s.name } })
  }
  drafts.push({ id: 'keep', kind: 'keep', label: t.keep, detail: line.keepIngredient?.name, decision: { action: 'keep' } })
  return drafts.map((o) => ({ ...o, selected: isEffective(o, line.effective) }))
}

/** The Base recipe tiles of a review, in the plan's order. */
export function baseRecipeRows(plan: Plan): BaseRecipeRow[] {
  return plan.baseRecipeLines.map((line) => ({
    path: line.path,
    name: line.name,
    reading: lineReading(line),
    options: optionsOf(line),
    resolved: line.resolved,
    effective: line.effective,
  }))
}

/** Tiles and take-over asks still waiting for an answer: what blocks Confirm. */
export function unansweredCount(plan: Plan): number {
  return plan.baseRecipeLines.filter((l) => !l.resolved).length + plan.takeOvers.filter((a) => !a.resolved).length
}

/** The sentence Confirm shows while a Base recipe question is open; null when none is. */
export function confirmNeedsAnswer(plan: Plan): string | null {
  const n = unansweredCount(plan)
  if (n === 0) return null
  if (n === 1) {
    const line = plan.baseRecipeLines.find((l) => !l.resolved)
    if (line) return t.needsOne(lineReading(line))
    return t.needsOne(plan.takeOvers.find((a) => !a.resolved)!.name)
  }
  return t.needsMany(n)
}

/** The take-over ask of the tile at `path`, if there is one. */
export function takeOverFor(plan: Plan, path: string): ImportTakeOverAsk | undefined {
  return plan.takeOvers.find((a) => a.path === path)
}

/** The Problems of one path, in order. */
export function problemsFor(path: string, list: readonly Problem[]): Problem[] {
  return list.filter((p) => p.path === path)
}

/** The warnings of one path, in order. */
export function warningsFor(path: string, list: readonly Warning[]): Warning[] {
  return list.filter((w) => w.path === path)
}

/** The Problems that belong to a Base recipe tile (their path is a tile's line), in the plan's order. */
export function problemsOnTiles(plan: Plan, list: readonly Problem[]): Problem[] {
  const paths = new Set(plan.baseRecipeLines.map((l) => l.path))
  return list.filter((p) => paths.has(p.path))
}

/** The Problems that no Base recipe tile shows: they stay in the generic list. */
export function genericProblems(plan: Plan, list: readonly Problem[]): Problem[] {
  const paths = new Set(plan.baseRecipeLines.map((l) => l.path))
  return list.filter((p) => !paths.has(p.path))
}

/** The take-over asks that no tile carries (a Base recipe of the file, imported on its own: its path is "$.recipes[i]"). */
export function standaloneAsks(plan: Plan): ImportTakeOverAsk[] {
  const paths = new Set(plan.baseRecipeLines.map((l) => l.path))
  return plan.takeOvers.filter((a) => !paths.has(a.path))
}

/** Whether the tile asks for a Yield: its answer is a file Recipe and the server refused it for want of one. */
export function askForYield(row: BaseRecipeRow, problems: readonly Problem[]): boolean {
  return row.effective?.action === 'file' && problems.some((p) => p.path === row.path && p.code === 'base_recipe_answer_invalid')
}

/** What a choice of the Choose another picker means: an answer sent now, or a plannable Recipe the convert dialog asks about first. */
export type LinkAnswer = { kind: 'answer'; answer: BaseRecipeAnswer } | { kind: 'convert'; recipe: { id: number; name: string } }

export function answerForLinkChoice(choice: LinkChoice): LinkAnswer {
  if (choice.kind === 'existing') return { kind: 'answer', answer: { action: 'use', recipeId: choice.baseRecipe.id } }
  if (choice.kind === 'new') return { kind: 'answer', answer: { action: 'create' } }
  return { kind: 'convert', recipe: choice.recipe }
}

/**
 * The take-over ask's facts: "An Ingredient named béchamel exists. It is on Moussaka and Lasagne, and 1 Stock Lot of it is in the Pantry."
 * ("It has no Stock" and "no Recipe" when they apply). The question is asked apart, see takeOverQuestion.
 */
export function takeOverFacts(ask: ImportTakeOverAsk): string {
  const names = ask.recipes.map((r) => r.name)
  const where = names.length === 0 ? t.onNoRecipe : t.onRecipes(joinNames(names))
  const sentence = ask.stockLots === 0 ? `${where} ${t.noStock}.` : `${where}, and ${t.stockLots(ask.stockLots)}.`
  return `${t.ingredientExists(ask.ingredient.name)} ${sentence}`
}

/** The ask's words in one sentence: facts, then the question. */
export function takeOverText(ask: ImportTakeOverAsk): string {
  return `${takeOverFacts(ask)} ${t.takeOverQuestion(ask.name)}`
}
