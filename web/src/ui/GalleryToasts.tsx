// B9-18 section of the dev Gallery (route /_gallery): "Toasts, Undo and confirms". Each toast state sits on its own stage: a framed
// box with its own ToastProvider whose fixed toast region is contained by the stage (GalleryToasts.css), so every state shows at
// once, without a harness and without waiting for a timer. The dialogs open from buttons (a modal open on load would block the page).
import { useEffect, type ReactNode } from 'react'
import { ApiError } from '../lib/http'
import { Button, PRIMARY_SCOPE_ATTR } from './Button'
import { ConfirmProvider, useConfirm } from './ConfirmDialog'
import { DraftNotice } from './DraftNotice'
import { ToastProvider, useToast, type ToastContent } from './Toast'
import { leaveDialog } from './useLeaveGuard'
import { undoRefusal, useUndoToast } from './useUndoToast'
import './GalleryToasts.css'

/** Long enough to read as "stays" in the catalogue (setTimeout's ceiling is about 24.8 days). */
const FOREVER_MS = 2 ** 31 - 1
const noop = () => {}

function Cell({ caption, wide, children }: { caption: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? 'gallery__cell gallery__cell--wide' : 'gallery__cell'} {...{ [PRIMARY_SCOPE_ATTR]: '' }}>
      {children}
      <p className="gallery__caption">{caption}</p>
    </div>
  )
}

/** Shows `toasts` through the stage's own provider once mounted; `undo` ones go through useUndoToast. */
function Shows({ toasts, undo }: { toasts?: ToastContent[]; undo?: Parameters<ReturnType<typeof useUndoToast>['show']>[0][] }) {
  const toast = useToast()
  const undoToast = useUndoToast()
  useEffect(() => {
    const handles = [...(toasts ?? []).map((t) => toast.show({ durationMs: FOREVER_MS, ...t })), ...(undo ?? []).map((u) => undoToast.show({ durationMs: FOREVER_MS, ...u }))]
    return () => handles.forEach((h) => h.dismiss())
  }, [toast, undoToast, toasts, undo])
  return null
}

/** A framed box that contains its toast region (the region is position: fixed; the stage's transform makes it the containing block). */
function Stage({ size = 'one', children }: { size?: 'one' | 'two' | 'three'; children: ReactNode }) {
  return (
    <div className="gallery__toast-stage" data-size={size}>
      <ToastProvider>{children}</ToastProvider>
    </div>
  )
}

const REFUSED = undoRefusal(new ApiError(409, 'plan_changed', 'plan changed'))

// Stable arrays: Shows re-runs its effect when they change.
const LANES: ToastContent[] = [
  { title: 'Saved to the plan' },
  { title: 'Sam removed', actions: [{ label: 'Undo', ariaLabel: 'Undo: put Sam back', role: 'undo', onClick: noop }] },
  { status: 'error', title: 'Could not save', body: 'Check the connection and try again.' },
]
const ONE_LINE_UNDO = [{ headline: 'Sat Dinner marked Not cooked', undoAriaLabel: 'Undo Not cooked for Sat Dinner', undo: noop }]
const RICH_UNDO = [
  {
    headline: 'Cooked, nice one!',
    subline: 'Sat Breakfast · Slow cooker beef and barley stew',
    body: '1.25 portions kept as a Leftover, good until Tue.',
    undoAriaLabel: 'Undo Cooked for Sat Breakfast',
    undo: noop,
  },
]
const TWO_ACTIONS_UNDO = [
  { headline: 'Plan regenerated', actions: [{ label: 'Review', ariaLabel: 'Review 26 changed meals', onClick: noop }], undoAriaLabel: 'Undo Regenerate', undo: noop },
]
const REFUSED_TOAST: ToastContent[] = [{ status: 'error', title: REFUSED.headline, subline: REFUSED.subline, sticky: true }]
const UPDATE: ToastContent[] = [
  {
    status: 'info',
    title: 'A new version of Feeder is ready',
    actions: [
      { label: 'Reload', onClick: noop },
      { label: 'Later', role: 'dismiss', onClick: noop },
    ],
    sticky: true,
  },
]

function LeaveDemo() {
  const { confirm } = useConfirm()
  return (
    <Button variant="secondary" onClick={() => void confirm(leaveDialog('Pasta al pomodoro'))}>
      Leave without saving?
    </Button>
  )
}

function RemoveMemberDemo() {
  const { confirm } = useConfirm()
  return (
    <Button
      variant="secondary"
      onClick={() =>
        void confirm({
          title: 'Remove Sam?',
          body: 'Sam no longer counts towards portions.',
          groups: [
            {
              label: 'Goes with Sam',
              rows: [
                { key: 'Preferences', state: '3', detail: 'Favourites, Dislikes and Exclusions' },
                { key: 'Attendance', state: '21 Meal Slots', detail: 'Every Meal Slot Sam eats at' },
                { key: 'Sign-in', state: 'Ends', detail: 'sam@example.com · not on the Allowlist' },
              ],
            },
          ],
          note: 'Planned Meals from today are worked out again. You can undo it straight after.',
          tone: 'danger',
          icon: 'warning',
          confirmLabel: 'Remove Sam',
        })
      }
    >
      Confirm with groups and a note
    </Button>
  )
}

function RegenerateDemo() {
  const { confirm } = useConfirm()
  return (
    <Button
      variant="secondary"
      onClick={() =>
        void confirm({
          title: 'Regenerate the plan?',
          body: '26 unpinned Planned Meals will change.',
          note: 'Pinned and Cooked ones stay. You can undo it straight after.',
          details: { summary: '1 Bought Planned Meal is replaced', rows: [{ key: 'Wed Lunch', state: 'Replaced', detail: 'Carrot bought · Roast chicken with lemon, garlic and thyme' }] },
          confirmLabel: 'Regenerate',
        })
      }
    >
      Confirm with details
    </Button>
  )
}

/** "Toasts, Undo and confirms" (B9-18) for one colour scheme. */
export function ToastUndoGalleryGroup(): ReactNode {
  return (
    <section className="gallery__group">
      <h3>Toasts, Undo and confirms</h3>
      <div className="gallery__cells">
        <Cell caption="lanes: ordinary, Undo and error together (the error on top)">
          <Stage size="three">
            <Shows toasts={LANES} />
          </Stage>
        </Cell>
        <Cell caption="Undo, one line: no icon, outline pill, 32 px Dismiss">
          <Stage>
            <Shows undo={ONE_LINE_UNDO} />
          </Stage>
        </Cell>
        <Cell caption="Undo with detail: headline, subline, body">
          <Stage size="two">
            <Shows undo={RICH_UNDO} />
          </Stage>
        </Cell>
        <Cell caption="two actions, no subline: stacked, Dismiss level with the headline">
          <Stage size="two">
            <Shows undo={TWO_ACTIONS_UNDO} />
          </Stage>
        </Cell>
        <Cell caption="refused Undo: sticky error, the reason as the subline">
          <Stage size="two">
            <Shows toasts={REFUSED_TOAST} />
          </Stage>
        </Cell>
        <Cell caption="update prompt: sticky, Reload and Later, no round Dismiss">
          <Stage size="two">
            <Shows toasts={UPDATE} />
          </Stage>
        </Cell>
        <ConfirmProvider>
          <Cell caption="leave dialog, ConfirmDialog with groups, details and a note">
            <div className="gallery__stack">
              <LeaveDemo />
              <RemoveMemberDemo />
              <RegenerateDemo />
            </div>
          </Cell>
        </ConfirmProvider>
        <Cell caption="DraftNotice: restored, and a conflict with two choices" wide>
          <DraftNotice
            title="Your unsaved changes are back"
            meta="The page closed before you saved, on Sat 14 Nov at 15:02. Feeder kept them on this phone."
            actions={[{ label: 'Discard changes', onClick: noop }]}
          />
          <DraftNotice
            title="This Recipe changed since your unsaved changes"
            meta="Anna saved it on Sat 14 Nov at 16:10. Your changes from 15:02 are kept on this phone."
            actions={[
              { label: 'Use my changes', onClick: noop },
              { label: 'Discard them', onClick: noop },
            ]}
          />
        </Cell>
      </div>
    </section>
  )
}
