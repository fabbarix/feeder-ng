import { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'
import { DetailList, DetailRow } from './DetailList'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { Overline } from './Overline'
import { overlayStrings } from './overlayStrings'
import './ConfirmDialog.css'

/** An R-E DetailRow: the key (body-strong), the state at the row's end, a muted detail under them. */
export interface ConfirmRow {
  key: string
  state?: string
  detail?: string
}

/** "Goes", "Stays", "Goes with Sam": a small uppercase label over DetailList rows. A group with no rows is not drawn. */
export interface ConfirmGroup {
  label: string
  rows: ConfirmRow[]
}

export interface ConfirmOptions {
  title: string
  /** One paragraph, or several (BR-D: the convert and take-over confirms name what goes, one paragraph each). */
  body?: string | string[]
  confirmLabel: string
  /** Default 'Cancel'. */
  cancelLabel?: string
  /** `danger`: destructive icon, backdrop does not dismiss. */
  tone?: 'default' | 'danger'
  /** Optional middle choice, e.g. "Archive instead". Only `choose()` can return it. */
  alternateLabel?: string
  /** SAFE R1: what goes and what stays, as labelled DetailList rows after the body (R-E: rows, never bullet sentences). */
  groups?: ConfirmGroup[]
  /** A longer set behind a one-line summary, closed by default. */
  details?: { summary: string; rows: ConfirmRow[] }
  /** One muted meta line last ("You can undo it straight after."). */
  note?: string
  /**
   * Which button has focus on open. Default 'cancel' in every tone: the safe button. 'confirm' only for a routine question that
   * loses nothing ("Mark as Cooked?"); a danger confirm ignores it.
   */
  focus?: 'cancel' | 'confirm'
  /** The status icon over the title. Default: none, or `delete` in the danger tone ("Leave without saving?" passes `warning`). */
  icon?: IconName
}

export interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  onAlternate?: () => void
}

export type ConfirmChoice = 'confirm' | 'alternate' | 'cancel'

export interface ConfirmApi {
  /** Resolves true on confirm; false on Cancel, Escape or backdrop. Calls made while one is open are queued. */
  confirm: (options: ConfirmOptions) => Promise<boolean>
  /** Like confirm, but distinguishes the alternate choice. */
  choose: (options: ConfirmOptions) => Promise<ConfirmChoice>
}

/**
 * Controlled confirmation built on Dialog. The safe button (Cancel, outline) has focus on open unless `focus: 'confirm'` on a
 * non-danger confirm; danger confirms ignore the backdrop; Escape always cancels. No Close (R-B). The body's first paragraph
 * is the lead line; groups, the note and the details follow it.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = overlayStrings.cancel,
  tone = 'default',
  alternateLabel,
  groups,
  details,
  note,
  focus = 'cancel',
  icon,
  onConfirm,
  onCancel,
  onAlternate,
}: ConfirmDialogProps): ReactNode {
  const danger = tone === 'danger'
  const focusConfirm = focus === 'confirm' && !danger
  const paragraphs = Array.isArray(body) ? body : body ? [body] : []
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      tone={tone}
      icon={icon ?? (danger ? 'delete' : undefined)}
      dismissOnBackdrop={!danger}
      onCancel={onCancel}
      cancelLabel={cancelLabel}
      cancelProps={{ 'data-autofocus': !focusConfirm || undefined }}
      actions={
        <>
          {alternateLabel ? (
            <Button variant="secondary" onClick={onAlternate}>
              {alternateLabel}
            </Button>
          ) : null}
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} data-autofocus={focusConfirm || undefined}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {paragraphs.map((paragraph, i) => (
        <p key={i} className={i === 0 ? 'confirm-dialog__lead' : 'confirm-dialog__body'}>
          {paragraph}
        </p>
      ))}
      {groups?.filter((g) => g.rows.length > 0).map((g, i) => <ConfirmGroupView key={`${i}-${g.label}`} group={g} />)}
      {note ? <p className="confirm-dialog__note">{note}</p> : null}
      {details && details.rows.length > 0 ? (
        <details className="confirm-dialog__details">
          <summary className="confirm-dialog__summary">
            <Icon name="chevron" size={16} />
            {details.summary}
          </summary>
          <ConfirmRows rows={details.rows} />
        </details>
      ) : null}
    </Dialog>
  )
}

function ConfirmRows({ rows }: { rows: ConfirmRow[] }) {
  return (
    <DetailList className="confirm-dialog__rows">
      {rows.map((row, i) => (
        <DetailRow key={`${i}-${row.key}`} label={row.key} state={row.state} detail={row.detail} />
      ))}
    </DetailList>
  )
}

/** A labelled group: the label names its list for a screen reader ("Goes with Sam, list, 3 items"). */
function ConfirmGroupView({ group }: { group: ConfirmGroup }) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  // DetailList takes no aria props (B9-01's primitive), so the group names its own list once it is in the DOM.
  useLayoutEffect(() => {
    ref.current?.querySelector(':scope > .detail-list')?.setAttribute('aria-labelledby', id)
  }, [id])
  return (
    <div ref={ref} className="confirm-dialog__group">
      <Overline id={id}>
        {group.label}
      </Overline>
      <ConfirmRows rows={group.rows} />
    </div>
  )
}

interface Request {
  id: number
  options: ConfirmOptions
  settle: (choice: ConfirmChoice) => void
}

const ConfirmContext = createContext<ConfirmApi | null>(null)

/** Hosts the single ConfirmDialog behind useConfirm(). Requests queue; each one mounts its own dialog. */
export function ConfirmProvider({ children }: { children?: ReactNode }) {
  const [queue, setQueue] = useState<Request[]>([])
  const nextId = useRef(1)

  const request = useCallback(
    (options: ConfirmOptions) =>
      new Promise<ConfirmChoice>((resolve) => {
        const id = nextId.current++
        setQueue((items) => [...items, { id, options, settle: resolve }])
      }),
    [],
  )

  const api = useMemo<ConfirmApi>(
    () => ({
      choose: request,
      confirm: async (options) => (await request(options)) === 'confirm',
    }),
    [request],
  )

  const head = queue[0]
  const settle = (choice: ConfirmChoice) => {
    if (!head) return
    head.settle(choice)
    setQueue((items) => items.filter((item) => item.id !== head.id))
  }

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      {head ? (
        <ConfirmDialog
          key={head.id}
          open
          {...head.options}
          onConfirm={() => settle('confirm')}
          onCancel={() => settle('cancel')}
          onAlternate={() => settle('alternate')}
        />
      ) : null}
    </ConfirmContext.Provider>
  )
}

/** Replaces window.confirm. Throws outside a ConfirmProvider. */
export function useConfirm(): ConfirmApi {
  const api = useContext(ConfirmContext)
  if (!api) throw new Error('useConfirm must be used inside a ConfirmProvider')
  return api
}
