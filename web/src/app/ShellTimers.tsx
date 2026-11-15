// The shell's timers (PC-04). ShellTimers (the framed pages): the timer pill, the finish banner and the Timers sheet. ShellTimerAlert
// (the receipt screens, chromeless, where a cook can be when a timer ends): the banner and the sheet, no pill. AppShell mounts one
// of them at a time, so there is one poll and one alarm; Cook Mode and the board show timers themselves and mount neither.
import { bannerText, type ShellTimer } from '../features/cook/lib/householdTimers'
import { TimerPill } from '../ui/TimerPill'
import { useEscapeKey } from './hooks/useEscapeKey'
import { useHouseholdTimers, type HouseholdTimers } from './hooks/useHouseholdTimers'
import { useShellTimerOpen, type ShellTimerOpen } from './hooks/useShellTimerOpen'
import { ShellTimerBanner } from './ShellTimerBanner'
import { TimersSheet } from './TimersSheet'
import './ShellTimers.css'

function Alert({ timers, open }: { timers: HouseholdTimers; open: ShellTimerOpen }) {
  const { finished, all, dismissFinished } = timers
  useEscapeKey(finished.length > 0, () => void dismissFinished())
  const text = bannerText(finished)
  return (
    <>
      {finished.length > 0 ? (
        <ShellTimerBanner headline={text.headline} subline={text.subline} onOpen={() => open.openFor(finished)} onDismiss={() => void dismissFinished()} />
      ) : null}
      <TimersSheet open={open.sheetOpen && all.length > 0} timers={all} onClose={open.closeSheet} onOpenTimer={open.openTimer} />
    </>
  )
}

function Pill({ head, more, nameSeconds, onOpen }: { head: ShellTimer; more: number; nameSeconds: number; onOpen: () => void }) {
  return (
    <div className="shell-timer" data-state={head.state}>
      <TimerPill label={head.title} seconds={head.seconds} running={head.state !== 'paused'} nameSeconds={nameSeconds} more={more} onOpen={onOpen} />
    </div>
  )
}

/** The framed pages' timers: the pill whenever a timer exists, the banner when one has finished, and the Timers sheet. */
export function ShellTimers() {
  const timers = useHouseholdTimers()
  const open = useShellTimerOpen()
  return (
    <>
      {timers.head ? <Pill head={timers.head} more={timers.more} nameSeconds={timers.nameSeconds} onOpen={() => open.openFor(timers.all)} /> : null}
      <Alert timers={timers} open={open} />
    </>
  )
}

/** The receipt screens' timers: only the finish banner (and the Timers sheet it may open). */
export function ShellTimerAlert() {
  const timers = useHouseholdTimers()
  const open = useShellTimerOpen()
  return <Alert timers={timers} open={open} />
}
