// The Scanned list the Scan screen published for the receipt routes (lib/receiptSession), or undefined.
import { useSyncExternalStore } from 'react'
import { getReceiptSession, subscribeReceiptSession } from '../lib/receiptSession'
import type { ReceiptSession } from '../types'

export function useReceiptSession(): ReceiptSession | undefined {
  return useSyncExternalStore(subscribeReceiptSession, getReceiptSession)
}
