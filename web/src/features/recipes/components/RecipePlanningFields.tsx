import type { ReactNode } from 'react'
import { CoursePicker, NumberField, Switch } from '../../../ui'
import type { CourseChoice } from '../../../lib/courses'
import { fieldsFor } from '../lib/baseRecipe'
import { numberText, numberValue, type DraftErrors, type RecipeDraft } from '../lib/draft'
import { showsWholeMeal } from '../lib/recipeCourses'
import type { HouseholdPlanningDefaults } from '../hooks/useHouseholdPlanningDefaults'
import { codeMessage, courseStrings, recipeStrings } from '../strings'
import type { TagCount } from '../types'
import { TagChooser } from './TagChooser'

export interface RecipePlanningFieldsProps {
  draft: RecipeDraft
  errors: DraftErrors
  onChange: (patch: Partial<RecipeDraft>) => void
  /** The household's active Courses, household order: the Courses picker and the Whole meal switch. */
  courses?: readonly CourseChoice[]
  /** The Household's existing Tags, offered in the Tag chooser. */
  knownTags?: TagCount[]
  /** Tag name => colour id; undefined while the Tags load. */
  colourOf?: (name: string) => string | undefined
  /** The Household's own Cool-down, Leftover Use-by and Frozen Use-by, named in the footnote. */
  defaults: HouseholdPlanningDefaults
}

const fieldError = (errors: DraftErrors, key: string) => (errors[key] ? codeMessage(errors[key]) : undefined)

/**
 * RX-02 "Planning": Courses, Whole meal (a Switch, shown when today's rule shows it), Tags (RX-09), then Cool-down, Leftover Use-by,
 * Reheat time and Frozen Use-by under one footnote with the Household's values (RX-10: no helper of their own). A Base recipe is never
 * planned: only its Tags. Field primitives only.
 */
export function RecipePlanningFields({ draft, errors, onChange, courses = [], knownTags, colourOf, defaults }: RecipePlanningFieldsProps): ReactNode {
  const f = recipeStrings.fields
  const days = recipeStrings.units.days
  const shown = fieldsFor(draft.baseRecipe === true)
  const main = courses.find((c) => c.main)
  const number = (key: 'cooldownDays' | 'leftoverUseByDays' | 'reheatMinutes' | 'frozenUseByDays', label: string, unit: string) => (
    <NumberField
      size="xs"
      label={label}
      unit={unit}
      hideStepper
      value={numberValue(draft[key])}
      error={fieldError(errors, key)}
      onChange={(n) => onChange({ [key]: numberText(n) })}
    />
  )
  return (
    <div className="recipe-planning">
      {shown.courses ? (
        <CoursePicker
          label={courseStrings.label}
          courses={courses}
          value={draft.courseIds}
          ordered={false}
          required={courses.length > 0}
          error={fieldError(errors, 'courses')}
          onChange={(courseIds) => onChange({ courseIds })}
        />
      ) : null}
      {shown.wholeMeal && showsWholeMeal(draft.courseIds, courses) && main ? (
        <Switch label={courseStrings.wholeMeal} description={courseStrings.wholeMealHelper(main.name)} checked={draft.wholeMeal} onChange={(wholeMeal) => onChange({ wholeMeal })} />
      ) : null}
      <TagChooser tags={draft.tags} known={knownTags} colourOf={colourOf} onChange={(tags) => onChange({ tags })} />
      {shown.cooldown ? (
        <div className="recipe-planning__overrides">
          <div className="recipe-planning__grid">
            {number('cooldownDays', f.cooldown, days)}
            {number('leftoverUseByDays', f.leftoverUseBy, days)}
            {number('reheatMinutes', f.reheat, recipeStrings.units.min)}
            {number('frozenUseByDays', f.frozenUse, days)}
          </div>
          <p className="recipe-planning__footnote">{f.householdDefaults(defaults.cooldownDays, defaults.leftoverUseByDays, defaults.frozenUseByDays)}</p>
        </div>
      ) : null}
    </div>
  )
}
