// B9-13 section of the dev Gallery (route /_gallery): "Rows and groups", the ListRow slots (actions, below, sync), a titled
// ListGroup, the neutral Avatar and a SyncNotice stack. Each example sits in its own cell, so each cell is its own primary scope.
import { useState, type ReactNode } from 'react'
import { Avatar } from './Avatar'
import { Button, PRIMARY_SCOPE_ATTR } from './Button'
import { Chip } from './Chip'
import { Switch } from './fields/Switch'
import { IconButton } from './IconButton'
import { ListGroup, ListRow } from './ListRow'
import { Cluster } from './Stack'
import { SyncNoticeStack } from './SyncNotice'
import './Gallery.css'

const noop = () => {}

/** A full-width cell: a ListGroup is a size container, so it has no width of its own in a shrink-to-fit cell. */
function Cell({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="gallery__cell gallery__cell--wide" {...{ [PRIMARY_SCOPE_ATTR]: '' }}>
      {children}
      <p className="gallery__caption">{caption}</p>
    </div>
  )
}

/** A leading control (the slot Shop's tick uses): a 44 px IconButton. */
function Tick({ name }: { name: string }) {
  return <IconButton icon="tick" label={`Tick ${name}`} pressed={false} />
}

function SwitchAction({ name }: { name: string }) {
  const [on, setOn] = useState(true)
  return <Switch label="Admin" aria-label={`Admin: ${name}`} checked={on} onChange={setOn} />
}

// Oldest first, as the stack takes them: the newest three show (n1 with its R-E rows on top), then "and 1 more".
const NOTICES = [
  { id: 'n2', tone: 'warn' as const, title: "Couldn't sync the Tick of Milk", subtitle: 'The Line was deleted on another device.', actions: [{ label: 'Add it again', onClick: noop }, { label: 'Dismiss', onClick: noop }] },
  { id: 'n3', tone: 'warn' as const, title: "Couldn't sync the Scan of Eggs", actions: [{ label: 'Retry', onClick: noop }] },
  { id: 'n4', tone: 'info' as const, title: 'Bread was ticked twice' },
  { id: 'n1', tone: 'info' as const, title: 'Carrot was ticked twice', subtitle: 'Both Stock Lots were added.', rows: [{ key: 'Sam', amount: '+1 kg', time: '10:02' }, { key: 'You', amount: '+1 kg', time: '10:05' }] },
]

export function RowsGalleryGroup() {
  return (
    <section className="gallery__group">
      <h3>Rows and groups</h3>
      <div className="gallery__cells">
        <Cell caption="actions (SET-03): own line under 35 rem; neutral Avatar (SET-12)">
          <ListGroup label="Sign-in requests and Members">
            <ListRow
              title="robin@example.test"
              meta="Asked 2 days ago"
              leading={<Avatar name="robin@example.test" tone="neutral" />}
              actions={
                <>
                  <Button variant="secondary" size="sm" onClick={noop}>
                    Deny
                  </Button>
                  <Button variant="primary" size="sm" onClick={noop}>
                    Approve
                  </Button>
                </>
              }
            />
            <ListRow
              title="cook@example.test"
              meta="Member since March"
              leading={<Avatar name="Cook" />}
              onActivate={noop}
              actions={
                <>
                  <SwitchAction name="cook@example.test" />
                  <IconButton icon="copy" label="Copy sign-in message for cook@example.test" />
                </>
              }
            />
          </ListGroup>
        </Cell>
        <Cell caption="below (PC-06): a chip line under the whole row">
          <ListGroup label="Courses">
            <ListRow
              title="Cauliflower al gorgonzola with chestnut mushrooms"
              meta="Main"
              icon="pasta"
              onActivate={noop}
              trailing={<IconButton icon="more" label="More for Main" />}
              below={
                <Cluster>
                  <Chip kind="status" status="pinned">Pinned</Chip>
                  <Chip>Sat Breakfast +2</Chip>
                </Cluster>
              }
            />
          </ListGroup>
        </Cell>
        <Cell caption="sync (RES-03): pending, failed, then a plain row">
          <ListGroup label="Shopping List">
            <ListRow title="Milk" meta="Waiting to sync" sync="pending" control={<Tick name="Milk" />} onActivate={noop} value="2 l" subValue="$3.49" />
            <ListRow title="Eggs" meta="Couldn't sync: the Line was deleted" sync="failed" control={<Tick name="Eggs" />} onActivate={noop} value="12" />
            <ListRow title="Toilet paper" meta="Below 4 · 2 in Stock" metaCompact="2 in Stock" metaStatus="info" control={<Tick name="Toilet paper" />} onActivate={noop} value="4" subValue="$5.20" />
          </ListGroup>
        </Cell>
        <Cell caption="titled group (SSP-03): icon, name, round count, one action">
          <ListGroup
            title="Kitchen Fridge"
            icon="fridge"
            count={5}
            countLabel={(n) => `${n} Stock Lots`}
            action={
              <Button variant="secondary" size="sm" onClick={noop}>
                Put away
              </Button>
            }
          >
            <ListRow title="Milk" meta="Good until tomorrow" metaStatus="spoil" onActivate={noop} value="1 l" />
            <ListRow title="Butter" meta="Good until Sat" onActivate={noop} value="250 g" />
          </ListGroup>
          <ListGroup title="Garage Freezer" icon="snowflake" count={12} countLabel={(n) => `${n} Stock Lots`}>
            <ListRow title="Peas" meta="No go-off date" onActivate={noop} value="900 g" />
          </ListGroup>
        </Cell>
        <Cell caption="navigation rows, two-line description (DS-10)">
          <ListGroup label="Settings">
            <ListRow title="Supplies" meta="What you buy and keep but don't cook with: toilet paper, batteries, laundry pods" icon="supply" href="#supplies" chevron metaLines={2} />
            <ListRow title="Members" meta="Who eats here" icon="members" href="#members" chevron metaLines={2} />
          </ListGroup>
        </Cell>
        <Cell caption="SyncNotice stack: the newest three, then and N more">
          <SyncNoticeStack notices={NOTICES} />
        </Cell>
      </div>
    </section>
  )
}
