import type { ReactNode } from 'react'
import type { CookFlow } from '../hooks/useCookFlow'
import { MarkCookedSheet } from './MarkCookedSheet'
import { ShortfallSheets } from './ShortfallSheets'

/** The Mark as Cooked sheet, the Stock shortfall notices and the Stock correction sheet of one CookFlow (shared by Plan and Today). */
export function CookFlowSheets({ flow }: { flow: CookFlow }): ReactNode {
  const { cook, cookKey, close } = flow
  return (
    <>
      <ShortfallSheets groups={flow.shortfalls} correct={flow.correct} onDismiss={flow.dismissShortfalls} system={flow.system} placement="list" />
      <MarkCookedSheet
        open={cookKey !== null}
        onClose={close}
        preview={cook.preview}
        isLoading={cook.isLoading}
        leftover={cook.leftover}
        onLeftoverChange={cook.setLeftover}
        onConfirm={() => void flow.confirm()}
        onNotCooked={() => void flow.skip()}
        busy={cook.busy}
        error={cook.error}
        courseId={cook.courseId}
        usedFrom={cook.usedFrom}
      />
    </>
  )
}
