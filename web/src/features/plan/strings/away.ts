// English UI strings of the planning feature: Away (B9-46, PC-08 and SET-16). Glossary terms only. Re-exported by ../strings.ts as
// part of planStrings, all under `away`.
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
/** "A", "A and B", "A, B and C". */
const andList = (names: string[]) => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)

export const awayStrings = {
  away: {
    // The sheet
    someoneIsAway: 'Someone is away',
    isAway: (name: string) => `${name} is away`,
    contextFrom: (from: string) => `From ${from}`,
    contextMemberFrom: (name: string, from: string) => `${name} · from ${from}`,
    newAway: 'New Away',
    who: 'Who',
    firstDay: 'First day',
    lastDay: 'Last day',
    fromSlot: 'From',
    throughSlot: 'Through',
    wholeDay: (slot: string) => `${slot} (whole day)`,
    noLastDay: 'No last day yet',
    staysAway: (name: string) => `${name} stays away until you end it.`,
    staysAwayAnyone: 'They stay away until you end it.',
    whatChanges: 'What changes',
    checking: 'Checking the plan…',
    previewFailed: 'Feeder could not check the plan just now.',
    chooseWho: 'Choose who is away to see what changes.',
    saveAway: 'Save Away',
    save: 'Save',
    remove: 'Remove',
    endToday: 'End today',
    removeName: (range: string, name: string) => `Remove Away ${range} for ${name}`,
    endName: (range: string, name: string) => `End today: Away ${range} for ${name}`,
    // What changes
    summary: (slots: number, name: string, meals: number) =>
      `${plural(slots, 'Meal Slot', 'Meal Slots')} without ${name} · ${meals === 0 ? 'no meals change' : meals === 1 ? '1 meal changes' : `${meals} meals change`}`,
    nothingChanges: "Nothing in this week's plan changes",
    meals: (n: number) => plural(n, 'meal', 'meals'),
    mealSlots: (n: number) => plural(n, 'Meal Slot', 'Meal Slots'),
    unchanged: 'Unchanged',
    staySame: (where: string) => `${where} · portions stay the same`,
    samePortions: (names: string[], before: string, after: string) => `${names.join(', ')} · ${before} → ${after} portions`,
    eachPortions: (parts: string[]) => `${parts.join(' · ')} portions`,
    planRunsTo: (day: string) => `The plan runs to ${day}.`,
    plansWithout: (day: string, name: string) => `From ${day} the planner plans without ${name}.`,
    // The toasts
    changedBody: (n: number, to: string | null, where: string) => `${plural(n, 'meal', 'meals')} changed${to ? ` to ${to}` : ''}: ${where}.`,
    changedHeadline: (name: string) => `${name}'s Away changed`,
    endedHeadline: (name: string) => `${name}'s Away ended`,
    removedHeadline: (name: string) => `${name}'s Away removed`,
    backHeadline: (name: string) => `${name}'s Away is back`,
    backToday: (slot: string) => `Back from ${slot} today`,
    backFrom: (when: string) => `Back from ${when}`,
    // The day tile and the slot header
    allDay: (name: string) => `${name} away all day`,
    namesAway: (names: string[]) => `${andList(names)} away`,
    everyoneAway: 'Everyone is away',
    lineName: (line: string, day: string) => `${line}, ${day}`,
    // The slot ⋮
    menuItem: 'Someone is away…',
    // Who's eating
    awayRow: (range: string) => `Away ${range}`,
    eatsHereAnyway: 'Eats here anyway',
    eatsHereAnywayFor: (name: string) => `${name} eats here anyway`,
    moreDays: 'Someone away for more days?',
    addAway: 'Add an Away',
    // Members list and the Member sheet (SET-16)
    metaRange: (range: string) => `Away ${range}`,
    metaUntil: (day: string) => `Away until ${day}`,
    metaFrom: (day: string) => `Away from ${day}`,
    metaMore: (n: number) => `+${n} more`,
    rowName: (title: string, state: string, detail: string) => `Away ${title}, ${state}, ${detail}`,
    memberRowName: (name: string, meta: string) => `${name}, ${meta}`,
    sectionTitle: 'Away',
    listName: (name: string) => `${name}'s Aways`,
    none: 'Not away on any day.',
    now: 'now',
    today: 'today',
    inDays: (n: number) => `in ${plural(n, 'day', 'days')}`,
    wholeDays: 'whole days',
    noLastDayDetail: 'No last day yet',
    fromNamed: (slot: string) => `From ${slot}`,
    throughNamed: (slot: string) => `Through ${slot}`,
    fromThrough: (from: string, through: string) => `From ${from} through ${through}`,
    andList,
  },
} as const
