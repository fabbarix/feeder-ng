import { Fragment, type ReactNode } from 'react'
import { Button, RecipeThumb, Tile } from '../../../ui'
import { usePhraseContext } from '../hooks/usePhraseContext'
import { warningContextOf } from '../lib/bought'
import { heroChips, leftoverChip } from '../lib/chips'
import { compactRows, heroRow, plannedMeals, slotCourses, wholeMealChip } from '../lib/courses'
import type { HeroAction, HeroDay } from '../lib/hero'
import { heroCookLabel, heroEyebrow, heroPhase, slotCookLabel, slotIcon } from '../lib/hero'
import { planStrings as s } from '../strings'
import type { PlanSlot, SlotDateActions, SlotDayKey, SlotKey } from '../types'
import { CourseRow, type CourseRowHandlers } from './CourseRow'
import { PlanChipView } from './PlanChipView'
import { RuleWarningLine } from './RuleWarningLine'
import { SlotMenu, type SlotMenuProps } from './SlotMenu'
import '../plan.css'

export interface TonightHeroProps {
  /** From lib/days heroMeal; its meal is planned. */
  slot: PlanSlot
  now: Date
  /** Open Cook Mode (Today routes to lib/cook cookPath). */
  onCook: (key: SlotDayKey) => void
  /** "Yes, Cooked": mark Cooked with the planned Leftover portions in one tap. */
  onYesCooked: (key: SlotKey) => void
  /** R12 "Reheat": open the Reheat screen of a meal served from a Leftover (lib/hero action 'reheat'). */
  /** Required for the Reheat action: without it the Reheat button is not shown. */
  onReheat?: (key: SlotKey) => void
  /** "Adjust": open the Mark as Cooked sheet. */
  onAdjust: (key: SlotKey) => void
  /** True while a Yes, Cooked is being saved. */
  busy?: boolean
  /** N3: from lib/hero heroSelection. Default 'today' and 'cook'. */
  day?: HeroDay
  action?: HeroAction
  /** Household date, for Mark as Cooked on the compact rows and the slot menu (default: the slot's date). */
  today?: string
  /** The compact rows' actions (Swap, Pin or Unpin, Mark as Cooked); the Recipe name opens the Course's sheet. */
  rowHandlers?: CourseRowHandlers
  /** "Mark all Cooked" of the hero after the slot time, when several Courses are still to cook. */
  onMarkAllCooked?: (slot: SlotDayKey) => void
  /** The slot menu's other actions; the menu shows when given. */
  menu?: Pick<SlotMenuProps, 'onNotCookedSlot' | 'onAddCourse'>
  /** B5-F1: the per-date choices; the hero (a one-Course slot too) then has the slot menu with Who's eating, the time and Not served. */
  dateActions?: SlotDateActions
}

/**
 * The Today hero (ui-fix-plan 2.1, 2.2, 5.1): a full-width accent Tile (variant hero). Before the slot time: overline
 * "DINNER · 19:30" with "start 18:45" when known, the Recipe name, up to 2 why chips, a primary Cook button
 * "Cook · 45 min", a photo thumb when there is one. After the slot time (lib/hero heroPhase): "<Recipe> cooked?" with
 * primary "Yes, Cooked" and secondary "Adjust". The Cook button is the only primary in the tile.
 */
/** DS-TODAY: the hero's eyebrow in one line, "Tomorrow · Dinner · start 19:09"; each part is its own span. */
function HeroEyebrow({ parts }: { parts: string[] }): ReactNode {
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 ? ' · ' : null}
      <span>{part}</span>
    </Fragment>
  ))
}

export function TonightHero(props: TonightHeroProps): ReactNode {
  if (slotCourses(props.slot).length > 1) return <SeveralCoursesHero {...props} />
  return <SingleHero {...props} />
}

/** A slot that serves one Course: the single-Recipe hero, as before. */
function SingleHero({ slot, now, today = slot.date, onCook, onYesCooked, onReheat, onAdjust, busy = false, day = 'today', action = 'cook', dateActions }: TonightHeroProps): ReactNode {
  const row = heroRow(slot)
  const meal = row?.course.meal ?? null
  const phrase = usePhraseContext(slot.date)
  if (!meal || !row) return null
  const key: SlotKey = row.key
  const phase = heroPhase(slot, now)
  const canReheat = action === 'reheat' && onReheat !== undefined
  // A meal served from a Leftover says so ("Leftover from Mon"); the why chips follow, two at most in all.
  const chips = [...leftoverChip(meal), ...heroChips(meal, phrase)].slice(0, 2)
  // Yes, Cooked / Adjust only for a meal of today (a future meal may not be marked Cooked).
  const awaiting = phase === 'awaiting' && day === 'today'

  return (
    <Tile variant="hero" span="full" overline={<HeroEyebrow parts={heroEyebrow({ slot, day, action }, now)} />} overlineIcon={slotIcon(slot.name)} className="plan-hero">
      {dateActions ? (
        <div className="plan-hero__menu">
          <SlotMenu slot={slot} today={today} onMarkAllCooked={noop} onNotCookedSlot={noop} onAddCourse={noop} dateActions={dateActions} />
        </div>
      ) : null}
      <div className="plan-hero__body">
        {meal.photoUrl ? <RecipeThumb name={meal.recipeName} photoUrl={meal.photoUrl} size={72} label={meal.recipeName} /> : null}
        <div className="plan-hero__text">
          <h2 className="plan-hero__name">{awaiting ? s.askCooked(meal.recipeName) : meal.recipeName}</h2>
          {!awaiting && chips.length > 0 ? (
            <div className="plan-hero__chips">
              {chips.map((c) => (
                <PlanChipView key={c.key} chip={c} />
              ))}
            </div>
          ) : null}
          <RuleWarningLine warning={meal.warning} context={warningContextOf(slot, meal, row.course.name)} />
        </div>
      </div>
      {!awaiting ? (
        action === 'cook' ? (
          <div className="plan-hero__actions">
            <Button variant="primary" size="lg" block="phone" icon="cook" onClick={() => onCook(key)}>
              {heroCookLabel(meal)}
            </Button>
          </div>
        ) : canReheat ? (
          <div className="plan-hero__actions">
            <Button variant="primary" size="lg" block="phone" icon="reheat" onClick={() => onReheat(key)}>
              {s.reheat}
            </Button>
          </div>
        ) : null
      ) : (
        <div className="plan-hero__actions">
          <Button variant="primary" size="lg" block="phone" icon="markCooked" disabled={busy} onClick={() => onYesCooked(key)}>
            {s.yesCooked}
          </Button>
          {canReheat ? (
            <Button variant="secondary" size="lg" icon="reheat" disabled={busy} onClick={() => onReheat(key)}>
              {s.reheat}
            </Button>
          ) : (
            <Button variant="secondary" size="lg" disabled={busy} onClick={() => onAdjust(key)}>
              {s.adjust}
            </Button>
          )}
        </div>
      )}
    </Tile>
  )
}

const noop = () => {}

/**
 * A slot with several Courses (spec 7.5): the hero is the main Course's Planned Meal (or the first Course still to
 * cook); the other Courses are compact rows under it. Cook, "start" and "Cook · 30 min" are the slot's (the timeline).
 * After the slot time with two or more Courses to cook: "<Slot> cooked?" and one primary Mark all Cooked; with one left
 * it is a one-Course hero whose Yes, Cooked and Adjust report that Course.
 */
function SeveralCoursesHero({ slot, now, onCook, onYesCooked, onReheat, onAdjust, busy = false, day = 'today', action = 'cook', today = slot.date, rowHandlers = { onOpen: noop }, onMarkAllCooked = noop, menu, dateActions }: TonightHeroProps): ReactNode {
  const hero = heroRow(slot)
  const meal = hero?.course.meal
  const phrase = usePhraseContext(slot.date)
  if (!hero || !meal) return null
  const slotKey: SlotDayKey = { date: slot.date, mealSlotId: slot.mealSlotId }
  const left = plannedMeals(slot).length
  const phase = heroPhase(slot, now)
  const awaiting = phase === 'awaiting' && day === 'today'
  const allAtOnce = awaiting && left >= 2
  const canReheat = action === 'reheat' && onReheat !== undefined
  const whole = wholeMealChip(slot, hero)
  const chips = [...(whole ? [whole] : []), ...leftoverChip(meal), ...heroChips(meal, phrase)].slice(0, 2)
  const others = compactRows(slot)
  const heading = allAtOnce ? s.askCooked(slot.name) : awaiting ? s.askCooked(meal.recipeName) : meal.recipeName

  return (
    <Tile variant="hero" span="full" overline={<HeroEyebrow parts={heroEyebrow({ slot, day, action }, now)} />} overlineIcon={slotIcon(slot.name)} className="plan-hero">
      {menu || dateActions ? (
        <div className="plan-hero__menu">
          <SlotMenu
            slot={slot}
            today={today}
            onMarkAllCooked={onMarkAllCooked}
            onNotCookedSlot={menu?.onNotCookedSlot ?? noop}
            onAddCourse={menu?.onAddCourse ?? noop}
            dateActions={dateActions}
          />
        </div>
      ) : null}
      <div className="plan-hero__body">
        {meal.photoUrl ? <RecipeThumb name={meal.recipeName} photoUrl={meal.photoUrl} size={72} label={meal.recipeName} /> : null}
        <div className="plan-hero__text">
          <h2 className="plan-hero__name">{heading}</h2>
          {!awaiting && chips.length > 0 ? (
            <div className="plan-hero__chips">
              {chips.map((c) => (
                <PlanChipView key={c.key} chip={c} />
              ))}
            </div>
          ) : null}
          <RuleWarningLine warning={meal.warning} context={warningContextOf(slot, meal, hero.course.name)} />
        </div>
      </div>
      {!awaiting ? (
        action === 'cook' ? (
          <div className="plan-hero__actions">
            <Button variant="primary" size="lg" block="phone" icon="cook" onClick={() => onCook(slotKey)}>
              {slotCookLabel(slot)}
            </Button>
          </div>
        ) : canReheat ? (
          <div className="plan-hero__actions">
            <Button variant="primary" size="lg" block="phone" icon="reheat" onClick={() => onReheat(hero.key)}>
              {s.reheat}
            </Button>
          </div>
        ) : null
      ) : allAtOnce ? (
        <div className="plan-hero__actions">
          <Button variant="primary" size="lg" block="phone" icon="markCooked" disabled={busy} onClick={() => onMarkAllCooked(slotKey)}>
            {s.markAllCooked}
          </Button>
        </div>
      ) : (
        <div className="plan-hero__actions">
          <Button variant="primary" size="lg" block="phone" icon="markCooked" disabled={busy} onClick={() => onYesCooked(hero.key)}>
            {s.yesCooked}
          </Button>
          {canReheat ? (
            <Button variant="secondary" size="lg" icon="reheat" disabled={busy} onClick={() => onReheat(hero.key)}>
              {s.reheat}
            </Button>
          ) : (
            <Button variant="secondary" size="lg" disabled={busy} onClick={() => onAdjust(hero.key)}>
              {s.adjust}
            </Button>
          )}
        </div>
      )}
      {others.length > 0 ? (
        <ul aria-label={`${slot.name} Courses`} className="plan-hero__courses">
          {others.map((row) => (
            <CourseRow
              key={row.course.courseId}
              row={row}
              slot={slot}
              today={today}
              compact
              onAccent
              actions={['swap', 'pin', 'more']}
              onOpen={rowHandlers.onOpen}
              onSwap={rowHandlers.onSwap}
              onPin={rowHandlers.onPin}
              onUnpin={rowHandlers.onUnpin}
              onMarkCooked={rowHandlers.onMarkCooked}
              onChoose={rowHandlers.onChoose}
            />
          ))}
        </ul>
      ) : null}
    </Tile>
  )
}
