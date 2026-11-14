// The "Read the receipt" row at the foot of the Scanned list (design 3.1, 7.3). It is the Scan screen's footer slot (SR4) and imports nothing of it.
// The background read of this Shop, when there is one, is the row (b8-rxweb, design 3.3): it wins over the checks below.
import { Link, useNavigate } from 'react-router-dom'
import { ListRow } from '../../../ui'
import { useBackgroundRead } from '../hooks/useBackgroundRead'
import { dismissBackgroundRead } from '../lib/backgroundRead'
import { showsReadReceiptRow } from '../lib/readGate'
import { publishReceiptSession } from '../lib/receiptSession'
import { waitingText } from '../lib/reviewCopy'
import { receiptStrings as t } from '../strings'
import { BackgroundReadRow } from './BackgroundReadRow'

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
  const background = useBackgroundRead(shopId)
  if (clientUuids.length === 0) return null
  const open = (to: string) => {
    publishReceiptSession({ shopId, clientUuids })
    navigate(to)
  }
  if (background !== undefined) {
    return <BackgroundReadRow state={background} isAdmin={isAdmin} onOpen={open} onDismiss={dismissBackgroundRead} />
  }
  if (!showsReadReceiptRow({ clientUuids, assistantAvailable, isAdmin })) return null
  if (!assistantAvailable) {
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
  return <ListRow title={t.readTitle} meta={t.readMeta} icon="receipt" chevron onActivate={() => open('/scan/receipt')} />
}
