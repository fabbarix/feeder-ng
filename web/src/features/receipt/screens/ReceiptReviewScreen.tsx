// Route /scan/receipt/review: what the assistant proposes, checked by the User, applied on a press (design 3.4, 7.2, 9; mock-ups 15 to 17).
// The Add… seam: pressing Add… on a Not scanned row calls `renderAdd` (the new-Product sheet, wired at integration) with the row.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, FormActions, Icon, IconButton, Page, StickyActionBar, useConfirm, useToast } from '../../../ui'
import { FormError } from '../../../ui/fields/FormError'
import { ReceiptAlert } from '../components/ReceiptAlert'
import { useMoney } from '../hooks/useMoney'
import { ReceiptPageHeader } from '../components/ReceiptPageHeader'
import { ReviewSection } from '../components/ReviewSection'
import { ReviewSummary } from '../components/ReviewSummary'
import { useReceiptReview } from '../hooks/useReceiptReview'
import { noteTexts, appliedToast, applyLabel, localDay } from '../lib/reviewCopy'
import { reviewRowViews } from '../lib/reviewRows'
import { acceptableCount } from '../lib/reviewState'
import { receiptStrings as t } from '../strings'
import type { AddDraft, Proposal } from '../types'
import '../receipt.css'

export interface AddSheetRenderProps {
  proposal: Proposal
  /** The Add's draft so far, if any (Edit hands the saved one back). */
  draft: AddDraft | undefined
  onSave(draft: AddDraft): void
  onClose(): void
}

export interface ReceiptReviewScreenProps {
  renderAdd?: (props: AddSheetRenderProps) => ReactNode
  /** B9-50 (SSP-08): the Household's Products (OfflineProduct fits): a Not scanned row whose name matches one says "{Product} is a Product". */
  products?: { id: number; name: string }[]
}

export function ReceiptReviewScreen({ renderAdd, products }: ReceiptReviewScreenProps = {}) {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const money = useMoney()
  const today = localDay(new Date())
  const [adding, setAdding] = useState<Proposal>()
  // B9-50: "Clear all" answers a press of Accept all; rows the read checked by default still offer "Accept all N".
  const [accepted, setAccepted] = useState(false)

  const onApplied = useCallback(
    (applied: number) => {
      // A plain success toast: no icon (R-D+).
      toast.show(appliedToast(applied), { status: 'success' })
      navigate('/scan')
    },
    [toast, navigate],
  )
  const review = useReceiptReview({ onApplied })
  const { highlightId } = review

  useEffect(() => {
    if (highlightId) document.querySelector<HTMLElement>('[data-highlighted="true"]')?.scrollIntoView?.({ block: 'center' })
  }, [highlightId])

  const header = (
    <ReceiptPageHeader title={t.reviewTitle} leading={<IconButton icon="back" label={t.back} onClick={() => void leave()} />} />
  )

  // Back with rows checked asks first; the read stays kept for its 10 minutes.
  async function leave() {
    if (review.hasChecked) {
      const ok = await confirm.confirm({ title: t.leaveTitle, body: t.leaveBody, confirmLabel: t.leave })
      if (!ok) return
    }
    navigate('/scan')
  }

  const sections = useMemo(
    () =>
      review.sections.map((section) => ({
        id: section.id,
        title: section.title,
        items: reviewRowViews(section.proposals, { rows: review.rows, state: review.state, money, today, highlightId, products }),
      })),
    [review.sections, review.rows, review.state, money, today, highlightId, products],
  )

  if (!review.stored) {
    return (
      <Page header={header}>
        <p className="receipt-empty">{t.noReadKept}</p>
        <Button variant="primary" onClick={() => navigate('/scan/receipt')}>
          {t.readTitle}
        </Button>
      </Page>
    )
  }

  const read = review.stored.read
  const acceptable = acceptableCount(read.proposals)
  const showClear = accepted && review.allAccepted
  const addOpen = adding && renderAdd ? renderAdd({
    proposal: adding,
    draft: review.state.adds[adding.id],
    onSave: (draft) => {
      review.setAdd(adding.id, draft)
      setAdding(undefined)
    },
    onClose: () => setAdding(undefined),
  }) : null

  return (
    <Page header={header}>
      <p className="receipt-meta">{t.nothingChanges}</p>
      <ReviewSummary
        receiptCents={read.totals.receiptCents}
        scannedCents={read.totals.scannedCents}
        lines={read.totals.lines}
        money={money}
        notes={noteTexts(read.notes, money)}
      />
      {acceptable > 0 ? (
        <Button
          variant="secondary"
          block="always"
          onClick={() => {
            if (showClear) review.clearAll()
            else review.acceptAll()
            setAccepted(!showClear)
          }}
        >
          {showClear ? t.clearAll : t.acceptAllN(acceptable)}
        </Button>
      ) : (
        <p className="receipt-todo">
          <Icon name="info" size={16} />
          <span>{t.acceptNothing}</span>
        </p>
      )}
      {sections.map((section) => (
        <ReviewSection
          key={section.id}
          title={section.title}
          items={section.items}
          onToggle={review.toggle}
          onOpenAdd={(id) => setAdding(review.stored?.read.proposals.find((p) => p.id === id))}
        />
      ))}
      {/* B9-50: a refusal about a line shows at its row (the highlight) and as the form's one FormError; one with something to press is an alert tile */}
      {review.error && review.error.action === 'none' ? <FormError>{review.error.message}</FormError> : null}
      {review.error && review.error.action !== 'none' ? (
        <ReceiptAlert
          copy={{ message: review.error.message, action: review.error.action }}
          onRetry={() => void review.apply()}
          onReadAgain={() => {
            review.readAgain()
            navigate('/scan/receipt')
          }}
        />
      ) : null}
      <StickyActionBar>
        <FormActions
          primary={
            <Button variant="primary" size="lg" block="always" disabled={review.applying || review.applyCount === 0} onClick={() => void review.apply()}>
              {applyLabel(review.applyCount)}
            </Button>
          }
        />
      </StickyActionBar>
      {addOpen}
    </Page>
  )
}

