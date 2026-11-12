import type { ReactNode } from 'react'
import type { Tag } from '../../../lib/tags'
import { Button, Checkbox, Chip, CourseSelect, ListGroup, ListRow, MealSlotSelect, NumberField, RecipeSelect, Segmented, TagSelect } from '../../../ui'
import { useSlotRuleForm, useVarietyRuleForm } from '../hooks/useRuleForms'
import { describeSlotRule, describeVarietyRule, mealSlotLabel, ruleCourseName, slotRuleTitle } from '../lib/rules'
import { findTag, tagPill } from '../lib/tagPill'
import { rulesStrings } from '../lib/rulesStrings'
import { planStrings as s } from '../strings'
import type { MealSlotChoice, RecipeChoice, SlotRule, VarietyRule } from '../types'
import '../plan.css'

/**
 * Enter in a field commits its value (NumberField) and must not submit the form with the values from before the commit.
 * The Save button still submits; Enter on a button is left alone.
 */
export function keepEnterInFields(e: { key: string; target: EventTarget; preventDefault: () => void }): void {
  if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault()
}

/** A Tag as a pill: its name in its colour, or the key in a neutral pill when no Tag has it (deleted, or not loaded). */
function TagChip({ tags, tag }: { tags: Tag[]; tag: string }): ReactNode {
  const pill = tagPill(tags, tag)
  return (
    <Chip kind="tag" tagColour={pill.colour}>
      {pill.label}
    </Chip>
  )
}

/** The Tag select: shows and picks Tags by id, but the form keeps the Tag key (what the rules store). */
function TagPicker({ tags, tag, onChange, label, helper }: { tags: Tag[]; tag: string; onChange: (key: string) => void; label: string; helper?: string }): ReactNode {
  return (
    <TagSelect
      label={label}
      tags={tags}
      value={findTag(tags, tag)?.id ?? null}
      onChange={(id) => onChange(tags.find((t) => t.id === id)?.key ?? '')}
      helper={helper}
    />
  )
}

export interface SlotRulesEditorProps {
  rules: SlotRule[]
  mealSlots: MealSlotChoice[]
  recipes: RecipeChoice[]
  /** The existing Tags: the Tag of a Slot Rule is picked, never typed; rows show their name and colour. */
  tags: Tag[]
  onAdd: (body: { mealSlotId: number; courseId?: number; recipeId?: number; tag?: string }) => void
  onRemove: (id: number) => void
  error: string | null
}

/** Lists the Slot Rules ("Friday Dinner: Tag: pizza") with Remove, and a form to add one (Meal Slot, then a Recipe or a Tag). */
export function SlotRulesEditor({ rules, mealSlots, recipes, tags, onAdd, onRemove, error }: SlotRulesEditorProps): ReactNode {
  const form = useSlotRuleForm(mealSlots, onAdd)
  const message = form.error ?? error
  const slotOf = (id: number) => mealSlots.find((m) => m.id === id)
  const labelOf = (id: number) => {
    const slot = slotOf(id)
    return slot ? mealSlotLabel(slot.weekday, slot.name) : s.unknownMealSlot
  }
  return (
    <div className="plan__stack">
      <p className="plan__muted">{s.slotRulesHelp}</p>
      {rules.length === 0 ? <p className="plan__muted">{s.slotRuleEmpty}</p> : null}
      {rules.length > 0 ? (
        <ListGroup label={s.slotRulesTitle}>
          {rules.map((r) => (
            <ListRow
              key={r.id}
              title={slotRuleTitle(labelOf(r.mealSlotId), ruleCourseName(slotOf(r.mealSlotId), r.courseId))}
              meta={r.recipeId !== undefined ? describeSlotRule(r) : undefined}
              trailing={
                <Button variant="tertiary" size="sm" onClick={() => onRemove(r.id)}>
                  {s.removeRule}
                </Button>
              }
            >
              {r.recipeId === undefined ? <TagChip tags={tags} tag={r.tag ?? ''} /> : null}
            </ListRow>
          ))}
        </ListGroup>
      ) : null}
      <form
        className="plan-form"
        onKeyDown={keepEnterInFields}
        onSubmit={(e) => {
          e.preventDefault()
          form.submit()
        }}
      >
        <MealSlotSelect
          label={s.mealSlotField}
          slots={mealSlots}
          value={form.mealSlotId ? Number(form.mealSlotId) : null}
          onChange={(id) => form.setMealSlotId(String(id))}
        />
        {form.showCourse ? (
          <CourseSelect
            label={rulesStrings.courseField}
            courses={form.courses}
            value={form.courseId ? Number(form.courseId) : null}
            onChange={(id) => form.setCourseId(String(id))}
          />
        ) : null}
        <Segmented
          label={s.ruleKindField}
          options={[
            { value: 'recipe', label: s.ruleKindRecipe },
            { value: 'tag', label: s.ruleKindTag },
          ]}
          value={form.kind}
          onChange={form.setKind}
        />
        {form.kind === 'tag' ? (
          <TagPicker tags={tags} tag={form.tag} onChange={form.setTag} label={s.tagField} helper={tags.length === 0 ? s.noTags : undefined} />
        ) : (
          <RecipeSelect
            label={s.recipeField}
            recipes={recipes}
            value={form.recipeId ? Number(form.recipeId) : null}
            onChange={(id) => form.setRecipeId(String(id))}
          />
        )}
        {message ? (
          <p role="alert" className="plan__error">
            {message}
          </p>
        ) : null}
        <Button type="submit">{s.addSlotRule}</Button>
      </form>
    </div>
  )
}

export interface VarietyRulesEditorProps {
  rules: VarietyRule[]
  /** The existing Tags: the Variety Rule Tag is picked with a Select, never typed. */
  tags: Tag[]
  onSave: (rule: VarietyRule) => void
  onRemove: (tag: string) => void
  error: string | null
}

/** Lists the Variety Rules with Remove, and a form (Tag, weekly limit, not on consecutive days). */
export function VarietyRulesEditor({ rules, tags, onSave, onRemove, error }: VarietyRulesEditorProps): ReactNode {
  const form = useVarietyRuleForm(onSave)
  const message = form.error ?? error
  return (
    <div className="plan__stack">
      <p className="plan__muted">{s.varietyRulesHelp}</p>
      {rules.length === 0 ? <p className="plan__muted">{s.varietyRuleEmpty}</p> : null}
      {rules.length > 0 ? (
        <ListGroup label={s.varietyRulesTitle}>
          {rules.map((r) => (
            <ListRow
              key={r.tag}
              title=""
              meta={describeVarietyRule(r)}
              trailing={
                <Button variant="tertiary" size="sm" onClick={() => onRemove(r.tag)}>
                  {s.removeRule}
                </Button>
              }
            >
              <TagChip tags={tags} tag={r.tag} />
            </ListRow>
          ))}
        </ListGroup>
      ) : null}
      <form
        className="plan-form"
        onKeyDown={keepEnterInFields}
        onSubmit={(e) => {
          e.preventDefault()
          form.submit()
        }}
      >
        <TagPicker tags={tags} tag={form.tag} onChange={form.setTag} label={s.tagField} helper={tags.length === 0 ? s.noTags : undefined} />
        <NumberField label={s.maxPerWeekField} value={form.maxPerWeek} onChange={form.setMaxPerWeek} min={1} max={21} />
        <Checkbox label={s.notConsecutive} checked={form.notConsecutiveDays} onChange={form.setNotConsecutiveDays} />
        {message ? (
          <p role="alert" className="plan__error">
            {message}
          </p>
        ) : null}
        <Button type="submit">{s.addVarietyRule}</Button>
      </form>
    </div>
  )
}
