// The "Read the receipt" row at the foot of the Scanned list (design 3.1, 7.3). It is the Scan screen's footer slot (SR4) and imports nothing of it.
import { Link, useNavigate } from 'react-router-dom'
import { ListRow } from '../../../ui'
import { publishReceiptSession } from '../lib/receiptSession'
import { waitingText } from '../lib/reviewCopy'
import { receiptStrings as t } from '../strings'

export interface ReadReceiptFooterProps {
  shopId: number
  /** The uuids of the applied scans of this Shop's Scanned list. */
  clientUuids: string[]
  online: boolean
  assistantAvailable: boolean
  isAdmin?: boolean
  /** Scans still waiting to sync. */
  pendingScans?: number
}

/** The row, or nothing: no scans, or the assistant off for a User. An Admin sees it muted with the way to turn it on. Offline wins over waiting. */
export function ReadReceiptFooter({ shopId, clientUuids, online, assistantAvailable, isAdmin = false, pendingScans = 0 }: ReadReceiptFooterProps) {
  const navigate = useNavigate()
  if (clientUuids.length === 0) return null
  if (!assistantAvailable) {
    if (!isAdmin) return null
    return (
      <ListRow title={t.readTitle} icon="receipt">
        <Link to="/settings/recipe-assistant" className="receipt-link">
          {t.turnOnAssistant}
        </Link>
      </ListRow>
    )
  }
  if (!online) return <ListRow title={t.readTitle} meta={t.needsConnection} icon="receipt" />
  if (pendingScans > 0) return <ListRow title={t.readTitle} meta={waitingText(pendingScans)} icon="receipt" />
  const start = () => {
    publishReceiptSession({ shopId, clientUuids })
    navigate('/scan/receipt')
  }
  return <ListRow title={t.readTitle} meta={t.readMeta} icon="receipt" chevron onActivate={start} />
}
