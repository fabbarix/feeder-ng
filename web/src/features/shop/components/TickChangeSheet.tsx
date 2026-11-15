// B9-34: the Change sheet of whatever tick a TickFlow is changing, shared by the Shop screen and Scan's To get (one mount each). Wiring
// only: the choices are lib/tickAmount tickChoices, Save and "Tick without adding" go to flow.change, Close to flow.closeChange.
import { useState } from 'react'
import { useMe } from '../../../app/useMe'
import type { UnitSystem } from '../../../lib/units'
import type { TickFlow } from '../hooks/useTickFlow'
import { tickChoices, type ChangeTarget } from '../lib/tickAmount'
import { TickSheet } from './TickSheet'

export interface TickChangeSheetProps {
  flow: Pick<TickFlow, 'changing' | 'change' | 'closeChange'>
  system: UnitSystem
  /** the Household's IANA zone; omitted, it is read from /api/me (app/useMe), and only while a tick is being changed */
  timeZone?: string
  /** Save or "Tick without adding" failed (the flow rejected): the screen shows its failure toast */
  onFailed?: (error: unknown) => void
}

export function TickChangeSheet({ flow, system, timeZone, onFailed }: TickChangeSheetProps) {
  const target = flow.changing
  if (!target) return null
  const key = `${target.entry.key}|${target.clientUuid ?? ''}|${target.added}`
  if (timeZone !== undefined) return <ChangeSheet key={key} target={target} flow={flow} system={system} timeZone={timeZone} onFailed={onFailed} />
  return <ChangeSheetWithZone key={key} target={target} flow={flow} system={system} onFailed={onFailed} />
}

interface ChangeSheetProps extends Omit<TickChangeSheetProps, 'timeZone'> {
  target: ChangeTarget
  timeZone: string | null
}

/** Reads the Household zone from /api/me; mounted only while a tick is being changed. Unknown zone: no time is shown. */
function ChangeSheetWithZone(props: Omit<ChangeSheetProps, 'timeZone'>) {
  const zone = useMe().data?.householdTimeZone ?? null
  return <ChangeSheet {...props} timeZone={zone} />
}

function ChangeSheet({ target, flow, system, timeZone, onFailed }: ChangeSheetProps) {
  const [busy, setBusy] = useState(false)
  const { entry } = target
  const submit = async (quantity: number) => {
    setBusy(true)
    try {
      await flow.change(quantity)
    } catch (error) {
      onFailed?.(error)
    } finally {
      setBusy(false)
    }
  }
  return (
    <TickSheet
      open
      onClose={flow.closeChange}
      name={entry.title}
      baseUnit={entry.baseUnit ?? 'piece'}
      system={system}
      added={target.added}
      tickedAt={target.tickedAt}
      timeZone={timeZone}
      choices={tickChoices(entry, system)}
      onSubmit={(q) => void submit(q)}
      busy={busy}
      waiting={target.waiting === true}
    />
  )
}
