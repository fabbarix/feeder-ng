// B9-15: the Gallery's crafted Select groups (dev only, /_gallery): the open-list tools ("+N", sort), two-line options with
// thumbnails and groups, a chip that shortens by its own room, the FilterBar view row with its Sort, TimeZoneSelect and CurrencySelect.
import { useState, type ReactNode } from 'react'
import { PRIMARY_SCOPE_ATTR } from '../Button'
import { FilterBarViewRow } from '../FilterBar/FilterBar'
import { Segmented } from '../fields/Segmented'
import { CurrencySelect } from './CurrencySelect'
import { Select } from './Select'
import { ShopSelect } from './ShopSelect'
import { TimeZoneSelect } from './TimeZoneSelect'
import type { SelectFilter, SelectSort } from './buildList'
import type { SelectOption } from './lib'
import { recipeOptions, type RecipeChoice } from './options'

const RECIPES: RecipeChoice[] = [
  { id: 1, name: 'Slow-cooked lamb shoulder with rosemary, garlic and white beans', tags: ['Weekend', 'Family'], totalMinutes: 360 },
  { id: 2, name: 'Slow-cooked lamb shoulder with rosemary and potatoes', tags: ['Weekend'], totalMinutes: 300 },
  { id: 3, name: 'Pasta bake', tags: ['Pasta', 'Family', 'Quick'], totalMinutes: 45 },
  { id: 4, name: 'Chickpea curry', tags: ['Vegetarian', 'Quick'], totalMinutes: 35 },
  { id: 5, name: 'Fish pie', tags: ['Fish', 'Family'], totalMinutes: 75 },
  { id: 6, name: 'Frozen lasagne', tags: ['Quick'], readyMeal: true },
  { id: 7, name: 'Green salad', tags: ['Vegetarian', 'Quick'], totalMinutes: 10 },
  { id: 8, name: 'Roast chicken', tags: ['Weekend', 'Roast'], totalMinutes: 90 },
  { id: 9, name: 'Mushroom risotto', tags: ['Vegetarian'], totalMinutes: 40 },
  { id: 10, name: 'Beef stew', tags: ['Winter', 'Family'], totalMinutes: 150 },
]
const TAGS = ['Quick', 'Family', 'Weekend', 'Vegetarian', 'Pasta', 'Fish', 'Roast', 'Winter']
const OPTIONS: SelectOption<number>[] = recipeOptions(RECIPES).map((o, i) => ({ ...o, group: i % 3 === 2 ? 'Sides' : 'Mains' }))
const FILTERS: SelectFilter<number>[] = TAGS.map((t) => ({ id: t, label: t, predicate: (o) => (o.keywords ?? []).includes(t) }))
const SORTS: SelectSort<number>[] = [
  { id: 'name', label: 'Name', compare: (a, b) => a.label.localeCompare(b.label) },
  { id: 'meta', label: 'Time', compare: (a, b) => (a.meta ?? '').localeCompare(b.meta ?? '') },
]
const RANGES = [
  { value: 'fri', label: 'Until Friday 20 November', shortLabel: 'Fri 20' },
  { value: 'today', label: 'Today' },
]
const SHOPS = [
  { id: 0, name: 'Any Shop', shortName: 'Any' },
  { id: 1, name: 'Coop City Bellinzona' },
]
const PANTRY_SORTS = [
  { value: 'use', label: 'Good until' },
  { value: 'name', label: 'Name' },
]

function Cell({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="gallery__cell gallery__cell--wide" {...{ [PRIMARY_SCOPE_ATTR]: '' }}>
      {children}
      <p className="gallery__caption">{caption}</p>
    </div>
  )
}

function ViewRow({ width }: { width: string }) {
  const [view, setView] = useState<'place' | 'ingredient'>('place')
  const [sort, setSort] = useState('use')
  return (
    <div style={{ inlineSize: width, maxInlineSize: '100%' }}>
      <FilterBarViewRow
        view={
          <Segmented
            label="View"
            labelHidden
            compact
            options={[
              { value: 'place', label: 'Storage Place' },
              { value: 'ingredient', label: 'Ingredient' },
            ]}
            value={view}
            onChange={setView}
          />
        }
        sort={({ iconOnly }) => <Select label="Sort" appearance="chip" icon="sort" iconOnly={iconOnly} options={PANTRY_SORTS} value={sort} onChange={setSort} />}
      />
    </div>
  )
}

export function SelectGallery() {
  const [recipe, setRecipe] = useState<number | null>(null)
  const [range, setRange] = useState('fri')
  const [shop, setShop] = useState<number | null>(0)
  const [zone, setZone] = useState('Europe/Rome')
  const [currency, setCurrency] = useState('EUR')
  return (
    <>
      <section className="gallery__group">
        <h3>Crafted Select</h3>
        <div className="gallery__cells">
          <Cell caption="Recipe: search, one chip line with +N and sort, two-line options with thumbnails, groups">
            <Select<number> label="Recipe" placeholder="Choose a Recipe" options={OPTIONS} filters={FILTERS} sorts={SORTS} value={recipe} onChange={setRecipe} />
          </Cell>
          <Cell caption="Chips that shorten by their own room (Fri 20, Any)">
            <div style={{ display: 'flex', gap: 'var(--space-2)', minInlineSize: 0 }}>
              <Select label="Shop for" appearance="chip" icon="plan" options={RANGES} value={range} onChange={setRange} />
              <ShopSelect label="Shop" appearance="chip" icon="shops" shops={SHOPS} value={shop} onChange={setShop} />
            </div>
          </Cell>
          <Cell caption="FilterBar view row: Sort with its value, and icon-only where it does not fit (Sort: Good until)">
            <ViewRow width="100%" />
            <ViewRow width="20rem" />
          </Cell>
        </div>
      </section>
      <section className="gallery__group">
        <h3>TimeZoneSelect and CurrencySelect</h3>
        <div className="gallery__cells">
          <Cell caption="TimeZoneSelect (This device, regions, UTC offset and the time there)">
            <TimeZoneSelect value={zone} onChange={setZone} helper="Today, the Plan and notifications use it." />
          </Cell>
          <Cell caption="CurrencySelect (sm; Common, then All currencies)">
            <CurrencySelect value={currency} onChange={setCurrency} />
          </Cell>
        </div>
      </section>
    </>
  )
}
