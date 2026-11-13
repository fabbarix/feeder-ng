import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { overlayStrings } from './overlayStrings'

export interface ConfirmOptions {
  title: string
  body?: string
  confirmLabel: string
  /** Default 'Cancel'. */
  cancelLabel?: string
  /** `danger`: destructive icon, initial focus on Cancel, backdrop does not dismiss. */
  tone?: 'default' | 'danger'
  /** Optional middle choice, e.g. "Archive instead". Only `choose()` can return it. */
  alternateLabel?: string
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

/** Controlled confirmation built on Dialog. Danger confirms focus Cancel and ignore the backdrop; Escape always cancels. */
export function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel = overlayStrings.cancel, tone = 'default', alternateLabel, onConfirm, onCancel, onAlternate }: ConfirmDialogProps): ReactNode {
  const danger = tone === 'danger'
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      tone={tone}
      icon={danger ? 'delete' : undefined}
      dismissOnBackdrop={!danger}
      actions={
        <>
          <Button variant="tertiary" onClick={onCancel} data-autofocus={danger || undefined}>
            {cancelLabel}
          </Button>
          {alternateLabel ? (
            <Button variant="secondary" onClick={onAlternate}>
              {alternateLabel}
            </Button>
          ) : null}
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} data-autofocus={!danger || undefined}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {body ? <p className="confirm-dialog__body">{body}</p> : null}
    </Dialog>
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
