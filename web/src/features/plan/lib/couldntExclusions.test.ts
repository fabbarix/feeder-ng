// CRS G2 (rx-pt.md section 4, spec 7.4.1): the Review Exclusions page's phrasing and grouping. Plain TypeScript.
import { describe, expect, it } from 'vitest'
import { ADA, ALEX, EXCLUDED, KIM, SAM, WEEK, dinner, empty, exclusionCell, fishPie, garlic, member, planned, sideWeek } from '../couldnt-fixtures'
import { cellsAsEntries, excludedCells, excludedSummary, explanationGroups, optOutLine, recordAction, recordDetail, recordText } from './couldntExclusions'

const text = (parts: { text: string }[]) => parts.map((p) => p.text).join('')

describe('recordText: the first line of a row', () => {
  it('an Ingredient: "Sam excludes garlic", the Member and the Ingredient strong', () => {
    const parts = recordText(garlic())
    expect(text(parts)).toBe('Sam excludes garlic')
    expect(parts.filter((p) => p.strong).map((p) => p.text)).toEqual(['Sam', 'garlic'])
    expect(parts.every((p) => p.to === undefined)).toBe(true)
  })

  it('a direct Exclusion of one Recipe: "Alex excludes Fish pie", the Recipe a link to that Member\'s row of the preference table', () => {
    const parts = recordText(fishPie())
    expect(text(parts)).toBe('Alex excludes Fish pie')
    expect(parts.filter((p) => p.to).map((p) => [p.text, p.to])).toEqual([['Fish pie', '/recipes/3#preference-member-2']])
  })

  it('a direct Exclusion of several Recipes: "Alex excludes 3 Recipes: Fish pie, Lasagne and Paella", each a link', () => {
    const rec = fishPie(ALEX, { recipes: [{ id: 3, name: 'Fish pie' }, { id: 9, name: 'Lasagne' }, { id: 11, name: 'Paella' }], recipeCount: 3 })
    const parts = recordText(rec)
    expect(text(parts)).toBe('Alex excludes 3 Recipes: Fish pie, Lasagne and Paella')
    expect(parts.filter((p) => p.to).map((p) => p.to)).toEqual(['/recipes/3#preference-member-2', '/recipes/9#preference-member-2', '/recipes/11#preference-member-2'])
  })

  it('more than three Recipes: the first three, then "and N more" (N from recipeCount, which can exceed the five sent)', () => {
    const five = ['Aloo gobi', 'Bhuna', 'Chowder', 'Dal', 'Eggah'].map((name, i) => ({ id: 20 + i, name }))
    expect(text(recordText(fishPie(ALEX, { recipes: five, recipeCount: 7 })))).toBe('Alex excludes 7 Recipes: Aloo gobi, Bhuna, Chowder and 4 more')
    expect(text(recordText(fishPie(ALEX, { recipes: five.slice(0, 4), recipeCount: 4 })))).toBe('Alex excludes 4 Recipes: Aloo gobi, Bhuna, Chowder and 1 more')
  })

  it('two Recipes: "A and B"', () => {
    expect(text(recordText(fishPie(ALEX, { recipes: [{ id: 3, name: 'Fish pie' }, { id: 9, name: 'Lasagne' }], recipeCount: 2 })))).toBe('Alex excludes 2 Recipes: Fish pie and Lasagne')
  })

  it('uses the Member\'s first name only, as the pills do', () => {
    expect(text(recordText(garlic(member(8, 'Sam Rivera'))))).toBe('Sam excludes garlic')
  })
})

describe('recordDetail: what an Ingredient rules out', () => {
  it('"Rules out 4 Recipes: Bolognese, Garlic bread, Pesto pasta and 1 more"', () => {
    expect(recordDetail(garlic())).toBe('Rules out 4 Recipes: Bolognese, Garlic bread, Pesto pasta and 1 more')
  })
  it('three or fewer are all named', () => {
    expect(recordDetail(garlic(SAM, { recipes: [{ id: 4, name: 'Bolognese' }, { id: 5, name: 'Garlic bread' }], recipeCount: 2 }))).toBe('Rules out 2 Recipes: Bolognese and Garlic bread')
  })
  it('one Recipe is singular', () => {
    expect(recordDetail(garlic(SAM, { recipes: [{ id: 5, name: 'Garlic bread' }], recipeCount: 1 }))).toBe('Rules out 1 Recipe: Garlic bread')
  })
  it('a direct Exclusion has no second line', () => expect(recordDetail(fishPie())).toBeNull())
})

describe('recordAction: the trailing link', () => {
  it('"Review garlic" goes to the Ingredient\'s Excluded by Tile', () => {
    expect(recordAction(garlic())).toEqual({ label: 'Review garlic', to: '/ingredients/12#exclusions' })
  })
  it('a direct Exclusion has none: its Recipes are links already', () => expect(recordAction(fishPie())).toBeNull())
})

describe('optOutLine', () => {
  it('one Member: "Kim opts out of Side, so Kim\'s Exclusions don\'t count here."', () => {
    expect(optOutLine({ courseName: 'Side', optOuts: [KIM] })).toBe("Kim opts out of Side, so Kim's Exclusions don't count here.")
  })
  it('two Members', () => {
    expect(optOutLine({ courseName: 'Side', optOuts: [KIM, ADA] })).toBe("Kim and Ada opt out of Side, so their Exclusions don't count here.")
  })
  it('three Members', () => {
    expect(optOutLine({ courseName: 'Dessert', optOuts: [KIM, ADA, SAM] })).toBe("Kim, Ada and Sam opt out of Dessert, so their Exclusions don't count here.")
  })
  it('nobody opts out: no line', () => expect(optOutLine({ courseName: 'Side', optOuts: [] })).toBeNull())
})

describe('excludedCells: only what the Couldn\'t plan tile files under Excluded', () => {
  const base = exclusionCell('2026-11-13')
  it('keeps a cell where Exclusions removed the most', () => expect(excludedCells([base])).toEqual([base]))
  it('drops a Slot Rule cell (its tile says Review Slot Rules)', () => {
    expect(excludedCells([exclusionCell('2026-11-13', { slotRuleClaimed: true })])).toEqual([])
  })
  it('drops a cell where an Advance Step removed more (its tile says Choose a Recipe)', () => {
    expect(excludedCells([exclusionCell('2026-11-13', { eliminated: { considered: 5, exclusion: 1, coolDown: 0, varietyRule: 0, advanceStep: 3 } })])).toEqual([])
  })
  it('a tie goes to Exclusion', () => {
    const tie = exclusionCell('2026-11-13', { eliminated: { considered: 4, exclusion: 2, coolDown: 0, varietyRule: 0, advanceStep: 2 } })
    expect(excludedCells([tie])).toEqual([tie])
  })
  it('a stored Cool-down count never moves a cell away from Excluded', () => {
    const old = exclusionCell('2026-11-13', { eliminated: { considered: 6, exclusion: 2, coolDown: 4, varietyRule: 0, advanceStep: 0 } })
    expect(excludedCells([old])).toEqual([old])
  })
})

describe('cellsAsEntries', () => {
  it('turns a cell into the flat entry the tile code groups: the Meal Slot name as `name`, reason no_candidates', () => {
    const [e] = cellsAsEntries([exclusionCell('2026-11-13')])
    expect(e).toMatchObject({ date: '2026-11-13', mealSlotId: 4, name: 'Dinner', time: '19:00', courseId: 2, courseName: 'Side', meal: null })
    expect(e!.unfilled).toMatchObject({ reason: 'no_candidates', slotRuleClaimed: false, eliminated: { considered: 4, exclusion: 4 } })
  })
})

describe('excludedSummary: the headline of the page\'s first Tile', () => {
  const slots = sideWeek(['2026-11-13', '2026-11-14', '2026-11-15'])
  it('is the Excluded tile\'s headline, over the cells held back by Exclusions', () => {
    const cells = ['2026-11-13', '2026-11-14', '2026-11-15'].map((d) => exclusionCell(d))
    expect(excludedSummary(cells, slots)).toBe("Couldn't plan 3 Sides. Every Recipe is excluded for someone who eats it.")
  })
  it('is null when no cell is held back by Exclusions', () => {
    expect(excludedSummary([], slots)).toBeNull()
    expect(excludedSummary([exclusionCell('2026-11-13', { slotRuleClaimed: true })], slots)).toBeNull()
  })
})

describe('explanationGroups: cells explained the same way share a Tile', () => {
  const slots = sideWeek(['2026-11-13', '2026-11-14', '2026-11-15'])
  const three = ['2026-11-13', '2026-11-14', '2026-11-15'].map((d) => exclusionCell(d))

  it('three Sides explained by Sam\'s garlic are one group', () => {
    const groups = explanationGroups(three, slots)
    expect(groups).toHaveLength(1)
    const g = groups[0]!
    expect(g.courseId).toBe(2)
    expect(g.courseName).toBe('Side')
    expect(g.cells).toHaveLength(3)
    expect(g.exclusions).toEqual([garlic()])
    expect(g.attendance).toEqual([SAM, ALEX])
    expect(g.optOuts).toEqual([])
    expect(g.moreExclusions).toBe(0)
  })

  it('names the cells as the Couldn\'t plan summary does, and lists each with the id its line carries', () => {
    const g = explanationGroups(three, slots)[0]!
    expect(g.summary).toBe('Side at Friday, Saturday and Sunday dinners')
    expect(g.items.map((i) => i.text)).toEqual(['Fri 13 Nov · Dinner · Side', 'Sat 14 Nov · Dinner · Side', 'Sun 15 Nov · Dinner · Side'])
    expect(g.items.map((i) => i.id)).toEqual(['cell-2026-11-13-4-2', 'cell-2026-11-14-4-2', 'cell-2026-11-15-4-2'])
    expect(g.items.every((i) => i.to === undefined)).toBe(true)
  })

  it('"every dinner this week" when all the Side dinners are in it', () => {
    const all = WEEK.map((d) => exclusionCell(d))
    expect(explanationGroups(all, sideWeek(WEEK))[0]!.summary).toBe('Side at every dinner this week')
  })

  it('a different set of Members who eat it splits the group, in the order of the first cell', () => {
    const away = exclusionCell('2026-11-14', { attendance: [SAM], optOuts: [ALEX] })
    const groups = explanationGroups([three[0]!, away, three[2]!], slots)
    expect(groups.map((g) => g.cells.map((c) => c.date))).toEqual([['2026-11-13', '2026-11-15'], ['2026-11-14']])
    expect(groups[1]!.optOuts).toEqual([ALEX])
  })

  it('different Exclusions, or a different "and N more", split the group', () => {
    const other = exclusionCell('2026-11-14', { exclusions: [garlic(), fishPie()] })
    const more = exclusionCell('2026-11-15', { moreExclusions: 2 })
    expect(explanationGroups([three[0]!, other, more], slots)).toHaveLength(3)
  })

  it('cells of different Courses never share a Tile, even with the same Exclusions', () => {
    const dessert = exclusionCell('2026-11-13', { courseId: 3, courseName: 'Dessert' })
    const groups = explanationGroups([three[0]!, dessert], [...slots, dinner('2026-11-13', [planned(1, 'Main'), planned(2, 'Side'), empty(3, 'Dessert', EXCLUDED)])])
    expect(groups.map((g) => g.courseName)).toEqual(['Side', 'Dessert'])
  })

  it('cells with no detail yet (exclusions: null) group together and apart from cells with detail', () => {
    const none = (d: string) => exclusionCell(d, { exclusions: null })
    const groups = explanationGroups([none('2026-11-13'), three[1]!, none('2026-11-15')], slots)
    expect(groups.map((g) => [g.exclusions === null, g.cells.length])).toEqual([[true, 2], [false, 1]])
  })

  it('files only the cells Couldn\'t plan files under Excluded', () => {
    expect(explanationGroups([exclusionCell('2026-11-13', { slotRuleClaimed: true })], slots)).toEqual([])
  })

  it('nothing held back, nothing to explain', () => expect(explanationGroups([], slots)).toEqual([]))

  it('a Household with one Course per slot: no Course name in the lines', () => {
    const one = [exclusionCell('2026-11-13', { courseId: 1, courseName: 'Main' })]
    const plain = [dinner('2026-11-13', [empty(1, 'Main', EXCLUDED)])]
    const g = explanationGroups(one, plain)[0]!
    expect(g.items[0]!.text).toBe('Fri 13 Nov · Dinner')
    expect(g.summary).toBe('Friday dinner')
  })

  it('the same input gives the same keys', () => {
    expect(explanationGroups(three, slots).map((g) => g.key)).toEqual(explanationGroups(three, slots).map((g) => g.key))
    expect(new Set(explanationGroups([three[0]!, exclusionCell('2026-11-14', { moreExclusions: 2 })], slots).map((g) => g.key)).size).toBe(2)
  })
})

