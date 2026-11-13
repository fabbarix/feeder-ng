// The Leftover sheets of one screen, drawn from its flow: the action sheet and the details sheet. An answer that would replan
// is asked by the flow through the shared confirm.
import type { LeftoverFlow } from '../../lib/leftovers/useLeftoverFlow'
import { LeftoverDetailsSheet } from './LeftoverDetailsSheet'
import { LeftoverSheet } from './LeftoverSheet'

export interface LeftoverSheetsProps {
  flow: LeftoverFlow
}

/** Mount once per screen. The action sheet waits for its context (Storage Places, Frozen Use-by) so its defaults are right. */
export function LeftoverSheets({ flow }: LeftoverSheetsProps) {
  const { sheet, context } = flow
  return (
    <>
      {sheet && !context.loading ? (
        <LeftoverSheet
          action={sheet.action}
          leftover={sheet.leftover}
          today={flow.today}
          storagePlaces={context.storagePlaces}
          recipeFrozenUseBy={context.recipeFrozenUseBy}
          householdFrozenUseBy={context.householdFrozenUseBy}
          recipeUseByDays={context.recipeUseByDays}
          busy={flow.busy}
          onConfirm={(request) => void flow.confirm(request)}
          onClose={flow.closeSheet}
          storagePlacesHref="/settings/storage-places"
        />
      ) : null}
      <LeftoverDetailsSheet leftover={flow.details} today={flow.today} onClose={flow.closeDetails} onAction={flow.openSheet} />
    </>
  )
}
