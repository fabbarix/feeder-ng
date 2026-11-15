import type { ReactNode } from 'react'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { useTags } from '../../../lib/tags'
import { PageHeader, Tile } from '../../../ui'
import { CookingTimesTile } from '../components/CookingTimesTile'
import { SlotRulesEditor, VarietyRulesEditor } from '../components/RulesEditors'
import { useCookingTimes } from '../hooks/useCookingTimes'
import { useSlotRules, useVarietyRules } from '../hooks/useRules'
import { planStrings } from '../strings'
import '../plan.css'

/**
 * Route /settings/planning: the Cooking times (B9-51, PC-14 and A2: Household settings, so only an Admin saves them), then the
 * Slot Rules and Variety Rules editors. Any signed-in User may edit the rules (spec §2 lists only the allowlist, Members, Meal
 * Slots, Shops, Weight Barcode Rules and household settings as Admin duties). Removing a rule is at once, with Undo (SAFE-02).
 * Settings links here (small change in features/settings, listed in the report).
 */
export function PlanningRulesScreen(): ReactNode {
  const breadcrumbs = useBreadcrumbs()
  const tags = useTags()
  const cookingTimes = useCookingTimes()
  const slotRules = useSlotRules(tags.tags)
  const varietyRules = useVarietyRules(tags.tags)
  if (slotRules.isLoading || varietyRules.isLoading) {
    return (
      <div className="plan">
        <p className="plan__muted">{planStrings.loading}</p>
      </div>
    )
  }
  return (
    <div className="plan">
      <PageHeader title={planStrings.rulesTitle} breadcrumbs={breadcrumbs} />
      <CookingTimesTile times={cookingTimes} />
      <Tile as="section" span="full">
        <h2 className="plan__tile-title">{planStrings.slotRulesTitle}</h2>
        <SlotRulesEditor
          rules={slotRules.rules}
          mealSlots={slotRules.mealSlots}
          recipes={slotRules.recipes}
          tags={tags.tags}
          onAdd={(b) => void slotRules.add(b)}
          onRemove={(id) => void slotRules.remove(id)}
          error={slotRules.error}
        />
      </Tile>
      <Tile as="section" span="full">
        <h2 className="plan__tile-title">{planStrings.varietyRulesTitle}</h2>
        <VarietyRulesEditor
          rules={varietyRules.rules}
          tags={tags.tags}
          onSave={(r) => void varietyRules.save(r)}
          onRemove={(t) => void varietyRules.remove(t)}
          error={varietyRules.error}
        />
      </Tile>
    </div>
  )
}
