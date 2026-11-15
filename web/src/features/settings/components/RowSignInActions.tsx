import { useRef, type MouseEvent } from 'react'
import { IconButton, Menu } from '../../../ui'
import { EmailSentence } from '../../access'
import { settingsStrings } from '../strings'

const text = settingsStrings.allowlistPanel

export interface RowSignInActionsProps {
  email: string
  /** The device has a share sheet: Share and More (Copy, Remove); otherwise Copy and Remove. */
  canShare: boolean
  onShare: (starter: HTMLElement) => void
  onCopy: (starter: HTMLElement | null) => void
  onRemove: () => void
}

/** SET-03: a row's icon set, always exactly two 44 px IconButtons, so the row has the same width with or without Share. */
export function RowSignInActions({ email, canShare, onShare, onCopy, onRemove }: RowSignInActionsProps) {
  const moreRef = useRef<HTMLSpanElement>(null)
  const more = text.more(email)
  const starter = (e: MouseEvent<HTMLButtonElement>) => e.currentTarget
  if (canShare) {
    const moreButton = () => moreRef.current?.querySelector<HTMLElement>('button[aria-haspopup="menu"]') ?? null
    return (
      <span className="allowlist__icons">
        <IconButton icon="share" label={text.share(email)} title={text.share(email)} onClick={(e) => onShare(starter(e))} />
        <span ref={moreRef} className="allowlist__more">
          <Menu
            label={more}
            title={<EmailSentence text={more} email={email} />}
            triggerTitle
            items={[
              { id: 'copy', label: text.copyItem, icon: 'copy', onSelect: () => onCopy(moreButton()) },
              { separator: true },
              { id: 'remove', label: text.remove(email), labelNode: <EmailSentence text={text.remove(email)} email={email} />, icon: 'delete', tone: 'danger', onSelect: onRemove },
            ]}
          />
        </span>
      </span>
    )
  }
  return (
    <span className="allowlist__icons">
      <IconButton icon="copy" label={text.copy(email)} title={text.copy(email)} onClick={(e) => onCopy(starter(e))} />
      <IconButton icon="delete" label={text.remove(email)} title={text.remove(email)} onClick={onRemove} />
    </span>
  )
}
