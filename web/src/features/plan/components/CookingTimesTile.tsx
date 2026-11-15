// B9-51 (PC-14, A2): the Cooking times tile, first on Planning rules. Renders and wires events; useCookingTimes owns the draft,
// the check, the save and the example line.
import type { ReactNode } from 'react'
import { Button, DetailList, DetailRow, Icon, Switch, Tile, TimeField } from '../../../ui'
import { FormError } from '../../../ui/fields/FormError'
import type { UseCookingTimes } from '../hooks/useCookingTimes'
import { cookingTimesStrings as s } from '../lib/planningRulesStrings'
import '../planning-rules.css'

export interface CookingTimesTileProps {
  times: UseCookingTimes
}

interface TimeRowProps {
  label: string
  timeLabel: string
  description: string
  on: boolean
  time: string
  error?: string
  disabled: boolean
  onOn: (on: boolean) => void
  onTime: (time: string) => void
}

/** One time: its on/Off switch (Off is a value) and, while on, our TimeField (its label is the switch's, for assistive technology). */
function TimeRow({ label, timeLabel, description, on, time, error, disabled, onOn, onTime }: TimeRowProps): ReactNode {
  return (
    <div className="cooking-times__item" data-on={on ? 'true' : 'false'}>
      <Switch label={label} description={description} checked={on} disabled={disabled} onChange={onOn} />
      {on ? <TimeField label={timeLabel} value={time} error={error} disabled={disabled} onChange={onTime} /> : null}
    </div>
  )
}

/** The example line: muted, after the info glyph (the mock of PC-14). */
function Example({ text }: { text: string | null }): ReactNode {
  return text ? (
    <p className="cooking-times__example">
      <Icon name="info" size={16} />
      <span>{text}</span>
    </p>
  ) : null
}

/** A plain User reads the stored times as rows (R-E: read-only rows are a DetailList), not as disabled controls. */
function ReadOnlyTimes({ times }: CookingTimesTileProps): ReactNode {
  const { earliest, latest } = times
  return (
    <div className="cooking-times__form">
      <p className="plan__muted">{s.lede}</p>
      <DetailList className="cooking-times__read">
        <DetailRow label={s.earliest} state={earliest.on ? earliest.time : s.off} detail={earliest.on ? s.earliestOn : s.earliestOffNote} />
        <DetailRow label={s.latest} state={latest.on ? latest.time : s.off} detail={latest.on ? s.latestOn : s.latestOffNote} />
      </DetailList>
      <Example text={times.example} />
      <p className="plan__muted">{s.readOnly}</p>
    </div>
  )
}

export function CookingTimesTile({ times }: CookingTimesTileProps): ReactNode {
  const readOnly = !times.canEdit
  return (
    <Tile as="section" span="full" aria-labelledby="cooking-times-title">
      <h2 id="cooking-times-title" className="plan__tile-title">
        {s.title}
      </h2>
      {times.state === 'error' ? (
        <p className="plan__muted">{s.loadFailed}</p>
      ) : times.readOnly && times.state === 'ready' ? (
        <ReadOnlyTimes times={times} />
      ) : (
        <form
          ref={times.formRef}
          className="cooking-times__form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (!readOnly) void times.save()
          }}
        >
          <p className="plan__muted">{s.lede}</p>
          <TimeRow
            label={s.earliest}
            timeLabel={s.earliestTime}
            description={times.earliest.on ? s.earliestOn : s.earliestOff}
            on={times.earliest.on}
            time={times.earliest.time}
            error={times.errors.earliestStart}
            disabled={readOnly || times.state !== 'ready'}
            onOn={times.setEarliestOn}
            onTime={times.setEarliestTime}
          />
          <TimeRow
            label={s.latest}
            timeLabel={s.latestTime}
            description={times.latest.on ? s.latestOn : s.latestOff}
            on={times.latest.on}
            time={times.latest.time}
            error={times.errors.latestStart}
            disabled={readOnly || times.state !== 'ready'}
            onOn={times.setLatestOn}
            onTime={times.setLatestTime}
          />
          <Example text={times.example} />
          {readOnly ? null : (
            <>
              <FormError>{times.formError}</FormError>
              <div className="cooking-times__actions">
                <Button type="submit" variant="primary" disabled={!times.dirty || times.saving} loading={times.saving}>
                  {s.save}
                </Button>
              </div>
            </>
          )}
        </form>
      )}
    </Tile>
  )
}
