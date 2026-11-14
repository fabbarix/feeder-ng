// Route /scan/receipt: the photos of the receipt and the read (design 3.2, 3.3, 7.3, 9; mock-ups 13 and 14). Full screen, no bars.
import { useEffect, useId, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useConnectivity } from '../../../app/useConnectivity'
import { useReadAvailability } from '../../import/hooks/useReadAvailability'
import { Button, FormActions, IconButton, ImageFileInput, Page, PhotoEditSheet, StickyActionBar, Tile, useConfirm, type ImageEdit, type ImageFileInputHandle } from '../../../ui'
import { ReadProgress } from '../components/ReadProgress'
import { ReceiptPageHeader } from '../components/ReceiptPageHeader'
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
  // The photo being edited (its sheet is open), and whether its edit is being prepared.
  const [editingId, setEditingId] = useState<string>()
  const [applying, setApplying] = useState(false)
  const photosSection = useRef<HTMLElement>(null)
  // The position of the photo whose Edit button gets focus back once it can take it (the edit disables the row while it is prepared).
  const returnFocusTo = useRef<number | undefined>(undefined)
  const editIndex = editingId === undefined ? -1 : photos.photos.findIndex((p) => p.id === editingId)
  const editing = editIndex >= 0 ? photos.photos[editIndex] : undefined
  const rowsBusy = read.busy || photos.busy

  useEffect(() => {
    if (read.phase === 'done') navigate('/scan/receipt/review', { replace: true })
  }, [read.phase, navigate])

  useEffect(() => {
    const n = returnFocusTo.current
    if (n === undefined || editingId !== undefined || rowsBusy) return
    const button = photosSection.current?.querySelector<HTMLButtonElement>(`button[aria-label="${t.editPhoto(n)}"]`)
    if (button && !button.disabled) {
      button.focus()
      returnFocusTo.current = undefined
    }
  }, [editingId, rowsBusy])

  const openEdit = (id: string) => setEditingId(id)
  const closeEdit = () => {
    returnFocusTo.current = editIndex + 1
    setEditingId(undefined)
  }
  // Use this: the edited photo is prepared again; the sheet closes whatever the outcome (the hook says why in `problem`).
  const finishEdit = async (edit: ImageEdit) => {
    if (editingId === undefined) return
    setApplying(true)
    try {
      await photos.applyEdit(editingId, edit)
    } finally {
      setApplying(false)
      closeEdit()
    }
  }

  // Leaving with photos asks first; leaving during a read just leaves (the read stops with the screen).
  const leave = async () => {
    if (photos.count > 0 && !read.busy) {
      const ok = await confirm.confirm({ title: t.leavePhotosTitle, body: photosNotKept(photos.count), confirmLabel: t.leave, tone: 'danger' })
      if (!ok) return
      photos.clear()
    }
    navigate('/scan')
  }

  const { canRead, reasons } = readGate({ offline, avail, photoCount: photos.count, preparing: photos.busy, reading: read.busy, editing: editingId !== undefined })

  const failure = read.phase === 'failed' && read.error ? describeReceiptError(read.error, { isAdmin }) : undefined
  const problem = photos.problem ? describeReceiptError({ code: photos.problem }, { isAdmin }).message : undefined

  return (
    <Page header={<ReceiptPageHeader title={t.readTitle} leading={<IconButton icon="back" label={t.back} onClick={leave} />} />}>
      <section className="receipt-section" ref={photosSection}>
        <h2 className="receipt-section__title">{photosTitle(photos.count)}</h2>
        {photos.count > 0 ? <ReceiptPhotoList photos={photos.photos} disabled={rowsBusy} onRemove={photos.remove} onEdit={openEdit} /> : null}
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
      <PhotoEditSheet
        open={editing !== undefined}
        title={t.editPhoto(editIndex + 1)}
        src={editing?.previewUrl ?? ''}
        width={editing?.width ?? 0}
        height={editing?.height ?? 0}
        busy={applying}
        onUse={(edit) => void finishEdit(edit)}
        onCancel={closeEdit}
      />
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

