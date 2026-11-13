import type { ReactNode } from 'react'
import { Checkbox, CoursePicker, FieldRow, NumberField, Switch, TextArea, TextField } from '../../../ui'
import { frozenUseByHelper } from '../../../lib/leftovers/frozenUseBy'
import { codeMessage, courseStrings, recipeStrings } from '../strings'
import { numberText, numberValue, type DraftErrors, type RecipeDraft } from '../lib/draft'
import { showsWholeMeal } from '../lib/recipeCourses'
import type { CourseChoice } from '../../../lib/courses'
import type { TagCount } from '../types'
import { TagInput } from './TagInput'
import { Select } from '../../../ui'
import { fieldsFor } from '../lib/baseRecipe'
import { YIELD_UNITS } from '../../../lib/baseRecipes/yield'

export interface RecipeDetailsFieldsProps {
  draft: RecipeDraft
  errors: DraftErrors
  onChange: (patch: Partial<RecipeDraft>) => void
  /** The Household's existing Tags, suggested in the Tag field. */
  knownTags?: TagCount[]
  /** TG-RW: Tag name => colour id, handed to the Tag field. */
  colourOf?: (name: string) => string | undefined
  /** CRS E2: the household's active Courses, household order: the Courses picker and the Whole meal switch. */
  courses?: readonly CourseChoice[]
  /** B5-LOW: the Household's Frozen Use-by, named in the helper ("Blank uses the Household's 90 days."); 90 until it is known. */
  householdFrozenUseBy?: number
  /**
   * BR-D: the Base recipe switch. Without it the switch is not drawn. The screen's answer runs useBaseRecipeChange (a saved Recipe asks first), then patches the
   * draft with lib/baseRecipe.setBaseRecipe. Disabled while `baseRecipeBusy`.
   */
  onBaseRecipeChange?: (on: boolean) => void
  baseRecipeBusy?: boolean
}

const fieldError = (errors: DraftErrors, key: string) => (errors[key] ? codeMessage(errors[key]) : undefined)

/** The name, description, Yield, Ready Meal, Tags, Cool-down and Use-by overrides, the Reheat time, and the source of a Recipe: field primitives only. */
export function RecipeDetailsFields({
  draft,
  errors,
  onChange,
  knownTags,
  colourOf,
  courses = [],
  householdFrozenUseBy = 90,
  onBaseRecipeChange,
  baseRecipeBusy,
}: RecipeDetailsFieldsProps): ReactNode {
  const f = recipeStrings.fields
  const main = courses.find((c) => c.main)
  const shown = fieldsFor(draft.baseRecipe === true)
  const bt = recipeStrings.baseRecipe
  return (
    <div className="recipe-details">
      {onBaseRecipeChange ? (
        <Switch
          label={bt.switchLabel}
          description={bt.switchHelper}
          checked={draft.baseRecipe === true}
          disabled={baseRecipeBusy}
          onChange={(on) => onBaseRecipeChange(on)}
        />
      ) : null}
      <TextField size="lg" label={f.name} value={draft.name} error={fieldError(errors, 'name')} onChange={(name) => onChange({ name })} />
      <TextArea
        size="full"
        label={f.description}
        rows={3}
        value={draft.description}
        onChange={(description) => onChange({ description })}
      />
      <FieldRow>
        <NumberField
          size="xs"
          label={f.yield}
          min={1}
          value={numberValue(draft.yield)}
          error={fieldError(errors, 'yield')}
          onChange={(n) => onChange({ yield: numberText(n) })}
        />
        {shown.yieldUnit ? (
          <Select
            size="xs"
            label={bt.yieldUnit}
            options={YIELD_UNITS.map((u) => ({ value: u, label: u }))}
            value={draft.yieldUnit ? draft.yieldUnit : null}
            error={fieldError(errors, 'yieldUnit')}
            onChange={(yieldUnit) => onChange({ yieldUnit })}
          />
        ) : null}
        {shown.cooldown ? (
          <NumberField
            size="xs"
            label={f.cooldown}
            unit={recipeStrings.units.days}
            helper={f.cooldownHint}
            hideStepper
            value={numberValue(draft.cooldownDays)}
            error={fieldError(errors, 'cooldownDays')}
            onChange={(n) => onChange({ cooldownDays: numberText(n) })}
          />
        ) : null}
        {shown.leftoverUseBy ? (
          <NumberField
            size="xs"
            label={f.useBy}
            unit={recipeStrings.units.days}
            helper={f.useByHint}
            hideStepper
            value={numberValue(draft.leftoverUseByDays)}
            error={fieldError(errors, 'leftoverUseByDays')}
            onChange={(n) => onChange({ leftoverUseByDays: numberText(n) })}
          />
        ) : null}
        {shown.reheat ? (
          <NumberField
            size="xs"
            label={f.reheat}
            unit={recipeStrings.units.min}
            helper={f.reheatHint}
            hideStepper
            value={numberValue(draft.reheatMinutes)}
            error={fieldError(errors, 'reheatMinutes')}
            onChange={(n) => onChange({ reheatMinutes: numberText(n) })}
          />
        ) : null}
      </FieldRow>
      {shown.frozenUseBy ? (
        <NumberField
          size="xs"
          label={f.frozenUse}
          unit={recipeStrings.units.days}
          helper={frozenUseByHelper(householdFrozenUseBy)}
          hideStepper
          value={numberValue(draft.frozenUseByDays)}
          error={fieldError(errors, 'frozenUseByDays')}
          onChange={(n) => onChange({ frozenUseByDays: numberText(n) })}
        />
      ) : null}
      {shown.readyMeal ? (
        <Checkbox
          label={f.readyMeal}
          description={f.readyMealHint}
          checked={draft.readyMeal}
          onChange={(readyMeal) => onChange({ readyMeal })}
        />
      ) : null}
      {shown.courses ? (
        <CoursePicker
          label={courseStrings.label}
          courses={courses}
          value={draft.courseIds}
          ordered={false}
          required={courses.length > 0}
          error={errors.courses ? codeMessage(errors.courses) : undefined}
          onChange={(courseIds) => onChange({ courseIds })}
        />
      ) : null}
      {shown.wholeMeal && showsWholeMeal(draft.courseIds, courses) && main ? (
        <Switch
          label={courseStrings.wholeMeal}
          description={courseStrings.wholeMealHelper(main.name)}
          checked={draft.wholeMeal}
          onChange={(wholeMeal) => onChange({ wholeMeal })}
        />
      ) : null}
      <TagInput tags={draft.tags} known={knownTags} colourOf={colourOf} onChange={(tags) => onChange({ tags })} />
      <FieldRow>
        <TextField
          size="lg"
          type="url"
          label={f.sourceUrl}
          value={draft.sourceUrl}
          error={fieldError(errors, 'sourceUrl')}
          onChange={(sourceUrl) => onChange({ sourceUrl })}
        />
        <TextField
          size="md"
          label={f.attribution}
          value={draft.sourceAttribution}
          onChange={(sourceAttribution) => onChange({ sourceAttribution })}
        />
      </FieldRow>
    </div>
  )
}
