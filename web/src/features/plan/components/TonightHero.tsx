import type { ReactNode } from 'react'
import { Button, Chip, Menu, RecipeThumb, Tile, type MenuEntry } from '../../../ui'
import { usePhraseContext } from '../hooks/usePhraseContext'
import { warningContextOf } from '../lib/bought'
import { heroChips, leftoverChip } from '../lib/chips'
import { compactRows, heroRow, slotCourses, wholeMealChip, type CourseRowModel } from '../lib/courses'
import type { HeroAction, HeroChip, HeroDay } from '../lib/hero'
import { heroChipLine, heroCookLabel, heroEyebrow, heroHint, isStartPart, slotCookLabel, slotIcon } from '../lib/hero'
import { heroMenuItems, type HeroMenuItem } from '../lib/heroMenu'
import { planStrings as s } from '../strings'
import type { PlannedMeal, PlanSlot, SlotDateActions, SlotDayKey, SlotKey } from '../types'
import { CourseRow, type CourseRowHandlers } from './CourseRow'
import { PlanChipView } from './PlanChipView'
import { RuleWarningLine } from './RuleWarningLine'
import type { SlotMenuProps } from './SlotMenu'
import '../plan.css'
import './TonightHero.css'

export interface TonightHeroProps {
  /** From lib/hero heroSelection; its meal is planned and its slot time has not come (TB-01). */
  slot: PlanSlot
  now: Date
  /** Open Cook Mode (Today routes to lib/cook cookPath). */
  onCook: (key: SlotDayKey) => void
  /** Kept for the callers; the hero no longer marks Cooked itself (TB-01: the past meal is To confirm's). */
  onYesCooked: (key: SlotKey) => void
  /** R12 "Reheat": open the Reheat screen of a meal served from a Leftover (lib/hero action 'reheat'). */
  /** Required for the Reheat action: without it the Reheat button is not shown. */
  onReheat?: (key: SlotKey) => void
  /** Kept for the callers; the hero no longer offers Adjust (TB-01). */
  onAdjust: (key: SlotKey) => void
  busy?: boolean
  /** N3: from lib/hero heroSelection. Default 'today' and 'cook'. */
  day?: HeroDay
  action?: HeroAction
  /** Household date, for Mark as Cooked on the compact rows and the slot menu (default: the slot's date). */
  today?: string
  /**
   * TB-10: the Recipe name, the Course names and the why chips open the Planned Meal sheet (`onOpen`, a chip with `{ section: 'why' }`);
   * the compact rows' Swap, Pin, ⋮; and the ⋮'s Swap, Pin and Unpin. Without them the name and the chips are plain.
   */
  rowHandlers?: CourseRowHandlers
  /** "Mark all Cooked" in the slot menu, when several Courses are still to cook. */
  onMarkAllCooked?: (slot: SlotDayKey) => void
  /** The slot menu's other actions (Not cooked: whole slot, Add <Course>). */
  menu?: Pick<SlotMenuProps, 'onNotCookedSlot' | 'onAddCourse'>
  /** B5-F1: the per-date choices (Who's eating, Time today, Not served) in the ⋮. */
  dateActions?: SlotDateActions
  /** TB-10: "Open Recipe" in the ⋮; not offered without it. */
  onOpenRecipe?: (recipeId: number) => void
}

/** TB-15b: the eyebrow as parts that wrap only between themselves; every part after the first carries its "·", the start part its own span. */
function HeroEyebrow({ parts }: { parts: string[] }): ReactNode {
  return parts.map((part, i) => (
    <span key={i} className="plan-hero__eyebrow-part">
      {i > 0 ? '· ' : null}
      {isStartPart(part) ? (
        <span className="plan-hero__start" data-now={part === s.startNow ? 'true' : undefined}>
          {part}
        </span>
      ) : (
        part
      )}
    </span>
  ))
}

/** One chip of the hero: a why chip is a button that opens the sheet at "Why this Recipe" (TB-10); a start chip has its glyph and tooltip (A2). */
function HeroChipView({ chip, onWhy }: { chip: HeroChip; onWhy?: (reason: string) => void }): ReactNode {
  if (chip.kind === 'why' && onWhy) {
    return (
      <Chip kind="why" as="button" label={s.heroWhyChip(chip.label)} title={chip.label} onClick={() => onWhy(chip.label)}>
        {chip.label}
      </Chip>
    )
  }
  if (chip.icon || chip.title) {
    return (
      <Chip kind={chip.kind} status={chip.status} icon={chip.icon} title={chip.title}>
        {chip.label}
      </Chip>
    )
  }
  return <PlanChipView chip={chip} />
}

/** The hero's ⋮ "<Slot> actions": Swap, Pin or Unpin, Open Recipe, then the slot's items (lib/heroMenu). */
function HeroMenu({ slot, items, heroKey, meal, props }: { slot: PlanSlot; items: HeroMenuItem[]; heroKey: SlotKey; meal: PlannedMeal; props: TonightHeroProps }): ReactNode {
  const slotKey: SlotDayKey = { date: slot.date, mealSlotId: slot.mealSlotId }
  const { rowHandlers: h, dateActions: d, menu } = props
  const act: Record<HeroMenuItem['id'], (item: HeroMenuItem) => void> = {
    swap: () => h?.onSwap?.(heroKey),
    pin: () => h?.onPin?.(heroKey),
    unpin: () => h?.onUnpin?.(heroKey),
    'open-recipe': () => props.onOpenRecipe?.(meal.recipeId),
    'mark-all-cooked': () => props.onMarkAllCooked?.(slotKey),
    'not-cooked-slot': () => menu?.onNotCookedSlot(slotKey),
    add: (item) => (item.key ? menu?.onAddCourse(item.key) : undefined),
    'whos-eating': () => d?.onWhosEating(slotKey),
    time: () => d?.onTime(slotKey),
    'not-served': () => d?.onNotServed(slotKey),
  }
  const entries: MenuEntry[] = items.map((item, i) => ({
    id: item.id === 'add' ? `add-${item.key?.courseId ?? i}` : item.id,
    label: item.label,
    disabled: item.disabled,
    onSelect: () => act[item.id](item),
  }))
  return <Menu label={s.slotActions(slot.name)} items={entries} />
}

/**
 * The Today hero (ui-fix-plan 2.1, 2.2, 5.1, docs/design/system.md round 2; B9-39 TB-01, TB-10, TB-15b): a full-width accent Tile, a
 * region named by its Recipe. Row 1 is the eyebrow and the ⋮; then the Recipe name (a button that opens the Planned Meal sheet),
 * up to 2 chips (the start chip first, why chips as buttons), the other Courses as compact rows, the "start now" hint, and Cook.
 * The hero always shows a slot whose time has not come: at the slot time it moves on (lib/hero heroSelection), so it never asks
 * "cooked?".
 */
export function TonightHero(props: TonightHeroProps): ReactNode {
  const { slot, now, today = slot.date, onCook, onReheat, day = 'today', action = 'cook', rowHandlers, menu, dateActions, onMarkAllCooked } = props
  const hero = heroRow(slot)
  const meal = hero?.course.meal ?? null
  const phrase = usePhraseContext(slot.date)
  if (!hero || !meal) return null
  const several = slotCourses(slot).length > 1
  const heroKey: SlotKey = hero.key
  // The region's name is its Recipe (TB-01). One hero per page, so the id is the slot's (stable across renders).
  const nameId = `plan-hero-${slot.date}-${slot.mealSlotId}`
  const slotKey: SlotDayKey = { date: slot.date, mealSlotId: slot.mealSlotId }
  const sel = { slot, day, action }
  const canReheat = action === 'reheat' && onReheat !== undefined
  // A meal served from a Leftover says so ("Leftover from Mon"); the start chip (A2) leads, two chips at most in all.
  const whole = several ? wholeMealChip(slot, hero) : null
  const chips = heroChipLine(slot, meal, now, [...(whole ? [whole] : []), ...leftoverChip(meal)], heroChips(meal, phrase))
  const hint = heroHint(sel, now)
  const others: CourseRowModel[] = several ? compactRows(slot) : []
  const items = heroMenuItems(slot, today, meal, {
    swap: rowHandlers?.onSwap !== undefined,
    pin: rowHandlers?.onPin !== undefined,
    unpin: rowHandlers?.onUnpin !== undefined,
    openRecipe: props.onOpenRecipe !== undefined,
    slotItems: menu !== undefined || (several && onMarkAllCooked !== undefined),
    dateChoices: dateActions !== undefined,
    offline: dateActions?.offline,
  })
  const onWhy = rowHandlers ? (reason: string) => rowHandlers.onOpen(heroKey, { section: 'why', reason }) : undefined
  return (
    <Tile
      as="section"
      variant="hero"
      span="full"
      aria-labelledby={nameId}
      overline={<HeroEyebrow parts={heroEyebrow(sel, now, { onToday: true })} />}
      overlineIcon={slotIcon(slot.name)}
      className="plan-hero"
    >
      {items.length > 0 || menu || dateActions ? (
        <div className="plan-hero__menu">{items.length > 0 ? <HeroMenu slot={slot} items={items} heroKey={heroKey} meal={meal} props={props} /> : null}</div>
      ) : null}
      <div className="plan-hero__body">
        {meal.photoUrl ? <RecipeThumb name={meal.recipeName} photoUrl={meal.photoUrl} size={72} label={meal.recipeName} /> : null}
        <div className="plan-hero__text">
          <h2 className="plan-hero__name" id={nameId}>
            {rowHandlers ? (
              <button type="button" className="plan-hero__name-button" onClick={() => rowHandlers.onOpen(heroKey)}>
                {meal.recipeName}
              </button>
            ) : (
              meal.recipeName
            )}
          </h2>
          {chips.length > 0 ? (
            <div className="plan-hero__chips">
              {chips.map((c) => (
                <HeroChipView key={c.key} chip={c} onWhy={onWhy} />
              ))}
            </div>
          ) : null}
          <RuleWarningLine warning={meal.warning} context={warningContextOf(slot, meal, hero.course.name)} />
        </div>
      </div>
      {others.length > 0 ? (
        <ul aria-label={`${slot.name} Courses`} className="plan-hero__courses">
          {others.map((row) => (
            <CourseRow
              key={row.course.courseId}
              row={row}
              slot={slot}
              today={today}
              compact
              actions={['swap', 'pin', 'more']}
              onOpen={(k) => rowHandlers?.onOpen(k)}
              onSwap={rowHandlers?.onSwap}
              onPin={rowHandlers?.onPin}
              onUnpin={rowHandlers?.onUnpin}
              onMarkCooked={rowHandlers?.onMarkCooked}
              onChoose={rowHandlers?.onChoose}
            />
          ))}
        </ul>
      ) : null}
      {hint ? <p className="plan-hero__hint">{hint}</p> : null}
      {action === 'cook' ? (
        <div className="plan-hero__actions">
          <Button variant="primary" size="lg" block="phone" icon="cook" onClick={() => onCook(several ? slotKey : heroKey)}>
            {several ? slotCookLabel(slot) : heroCookLabel(meal)}
          </Button>
        </div>
      ) : canReheat ? (
        <div className="plan-hero__actions">
          <Button variant="primary" size="lg" block="phone" icon="reheat" onClick={() => onReheat(heroKey)}>
            {s.reheat}
          </Button>
        </div>
      ) : null}
    </Tile>
  )
}
