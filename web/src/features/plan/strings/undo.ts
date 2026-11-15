// B9-26 (PC-01, SAFE-03, SAFE-07): the words of What changed, of Undo Cooked and Not cooked, and of the Regenerate toast.
// Every word of these three items lives here, so a later wording change ("meals" -> "Planned Meals", the Regenerate toast) is a
// one-file change. "meal" in "2 other meals changed" follows the approved mocks (main-session ruling 2); this module is not
// composed into planStrings (strings.snapshot.json pins that object), lib/replan.ts and lib/resolved.ts import it directly.

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

export const undoStrings = {
  // ---- mealLabel ("Tue Breakfast", "Tue Dinner, Side")
  slotLabel: (weekday: string, slot: string) => `${weekday} ${slot}`,
  courseLabel: (slotLabel: string, course: string) => `${slotLabel}, ${course}`,

  // ---- the What changed toast (lib/replan replanToast, otherUserToast)
  swapped: 'Swapped',
  swappedMeal: (label: string) => `Swapped ${label}`,
  chosen: 'Recipe chosen',
  chosenFor: (label: string) => `Recipe chosen for ${label}`,
  pinned: 'Pinned',
  pinnedMeal: (label: string) => `Pinned ${label}`,
  unpinned: 'Unpinned',
  unpinnedMeal: (label: string) => `Unpinned ${label}`,
  otherMealsChanged: (n: number) => `${n} other ${plural(n, 'meal', 'meals')} changed`,
  isNow: (label: string, recipe: string) => `${label} is now ${recipe}.`,
  isNowLeftover: (label: string, recipe: string) => `${label} is now ${recipe} from a Leftover.`,
  isNowEmpty: (label: string) => `${label} is now empty.`,
  andMore: (n: number) => `And ${n} more.`,
  review: 'Review',
  reviewAria: (n: number) => `Review ${n} changed ${plural(n, 'meal', 'meals')}`,
  /** The edit as Undo names it: "Undo the Swap", "Undo the Swap and 2 other changes". */
  editNoun: { swap: 'the Swap', choose: 'the Recipe choice', pin: 'the Pin', unpin: 'the Unpin', regenerate: 'Regenerate' },
  undoEdit: (edit: string) => `Undo ${edit}`,
  undoEditAndOthers: (edit: string, n: number) => `Undo ${edit} and ${n} other ${plural(n, 'change', 'changes')}`,

  // ---- Regenerate (SAFE-07; main-session ruling 3: one line, Undo, no Review)
  regenerated: (n: number) => `Plan regenerated: ${n} Planned ${plural(n, 'Meal', 'Meals')} changed`,
  regeneratedNothing: 'Plan regenerated: nothing needed to change',
  regenerateUndone: 'Your previous plan is back',
  /** The Regenerate question's Bought Planned Meals, behind one summary line, as rows. */
  regenerateBoughtSummary: (n: number) => (n === 1 ? '1 Bought Planned Meal is replaced' : `${n} Bought Planned Meals are replaced`),
  regenerateBoughtState: (names: string) => `${names} bought`,

  // ---- another User's edit (main-session ruling 1: "changed", the event cannot tell a Swap from a Pin)
  otherChanged: (name: string, label: string) => `${name} changed ${label}`,
  otherUnpinned: (name: string, label: string) => `${name} unpinned ${label}`,
  otherRegenerated: (name: string) => `${name} regenerated the plan`,
  otherChangedPlan: (name: string) => `${name} changed the plan`,

  // ---- the What changed sheet (lib/replan reviewModel, ReplanReviewSheet)
  reviewTitle: 'What changed',
  /** The edit as the sheet's context line names it: "After your Swap". */
  editName: { swap: 'Swap', choose: 'Recipe choice', pin: 'Pin', unpin: 'Unpin', regenerate: 'Regenerate' },
  contextOwn: (edit: string, n: number) => `After your ${edit} · ${n} other ${plural(n, 'meal', 'meals')}`,
  contextOther: (name: string, n: number) => `After ${name}'s change · ${n} other ${plural(n, 'meal', 'meals')}`,
  ledeOwn: (edit: string, label: string | null, n: number) =>
    `Your ${edit}${label ? ` on ${label}` : ''} moved ${n} other ${plural(n, 'meal', 'meals')}. Meals you Pinned or shopped for did not move.`,
  ledeOther: (name: string, label: string | null, n: number) =>
    `${name}'s change${label ? ` to ${label}` : ''} moved ${n} other ${plural(n, 'meal', 'meals')}. Meals that are Pinned or shopped for did not move.`,
  dayHeading: (weekday: string, day: number) => `${weekday} ${day}`,
  nothingPlanned: 'Nothing planned',
  was: (recipe: string) => `was ${recipe}`,
  wasNotPlanned: 'was not planned',
  undoAll: 'Undo all',
  keepChanges: 'Keep the changes',

  // ---- Cooked and Not cooked (lib/resolved; SAFE-03)
  cookedCheer: 'Cooked, nice one!',
  cookedSubline: (label: string, recipe: string) => `${label} · ${recipe}`,
  keptAsLeftover: (portions: string, day: string) => `${portions} kept as a Leftover, good until ${day}.`,
  plannedFor: (portions: string, meals: string) => `${portions} planned for ${meals}.`,
  byRecipe: (recipe: string, text: string) => `${recipe}: ${text}`,
  undoCookedFor: (label: string) => `Undo Cooked for ${label}`,
  undoCookedAll: (n: number) => `Undo Cooked for all ${n} Courses`,
  notCookedMarked: (label: string) => `${label} marked Not cooked`,
  undoNotCookedFor: (label: string) => `Undo Not cooked for ${label}`,
  backInToConfirm: (label: string) => `${label} is back in To confirm`,
  stockGone: (n: number) =>
    n === 1 ? '1 Stock Lot was already gone, so its Stock was not put back.' : `${n} Stock Lots were already gone, so their Stock was not put back.`,

  // ---- the Planned Meal sheet of a Cooked or Not cooked meal
  kindCooked: 'Cooked',
  kindNotCooked: 'Not cooked',
  markedToday: 'today',
  markedOn: (weekday: string) => `on ${weekday}`,
  summary: (kind: string, when: string, at: string | null, by: string | null) => `Marked ${kind} ${when}${at ? ` at ${at}` : ''}${by ? ` by ${by}` : ''}.`,
  leftoverKept: (portions: string, n: number) => `${portions} ${n === 1 ? 'was' : 'were'} kept as a Leftover.`,
  hintCooked: 'Undo Cooked puts back the Stock it used and removes its Leftover. You can undo it until the end of today, while nobody has had any of the Leftover.',
  hintNotCooked: 'Cooked after all? Mark it now and Feeder takes the Stock it used. Undo Not cooked puts it back in To confirm.',
  hintLeftoverUsed: (kind: string) => `Some of its Leftover was already had, so ${kind} can't be undone.`,
  hintWindowOver: (weekday: string) => `Marked on ${weekday}, so it can no longer be undone.`,
  hintCannotUndo: 'It can no longer be undone.',
  undoCooked: 'Undo Cooked',
  undoNotCooked: 'Undo Not cooked',
  cookedAfterAll: 'Cooked after all',
} as const
