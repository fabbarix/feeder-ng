// The shell's timers (PC-04): the timer pill, the finish banner and the Timers sheet. AppShell mounts one ShellTimers, keyed, in both
// frames: in the framed pages with the pill, on the receipt screens (chromeless, where a cook can be when a timer ends) without it
// (their sticky Save bar is there). Being the same mounted component in both, moving between them keeps one poll and one alarm, and
// a ringing timer keeps ringing. Cook Mode and the board show timers themselves: it is not mounted there.
import { useRef, type CSSProperties } from 'react'
import { bannerText, type ShellTimer } from '../features/cook/lib/householdTimers'
import { TimerPill } from '../ui/TimerPill'
import { useEscapeKey } from './hooks/useEscapeKey'
import { useHouseholdTimers, type HouseholdTimers } from './hooks/useHouseholdTimers'
import { useShellTimerOpen, type ShellTimerOpen } from './hooks/useShellTimerOpen'
import { useTimerPillDock } from './hooks/useTimerPillDock'
import { useTimerPillTop } from './hooks/useTimerPillTop'
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
  const ref = useRef<HTMLDivElement>(null)
  const dock = useTimerPillDock(ref, true)
  // B9-55: where the bottom stack would pass the chrome budget, the pill sits in the top bar instead (not while it docks in the bar).
  const top = useTimerPillTop(ref, dock === null)
  const style = dock
    ? ({ '--timer-pill-dock-x': `${dock.x}px`, '--timer-pill-dock-y': `${dock.y}px` } as CSSProperties)
    : top
      ? ({ '--timer-pill-top-x': `${top.x}px`, '--timer-pill-top-width': `${top.maxWidth}px` } as CSSProperties)
      : undefined
  return (
    <div ref={ref} className="shell-timer" data-state={head.state} data-docked={dock ? '' : undefined} data-top={!dock && top ? '' : undefined} style={style}>
      <TimerPill label={head.title} seconds={head.seconds} running={head.state !== 'paused'} nameSeconds={nameSeconds} more={more} onOpen={onOpen} />
    </div>
  )
}

/** The pill whenever a timer exists (unless `pill` is false: the receipt screens), the banner when one has finished, and the Timers sheet. */
export function ShellTimers({ pill = true }: { pill?: boolean }) {
  const timers = useHouseholdTimers()
  const open = useShellTimerOpen()
  return (
    <>
      {pill && timers.head ? <Pill head={timers.head} more={timers.more} nameSeconds={timers.nameSeconds} onOpen={() => open.openFor(timers.all)} /> : null}
      <Alert timers={timers} open={open} />
    </>
  )
}
