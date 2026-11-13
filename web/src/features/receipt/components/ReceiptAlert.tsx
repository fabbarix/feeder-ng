// A refusal or failure, said once in words, with the one thing to press (receiptErrors' action).
import { Link } from 'react-router-dom'
import { Button, Tile } from '../../../ui'
import { receiptStrings as t } from '../strings'
import type { ReceiptErrorCopy } from '../types'

export interface ReceiptAlertProps {
  copy: ReceiptErrorCopy
  onRetry?: () => void
  onReadAgain?: () => void
}

export function ReceiptAlert({ copy, onRetry, onReadAgain }: ReceiptAlertProps) {
  return (
    <Tile variant="soft" role="alert" className="receipt-alert">
      <p className="receipt-alert__message">{copy.message}</p>
      {copy.action === 'retry' && onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          {t.retry}
        </Button>
      ) : null}
      {copy.action === 'readAgain' && onReadAgain ? (
        <Button variant="secondary" onClick={onReadAgain}>
          {t.readAgain}
        </Button>
      ) : null}
      {copy.action === 'settings' ? (
        <Link to="/settings/recipe-assistant" className="receipt-link">
          {t.recipeSettings}
        </Link>
      ) : null}
    </Tile>
  )
}
