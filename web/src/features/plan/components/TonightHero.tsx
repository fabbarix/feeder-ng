import type { ReactNode } from 'react'
import { Button, Chip, RecipeThumb, Tile } from '../../../ui'
import { heroChips } from '../lib/chips'
import type { HeroAction, HeroDay } from '../lib/hero'
import { heroCookLabel, heroOverline, heroPhase, heroStartBy, slotIcon } from '../lib/hero'
import { planStrings as s } from '../strings'
import type { PlanSlot, SlotKey } from '../types'
import '../plan.css'

export interface TonightHeroProps {
  /** From lib/days heroMeal; its meal is planned. */
  slot: PlanSlot
  now: Date
  /** Open Cook Mode (Today routes to lib/cook cookPath). */
  onCook: (key: SlotKey) => void
  /** "Yes, Cooked": mark Cooked with the planned Leftover portions in one tap. */
  onYesCooked: (key: SlotKey) => void
  /** "Adjust": open the Mark as Cooked sheet. */
  onAdjust: (key: SlotKey) => void
  /** True while a Yes, Cooked is being saved. */
  busy?: boolean
  /** N3: from lib/hero heroSelection. Default 'today' and 'cook'. */
  day?: HeroDay
  action?: HeroAction
}

/**
 * The Today hero (ui-fix-plan 2.1, 2.2, 5.1): a full-width accent Tile (variant hero). Before the slot time: overline
 * "DINNER · 19:30" with "start 18:45" when known, the Recipe name, up to 2 why chips, a primary Cook button
 * "Cook · 45 min", a photo thumb when there is one. After the slot time (lib/hero heroPhase): "<Recipe> cooked?" with
 * primary "Yes, Cooked" and secondary "Adjust". The Cook button is the only primary in the tile.
 */
export function TonightHero({ slot, now, onCook, onYesCooked, onAdjust, busy = false }: TonightHeroProps): ReactNode {
  const meal = slot.meal
  if (!meal) return null
  const key: SlotKey = { date: slot.date, mealSlotId: slot.mealSlotId }
  const phase = heroPhase(slot, now)
  const startBy = phase === 'upcoming' ? heroStartBy(meal) : null
  const chips = heroChips(meal, { slotDate: slot.date })

  return (
    <Tile variant="hero" span="full" overline={heroOverline(slot)} overlineIcon={slotIcon(slot.name)} className="plan-hero">
      <div className="plan-hero__body">
        {meal.photoUrl ? <RecipeThumb name={meal.recipeName} photoUrl={meal.photoUrl} size={72} label={meal.recipeName} /> : null}
        <div className="plan-hero__text">
          {startBy ? <p className="plan-hero__start">{startBy}</p> : null}
          <h2 className="plan-hero__name">{phase === 'awaiting' ? s.askCooked(meal.recipeName) : meal.recipeName}</h2>
          {phase === 'upcoming' && chips.length > 0 ? (
            <div className="plan-hero__chips">
              {chips.map((c) => (
                <Chip key={c.key} kind={c.kind}>
                  {c.label}
                </Chip>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {phase === 'upcoming' ? (
        <Button variant="primary" icon="cook" onClick={() => onCook(key)}>
          {heroCookLabel(meal)}
        </Button>
      ) : (
        <div className="plan-hero__actions">
          <Button variant="primary" icon="markCooked" disabled={busy} onClick={() => onYesCooked(key)}>
            {s.yesCooked}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => onAdjust(key)}>
            {s.adjust}
          </Button>
        </div>
      )}
    </Tile>
  )
}
