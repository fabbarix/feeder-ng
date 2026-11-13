import { useEffect, useId, useRef, useState, type MutableRefObject, type ReactNode, type Ref } from 'react'
import { Link } from 'react-router-dom'
import { Button, Segmented, TextArea, TextField, Tile } from '../../../ui'
import { usePhotoPages } from '../hooks/usePhotoPages'
import { usePhotoReadEnd } from '../hooks/usePhotoReadEnd'
import type { UseRecipeRead } from '../hooks/useRecipeRead'
import type { ReadAvailability } from '../lib/readAvailability'
import { blockText } from '../lib/photoMessages'
import { withModelName } from '../lib/readErrors'
import { textCounter } from '../lib/readRequest'
import { importStrings as s, readStrings as t } from '../strings'
import type { ReadInput } from '../types'
import { ReadErrorTile } from './ReadErrorTile'
import { ReadPhotoPanel } from './ReadPhotoPanel'
import { ReadProgress } from './ReadProgress'

export interface ReadRecipeStepProps {
  read: UseRecipeRead
  availability: ReadAvailability & { retry?: () => void }
  /** The step's heading takes focus when the page is opened at #read (the screen owns that). */
  headingRef?: Ref<HTMLHeadingElement>
  /** BR-E round 2: ids of the elements that describe the heading (the "Reading Béchamel" note, when a read is for a Base recipe). */
  headingDescribedBy?: string
  /**
   * The screen's slot for this step's photo clearing (pages.finished). The screen runs it when a photo read reaches review, after
   * this step has unmounted (hotfix 4.2).
   */
  photosFinished?: MutableRefObject<(() => void) | undefined>
}

type Tab = 'url' | 'text' | 'photo'

/**
 * Step 1 of the import: "Read a recipe" (docs/dev/design/ra-e-import.md section 6). A Tile with the input choice
 * (Web page, Text, Photo), its panel, the Read button, the progress while a read runs, the error tile after a failure,
 * and the disabled reason when the feature is off. Renders and wires; the work is in useRecipeRead and lib/.
 */
export function ReadRecipeStep({ read, availability, headingRef, headingDescribedBy, photosFinished }: ReadRecipeStepProps): ReactNode {
  const [tab, setTab] = useState<Tab>('url')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const pages = usePhotoPages()
  const [sending, setSending] = useState(false)
  const lastInput = useRef<ReadInput | undefined>(undefined)
  const reopened = useRef(false)
  const errorTile = useRef<HTMLElement>(null)
  const readButton = useRef<HTMLButtonElement>(null)
  const ids = useId()
  const readButtonId = `${ids}-read`
  const reasonId = `${ids}-reason`
  const photosReasonId = `${ids}-photos`
  const blockId = `${ids}-block`

  // While a read runs, the choice shows what is being read.
  const current: Tab = read.busy && read.kind ? read.kind : tab === 'photo' && !availability.photos ? 'url' : tab
  const locked = availability.loading || !availability.enabled || read.busy
  const reason = !availability.loading && !availability.enabled ? availability.message : undefined
  const describedBy = reason ? reasonId : undefined

  // The button that started a read is replaced by the progress, which takes focus. When the read ends, focus goes back to the
  // Read button (cancelled) or to the error tile (failed), unless the User has already moved somewhere else.
  const wasBusy = useRef(read.busy)
  useEffect(() => {
    const was = wasBusy.current
    wasBusy.current = read.busy
    if (!was || read.busy) return
    const active = document.activeElement
    if (active && active !== document.body && active.isConnected) return
    if (read.phase === 'failed') errorTile.current?.focus()
    else readButton.current?.focus()
  }, [read.busy, read.phase])

  // The photos the device kept come back: the Photo tab opens once, the first time there are some.
  useEffect(() => {
    if (reopened.current || pages.restoredCount === 0 || !availability.photos) return
    reopened.current = true
    setTab('photo')
  }, [pages.restoredCount, availability.photos])

  // Sending (the photos are turned into data URLs) holds the button until the read has started, failed or ended. A refused start sets a new
  // error even when the phase is already 'failed', so the error (and the phase) end it.
  useEffect(() => {
    setSending(false)
  }, [read.phase, read.error])

  // The photos are kept until a read reaches review: the screen calls the published clearing then (photosFinished), and this
  // step's own effect covers a read that ends while the step is still mounted (usePhotoReadEnd).
  // Not cleared on unmount: the screen's effect runs after this step has gone, and needs the last clearing published.
  useEffect(() => {
    if (photosFinished) photosFinished.current = pages.finished
  }, [photosFinished, pages.finished])
  usePhotoReadEnd(read, pages.finished)

  const counter = textCounter(text)
  const input: ReadInput | undefined = current === 'url' ? { kind: 'url', url } : current === 'text' ? { kind: 'text', text } : undefined
  const hasInput = current === 'url' ? url.trim() !== '' : current === 'text' ? text.trim() !== '' && !counter.over : pages.canRead
  const canRead = !locked && hasInput
  const block = current === 'photo' ? blockText(pages.state) : undefined

  const clearFailure = () => {
    if (read.phase === 'failed') read.reset()
  }
  const submit = () => {
    if (!canRead) return
    if (!input) {
      setSending(true)
      pages.toReadInput().then(
        (photoInput) => start(photoInput),
        () => setSending(false),
      )
      return
    }
    start(input)
  }
  const start = (next: ReadInput) => {
    lastInput.current = next
    void read.start(next)
  }

  return (
    <Tile as="section" overline={s.stepOverline(1)} overlineIcon="assistant">
      <h2 ref={headingRef} tabIndex={-1} aria-describedby={headingDescribedBy}>
        {t.stepTitle}
      </h2>
      <Segmented
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
      <div className="read-step__panel">
        {current === 'url' ? (
          <TextField
            type="url"
            label={t.pageLabel}
            placeholder={t.pagePlaceholder}
            autoComplete="off"
            value={url}
            disabled={locked}
            aria-describedby={describedBy}
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
            aria-describedby={describedBy}
            helper={counter.label}
            error={counter.over ? t.textTooLong : undefined}
            onChange={(v) => {
              clearFailure()
              setText(v)
            }}
          />
        ) : null}
        {current === 'photo' ? (
          <ReadPhotoPanel pages={pages} disabled={locked} />
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
        <ReadProgress
          kind={read.kind ?? current}
          state={read.state}
          elapsedSeconds={read.elapsedSeconds}
          onCancel={() => void read.cancel()}
        />
      ) : (
        <>
          {block ? (
            <p id={blockId} className="read-step__muted">
              {block}
            </p>
          ) : null}
          <Button
            ref={readButton}
            id={readButtonId}
            icon="assistant"
            disabled={!canRead || sending || block !== undefined}
            aria-describedby={describedBy ?? (block ? blockId : undefined)}
            onClick={submit}
          >
            {t.readAction}
          </Button>
        </>
      )}
      {read.phase === 'failed' && read.error ? (
        <ReadErrorTile
          error={withModelName(read.error, { id: availability.modelId, name: availability.modelName })}
          isAdmin={availability.isAdmin}
          focusRef={errorTile}
          onRetry={() => lastInput.current && void read.start(lastInput.current)}
        />
      ) : null}
    </Tile>
  )
}

