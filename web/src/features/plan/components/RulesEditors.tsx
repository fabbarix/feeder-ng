import type { ReactNode } from 'react'
import { Button } from '../../../ui'
import { useSlotRuleForm, useVarietyRuleForm } from '../hooks/useRuleForms'
import { describeSlotRule, describeVarietyRule, mealSlotLabel } from '../lib/rules'
import { planStrings } from '../strings'
import type { MealSlotChoice, RecipeChoice, SlotRule, TagChoice, VarietyRule } from '../types'
import '../plan.css'

export interface SlotRulesEditorProps {
  rules: SlotRule[]
  mealSlots: MealSlotChoice[]
  recipes: RecipeChoice[]
  /** The existing Tags: the Tag of a Slot Rule is picked, never typed. */
  tags: TagChoice[]
  onAdd: (body: { mealSlotId: number; recipeId?: number; tag?: string }) => void
  onRemove: (id: number) => void
  error: string | null
}

/** Lists the Slot Rules ("Friday Dinner: Tag: pizza") with Remove, and a form to add one (Meal Slot, then a Recipe or a Tag). */
export function SlotRulesEditor({ rules, mealSlots, recipes, onAdd, onRemove, error }: SlotRulesEditorProps): ReactNode {
  const form = useSlotRuleForm(mealSlots, onAdd)
  const message = form.error ?? error
  const labelOf = (id: number) => {
    const s = mealSlots.find((m) => m.id === id)
    return s ? mealSlotLabel(s.weekday, s.name) : planStrings.unknownMealSlot
  }
  return (
    <div className="plan__stack">
      <p className="plan__muted">{planStrings.slotRulesHelp}</p>
      {rules.length === 0 ? <p className="plan__muted">{planStrings.slotRuleEmpty}</p> : null}
      <ul className="plan__list" aria-label={planStrings.slotRulesTitle}>
        {rules.map((r) => (
          <li key={r.id}>
            <span>
              <strong>{labelOf(r.mealSlotId)}</strong>
              <br />
              <span className="plan__muted">{describeSlotRule(r)}</span>
            </span>
            <Button variant="ghost" onClick={() => onRemove(r.id)}>
              {planStrings.removeRule}
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="plan-form"
        onSubmit={(e) => {
          e.preventDefault()
          form.submit()
        }}
      >
        <label className="plan-field">
          <span className="plan-field__label">{planStrings.mealSlotField}</span>
          <select value={form.mealSlotId} onChange={(e) => form.setMealSlotId(e.target.value)}>
            {mealSlots.map((m) => (
              <option key={m.id} value={m.id}>
                {mealSlotLabel(m.weekday, m.name)}
              </option>
            ))}
          </select>
        </label>
        <label className="plan-field">
          <span className="plan-field__label">{planStrings.ruleKindField}</span>
          <select value={form.kind} onChange={(e) => form.setKind(e.target.value === 'tag' ? 'tag' : 'recipe')}>
            <option value="recipe">{planStrings.ruleKindRecipe}</option>
            <option value="tag">{planStrings.ruleKindTag}</option>
          </select>
        </label>
        {form.kind === 'tag' ? (
          <label className="plan-field">
            <span className="plan-field__label">{planStrings.tagField}</span>
            <input type="text" value={form.tag} onChange={(e) => form.setTag(e.target.value)} />
          </label>
        ) : (
          <label className="plan-field">
            <span className="plan-field__label">{planStrings.recipeField}</span>
            <select value={form.recipeId} onChange={(e) => form.setRecipeId(e.target.value)}>
              <option value="" />
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {message ? (
          <p role="alert" className="plan__error">
            {message}
          </p>
        ) : null}
        <Button type="submit">{planStrings.addSlotRule}</Button>
      </form>
    </div>
  )
}

export interface VarietyRulesEditorProps {
  rules: VarietyRule[]
  /** The existing Tags: the Variety Rule Tag is picked with a Select, never typed. */
  tags: TagChoice[]
  onSave: (rule: VarietyRule) => void
  onRemove: (tag: string) => void
  error: string | null
}

/** Lists the Variety Rules with Remove, and a form (Tag, weekly limit, not on consecutive days). */
export function VarietyRulesEditor({ rules, onSave, onRemove, error }: VarietyRulesEditorProps): ReactNode {
  const form = useVarietyRuleForm(onSave)
  const message = form.error ?? error
  return (
    <div className="plan__stack">
      <p className="plan__muted">{planStrings.varietyRulesHelp}</p>
      {rules.length === 0 ? <p className="plan__muted">{planStrings.varietyRuleEmpty}</p> : null}
      <ul className="plan__list" aria-label={planStrings.varietyRulesTitle}>
        {rules.map((r) => (
          <li key={r.tag}>
            <span>
              <strong>{r.tag}</strong>
              <br />
              <span className="plan__muted">{describeVarietyRule(r)}</span>
            </span>
            <Button variant="ghost" onClick={() => onRemove(r.tag)}>
              {planStrings.removeRule}
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="plan-form"
        onSubmit={(e) => {
          e.preventDefault()
          form.submit()
        }}
      >
        <label className="plan-field">
          <span className="plan-field__label">{planStrings.tagField}</span>
          <input type="text" value={form.tag} onChange={(e) => form.setTag(e.target.value)} />
        </label>
        <label className="plan-field">
          <span className="plan-field__label">{planStrings.maxPerWeekField}</span>
          <input type="text" inputMode="numeric" value={form.maxPerWeek} onChange={(e) => form.setMaxPerWeek(e.target.value)} />
        </label>
        <label className="plan-check">
          <input type="checkbox" checked={form.notConsecutiveDays} onChange={(e) => form.setNotConsecutiveDays(e.target.checked)} />
          <span>{planStrings.notConsecutive}</span>
        </label>
        {message ? (
          <p role="alert" className="plan__error">
            {message}
          </p>
        ) : null}
        <Button type="submit">{planStrings.addVarietyRule}</Button>
      </form>
    </div>
  )
}
