// Route /scan/receipt: the photos of the receipt and the read (design 3.2, 3.3, 7.3, 9; mock-ups 13 and 14). Full screen, no bars.
import { useEffect, useId, useRef } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useConnectivity } from '../../../app/useConnectivity'
import { useReadAvailability } from '../../import/hooks/useReadAvailability'
import { Button, FormActions, IconButton, ImageFileInput, Page, PageHeader, StickyActionBar, Tile, useConfirm, type ImageFileInputHandle } from '../../../ui'
import { ReadProgress } from '../components/ReadProgress'
import { ReceiptAlert } from '../components/ReceiptAlert'
import { ReceiptPhotoList } from '../components/ReceiptPhotoList'
import { useReceiptPhotos } from '../hooks/useReceiptPhotos'
import { useReceiptRead } from '../hooks/useReceiptRead'
import { useReceiptSession } from '../hooks/useReceiptSession'
import { readGate } from '../lib/readGate'
import { describeReceiptError } from '../lib/receiptErrors'
import { photosNotKept, photosTitle } from '../lib/reviewCopy'
import { receiptStrings as t } from '../strings'
import type { ReceiptSession } from '../types'
import '../receipt.css'

export function ReceiptPhotosScreen() {
  const session = useReceiptSession()
  if (!session) return <Navigate to="/scan" replace />
  return <ReceiptPhotosPage session={session} />
}

function ReceiptPhotosPage({ session }: { session: ReceiptSession }) {
  const navigate = useNavigate()
  const confirm = useConfirm()
  const { offline } = useConnectivity()
  const avail = useReadAvailability()
  const photos = useReceiptPhotos()
  const read = useReceiptRead(session)
  const files = useRef<ImageFileInputHandle>(null)
  const reasonId = useId()
  const isAdmin = avail.isAdmin

  useEffect(() => {
    if (read.phase === 'done') navigate('/scan/receipt/review', { replace: true })
  }, [read.phase, navigate])

  // Leaving with photos asks first; leaving during a read just leaves (the read stops with the screen).
  const leave = async () => {
    if (photos.count > 0 && !read.busy) {
      const ok = await confirm.confirm({ title: t.leavePhotosTitle, body: photosNotKept(photos.count), confirmLabel: t.leave, tone: 'danger' })
      if (!ok) return
      photos.clear()
    }
    navigate('/scan')
  }

  const { canRead, reasons } = readGate({ offline, avail, photoCount: photos.count, preparing: photos.busy, reading: read.busy })

  const failure = read.phase === 'failed' && read.error ? describeReceiptError(read.error, { isAdmin }) : undefined
  const problem = photos.problem ? describeReceiptError({ code: photos.problem }, { isAdmin }).message : undefined

  return (
    <Page header={<PageHeader title={t.readTitle} leading={<IconButton icon="back" label={t.back} onClick={leave} />} />}>
      <section className="receipt-section">
        <h2 className="receipt-section__title">{photosTitle(photos.count)}</h2>
        {photos.count > 0 ? <ReceiptPhotoList photos={photos.photos} disabled={read.busy || photos.busy} onRemove={photos.remove} /> : null}
        {problem !== undefined ? (
          <Tile variant="soft" className="receipt-problem">
            <p>{problem}</p>
            <Button variant="tertiary" onClick={photos.dismissProblem}>
              {t.dismiss}
            </Button>
          </Tile>
        ) : null}
        {read.busy ? (
          <ReadProgress elapsedSeconds={read.elapsedSeconds} connectionLost={read.connectionLost} onCancel={() => void read.cancel()} />
        ) : null}
        {failure ? <ReceiptAlert copy={failure} onRetry={() => void read.start(photos.toBody())} /> : null}
        {!read.busy ? (
          <div className="receipt-add">
            <ImageFileInput ref={files} capture onFiles={(list) => void photos.add(list)} disabled={!photos.canAdd} />
            {photos.count === 0 ? (
              <Button variant="secondary" icon="camera" onClick={() => files.current?.open()}>
                {t.takePhoto}
              </Button>
            ) : null}
            {photos.count > 0 && photos.canAdd ? (
              <Button variant="secondary" icon="camera" onClick={() => files.current?.open()}>
                {t.addPhoto}
              </Button>
            ) : null}
          </div>
        ) : null}
        {photos.count > 0 ? <p className="receipt-hint">{t.longHint}</p> : null}
      </section>
      <section className="receipt-section">
        <Tile variant="status" status="info">
          <p className="receipt-privacy">{t.privacy}</p>
        </Tile>
        {reasons.length > 0 || avail.settingsLink ? (
          <div id={reasonId} className="receipt-reasons">
            {reasons.map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
            {avail.settingsLink ? (
              <Link to="/settings/recipe-assistant" className="receipt-link">
                {t.recipeSettings}
              </Link>
            ) : null}
          </div>
        ) : null}
      </section>
      {!read.busy ? (
        <StickyActionBar>
          <FormActions
            primary={
              <Button
                variant="primary"
                size="lg"
                block="always"
                disabled={!canRead}
                aria-describedby={reasons.length > 0 ? reasonId : undefined}
                onClick={() => void read.start(photos.toBody())}
              >
                {t.readTitle}
              </Button>
            }
          />
        </StickyActionBar>
      ) : null}
    </Page>
  )
}

