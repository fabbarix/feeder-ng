import { useId, useRef, useState, type ReactNode, type Ref } from 'react'
import { Link } from 'react-router-dom'
import { Button, TextArea, TextField, Tile } from '../../../ui'
import { useDescribedBy } from '../hooks/useDescribedBy'
import type { UseRecipeRead } from '../hooks/useRecipeRead'
import type { ReadAvailability } from '../lib/readAvailability'
import { filledPhotos, emptySlots, setSlot, type PhotoSlots } from '../lib/photoSlots'
import { withModelName } from '../lib/readErrors'
import { textCounter } from '../lib/readRequest'
import { importStrings as s, readStrings as t } from '../strings'
import type { ReadInput } from '../types'
import { ReadErrorTile } from './ReadErrorTile'
import { ReadPhotoPanel } from './ReadPhotoPanel'
import { ReadProgress } from './ReadProgress'
import { ReadSourceChoice } from './ReadSourceChoice'

export interface ReadRecipeStepProps {
  read: UseRecipeRead
  availability: ReadAvailability & { retry?: () => void }
  /** The step's heading takes focus when the page is opened at #read (the screen owns that). */
  headingRef?: Ref<HTMLHeadingElement>
}

type Tab = 'url' | 'text' | 'photo'

/**
 * Step 1 of the import: "Read a recipe" (docs/dev/design/ra-e-import.md section 6). A Tile with the input choice
 * (Web page, Text, Photo), its panel, the Read button, the progress while a read runs, the error tile after a failure,
 * and the disabled reason when the feature is off. Renders and wires; the work is in useRecipeRead and lib/.
 */
export function ReadRecipeStep({ read, availability, headingRef }: ReadRecipeStepProps): ReactNode {
  const [tab, setTab] = useState<Tab>('url')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [slots, setSlots] = useState<PhotoSlots>(emptySlots)
  const lastInput = useRef<ReadInput | undefined>(undefined)
  const panel = useRef<HTMLDivElement>(null)
  const ids = useId()
  const reasonId = `${ids}-reason`
  const photosReasonId = `${ids}-photos`

  // While a read runs, the choice shows what is being read.
  const current: Tab = read.busy && read.kind ? read.kind : tab === 'photo' && !availability.photos ? 'url' : tab
  const locked = availability.loading || !availability.enabled || read.busy
  const reason = !availability.loading && !availability.enabled ? availability.message : undefined
  useDescribedBy(panel, reason ? reasonId : undefined)

  const counter = textCounter(text)
  const photos = filledPhotos(slots)
  const input: ReadInput | undefined =
    current === 'url' ? { kind: 'url', url } : current === 'text' ? { kind: 'text', text } : { kind: 'photo', photos }
  const hasInput = current === 'url' ? url.trim() !== '' : current === 'text' ? text.trim() !== '' && !counter.over : photos.length > 0
  const canRead = !locked && hasInput

  const clearFailure = () => {
    if (read.phase === 'failed') read.reset()
  }
  const submit = () => {
    if (!canRead || !input) return
    lastInput.current = input
    void read.start(input)
  }

  return (
    <Tile as="section" overline={s.stepOverline(1)} overlineIcon="assistant">
      <h2 ref={headingRef} tabIndex={-1}>
        {t.stepTitle}
      </h2>
      <ReadSourceChoice
        label={t.readFrom}
        value={current}
        disabled={locked}
        onChange={(next) => {
          clearFailure()
          setTab(next)
        }}
        options={[
          { value: 'url', label: t.tabPage },
          { value: 'text', label: t.tabText },
          { value: 'photo', label: t.tabPhoto, disabled: !availability.photos, describedBy: availability.photosMessage ? photosReasonId : undefined },
        ]}
      />
      {availability.photosMessage ? (
        <p id={photosReasonId} className="read-step__muted">
          {availability.photosMessage}
        </p>
      ) : null}
      <div ref={panel} className="read-step__panel">
        {current === 'url' ? (
          <TextField
            type="url"
            label={t.pageLabel}
            placeholder={t.pagePlaceholder}
            autoComplete="off"
            value={url}
            disabled={locked}
            onChange={(v) => {
              clearFailure()
              setUrl(v)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
          />
        ) : null}
        {current === 'text' ? (
          <TextArea
            label={t.textLabel}
            rows={8}
            value={text}
            disabled={locked}
            helper={counter.label}
            error={counter.over ? t.textTooLong : undefined}
            onChange={(v) => {
              clearFailure()
              setText(v)
            }}
          />
        ) : null}
        {current === 'photo' ? (
          <ReadPhotoPanel
            slots={slots}
            disabled={locked}
            onSlotChange={(i, image) => {
              clearFailure()
              setSlots((prev) => setSlot(prev, i, image))
            }}
          />
        ) : null}
      </div>
      {reason ? (
        <p id={reasonId} className="read-step__muted">
          {reason}
        </p>
      ) : null}
      {availability.statusFailed ? (
        <Button variant="tertiary" icon="refresh" onClick={() => availability.retry?.()}>
          {t.checkAgain}
        </Button>
      ) : null}
      {availability.settingsLink ? (
        <Link className="import-text-link" to="/settings/recipe-assistant">
          {t.settingsLink}
        </Link>
      ) : null}
      {availability.limitHint ? <p className="read-step__muted">{availability.limitHint}</p> : null}
      {read.busy ? (
        <ReadProgress kind={read.kind ?? current} state={read.state} elapsedSeconds={read.elapsedSeconds} onCancel={() => void read.cancel()} />
      ) : (
        <Button icon="assistant" disabled={!canRead} aria-describedby={reason ? reasonId : undefined} onClick={submit}>
          {t.readAction}
        </Button>
      )}
      {read.phase === 'failed' && read.error ? (
        <ReadErrorTile
          error={withModelName(read.error, { id: availability.modelId, name: availability.modelName })}
          isAdmin={availability.isAdmin}
          onRetry={() => lastInput.current && void read.start(lastInput.current)}
        />
      ) : null}
    </Tile>
  )
}

