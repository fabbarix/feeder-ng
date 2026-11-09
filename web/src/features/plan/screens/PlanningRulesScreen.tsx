import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Tile } from '../../../ui'
import { SlotRulesEditor, VarietyRulesEditor } from '../components/RulesEditors'
import { useSlotRules, useVarietyRules } from '../hooks/useRules'
import { planStrings } from '../strings'
import '../plan.css'

/**
 * Route /settings/planning: the Slot Rules and Variety Rules editors. Any signed-in User may edit them (spec §2 lists
 * only the allowlist, Members, Meal Slots, Shops, Weight Barcode Rules and household settings as Admin duties).
 * Settings links here (small change in features/settings, listed in the report).
 */
export function PlanningRulesScreen(): ReactNode {
  const slotRules = useSlotRules()
  const varietyRules = useVarietyRules()
  if (slotRules.isLoading || varietyRules.isLoading) {
    return (
      <div className="plan">
        <p className="plan__muted">{planStrings.loading}</p>
      </div>
    )
  }
  return (
    <div className="plan">
      <h1 className="plan__title">{planStrings.rulesTitle}</h1>
      <Tile as="section" size="full">
        <h2 className="plan__tile-title">{planStrings.slotRulesTitle}</h2>
        <SlotRulesEditor
          rules={slotRules.rules}
          mealSlots={slotRules.mealSlots}
          recipes={slotRules.recipes}
          onAdd={(b) => void slotRules.add(b)}
          onRemove={(id) => void slotRules.remove(id)}
          error={slotRules.error}
        />
      </Tile>
      <Tile as="section" size="full">
        <h2 className="plan__tile-title">{planStrings.varietyRulesTitle}</h2>
        <VarietyRulesEditor
          rules={varietyRules.rules}
          onSave={(r) => void varietyRules.save(r)}
          onRemove={(t) => void varietyRules.remove(t)}
          error={varietyRules.error}
        />
      </Tile>
      <Link to="/plan">{planStrings.title}</Link>
    </div>
  )
}
