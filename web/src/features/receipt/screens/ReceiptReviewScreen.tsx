// Route /scan/receipt/review: what the assistant proposes, checked by the User, applied on a press (design 3.4, 7.2, 9; mock-ups 15 to 17).
// The Add… seam: pressing Add… on a Not scanned row calls `renderAdd` (the new-Product sheet, wired at integration) with the row.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatPriceMinor } from '../../../ui/lib/moneyInput'
import { Button, FormActions, IconButton, Page, PageHeader, StickyActionBar, useConfirm, useToast } from '../../../ui'
import { useCurrency } from '../../products/hooks/useCurrency'
import { ReceiptAlert } from '../components/ReceiptAlert'
import { ReviewSection } from '../components/ReviewSection'
import { ReviewSummary } from '../components/ReviewSummary'
import { useReceiptReview } from '../hooks/useReceiptReview'
import { noteTexts, appliedToast, applyLabel } from '../lib/reviewCopy'
import { reviewRowViews } from '../lib/reviewRows'
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
}

/** Today as a calendar day in the phone's zone (YYYY-MM-DD). */
function localDay(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function ReceiptReviewScreen({ renderAdd }: ReceiptReviewScreenProps = {}) {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const currency = useCurrency()
  const money = useCallback((cents: number) => formatPriceMinor(cents, currency, 'en'), [currency])
  const today = localDay(new Date())
  const [adding, setAdding] = useState<Proposal>()

  const onApplied = useCallback(
    (applied: number) => {
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
    <PageHeader title={t.reviewTitle} leading={<IconButton icon="back" label={t.back} onClick={() => void leave()} />} />
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
        items: reviewRowViews(section.proposals, { rows: review.rows, state: review.state, money, today, highlightId }),
      })),
    [review.sections, review.rows, review.state, money, today, highlightId],
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
      <Button variant="secondary" block="always" onClick={review.allAccepted ? review.clearAll : review.acceptAll}>
        {review.allAccepted ? t.clearAll : t.acceptAll}
      </Button>
      {sections.map((section) => (
        <ReviewSection
          key={section.id}
          title={section.title}
          items={section.items}
          onToggle={review.toggle}
          onOpenAdd={(id) => setAdding(review.stored?.read.proposals.find((p) => p.id === id))}
        />
      ))}
      {review.error ? (
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

