import type { ReactNode } from 'react'
import { BentoGrid } from './BentoGrid'
import { Button, PRIMARY_SCOPE_ATTR, type ButtonVariant } from './Button'
import { Chip, type ChipStatus } from './Chip'
import { EmptyState } from './EmptyState'
import { IconButton } from './IconButton'
import { ListGroup, ListRow } from './ListRow'
import { FormActions } from './FormActions'
import { DateField } from './fields/DateField'
import { FieldRow } from './fields/FieldRow'
import { NumberField } from './fields/NumberField'
import { SearchField } from './fields/SearchField'
import { Segmented } from './fields/Segmented'
import { TextField } from './fields/TextField'
import { TimeField } from './fields/TimeField'
import { Select } from './Select/Select'
import { Stepper } from './Stepper'
import type { FieldSize } from './fields/Field'
import { Page } from './Page'
import { PageHeader } from './PageHeader'
import { StickyActionBar } from './StickyActionBar'
import { MemberPill } from './MemberPill/MemberPill'
import { WeekdayPicker } from './WeekdayPicker/WeekdayPicker'
import { ProgressTile } from './ProgressTile'
import { RecipeThumb } from './RecipeThumb'
import { Tile, TileMetric } from './Tile'
import { TimerTile } from './TimerTile'
import { WhyChip } from './WhyChip'
import { OverlayGalleryGroups } from './GalleryOverlays'
import './Gallery.css'

/**
 * Dev-only catalogue of the shared primitives (route `/_gallery`, lazy-loaded in main.tsx behind import.meta.env.DEV).
 * Two schemes side by side; every example sits in its own cell, so each cell is its own primary scope.
 */
const noop = () => {}
const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'accent-secondary', 'tertiary', 'danger', 'danger-tertiary']
const STATUSES: ChipStatus[] = ['leftover', 'spoil', 'danger', 'success', 'pinned']

function Cell({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="gallery__cell" {...{ [PRIMARY_SCOPE_ATTR]: '' }}>
      {children}
      <p className="gallery__caption">{caption}</p>
    </div>
  )
}

function Group({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section className="gallery__group">
      <h3>{name}</h3>
      <div className="gallery__cells">{children}</div>
    </section>
  )
}

function ButtonGroup() {
  return (
    <Group name="Button">
      {VARIANTS.map((v) => (
        <Cell key={v} caption={v}>
          <Button variant={v}>Cook</Button>
        </Cell>
      ))}
      {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
        <Cell key={size} caption={size}>
          <Button size={size} icon="add">
            Add
          </Button>
        </Cell>
      ))}
      <Cell caption="disabled">
        <Button disabled>Cook</Button>
      </Cell>
      <Cell caption="loading">
        <Button loading>Saving</Button>
      </Cell>
    </Group>
  )
}

function IconButtonGroup() {
  return (
    <Group name="IconButton">
      <Cell caption="md">
        <IconButton icon="add" label="Add" />
      </Cell>
      <Cell caption="compact">
        <IconButton icon="delete" label="Delete" size="compact" />
      </Cell>
      <Cell caption="pressed">
        <IconButton icon="pin" label="Pinned" pressed />
      </Cell>
      <Cell caption="disabled">
        <IconButton icon="edit" label="Edit" disabled />
      </Cell>
    </Group>
  )
}

function ChipGroup() {
  return (
    <Group name="Chip">
      <Cell caption="why">
        <Chip kind="why" icon="ingredientOverlap">uses Monday's chicken</Chip>
      </Cell>
      {STATUSES.map((s) => (
        <Cell key={`state-${s}`} caption={`state ${s}`}>
          <Chip kind="state" status={s}>{s}</Chip>
        </Cell>
      ))}
      {STATUSES.map((s) => (
        <Cell key={`status-${s}`} caption={`status ${s}`}>
          <Chip kind="status" status={s} icon="leftover">Leftover from Mon</Chip>
        </Cell>
      ))}
      <Cell caption="tag">
        <Chip kind="tag" icon="tag">pasta</Chip>
      </Cell>
      <Cell caption="filter off">
        <Chip kind="filter" selected={false} onClick={noop}>Use soon</Chip>
      </Cell>
      <Cell caption="filter on">
        <Chip kind="filter" selected onClick={noop}>Use soon</Chip>
      </Cell>
      <Cell caption="count">
        <Chip kind="count">+2</Chip>
      </Cell>
    </Group>
  )
}

function WhyGroup() {
  return (
    <Group name="WhyChip">
      <Cell caption="overlap">
        <WhyChip reason="uses Monday's chicken" cause="overlap" />
      </Cell>
      <Cell caption="favourite">
        <WhyChip reason="Anna's favourite" cause="favourite" onClick={noop} />
      </Cell>
    </Group>
  )
}

function TileGroup() {
  return (
    <Group name="Tile">
      {(['surface', 'hero', 'soft', 'action'] as const).map((v) => (
        <Cell key={v} caption={v}>
          <Tile variant={v}>
            <h4>Tonight: lasagne</h4>
            <p>Serves 4</p>
          </Tile>
        </Cell>
      ))}
      {STATUSES.map((s) => (
        <Cell key={s} caption={`status ${s}`}>
          <Tile variant="status" status={s} overline="Use soon" overlineIcon="useSoon">
            <p>Chicken thighs</p>
          </Tile>
        </Cell>
      ))}
      <Cell caption="media">
        <Tile variant="media" media={<RecipeThumb name="Lasagne" size="hero" tags={['pasta']} />}>
          <h4>Lasagne</h4>
        </Tile>
      </Cell>
      <Cell caption="stretched">
        <Tile stretched={{ label: 'Open Lasagne', onActivate: noop }}>
          <h4>Lasagne</h4>
          <Button size="sm" variant="tertiary" onClick={noop}>Keep it</Button>
        </Tile>
      </Cell>
      <Cell caption="metric">
        <Tile>
          <TileMetric value="14" label="left to get" />
        </Tile>
      </Cell>
    </Group>
  )
}

function BentoGroup() {
  return (
    <Group name="BentoGrid">
      <div className="gallery__grid">
        <BentoGrid columns={2} label="Example grid">
          <Tile span={1}>One column</Tile>
          <Tile span={1}>Also one column</Tile>
          <Tile span="full">Full row</Tile>
        </BentoGrid>
      </div>
    </Group>
  )
}

function PageHeaderGroup() {
  return (
    <Group name="PageHeader">
      <Cell caption="with actions">
        <PageHeader
          title="Plan"
          subtitle="Week of 9 November"
          leading={<IconButton icon="back" label="Back" />}
          actions={<IconButton icon="regenerate" label="Re-plan" />}
        />
      </Cell>
    </Group>
  )
}

function ListGroupExample() {
  return (
    <Group name="ListRow">
      <Cell caption="list">
        <ListGroup label="Shopping List">
          <ListRow title="Milk" trailing={<span>2 L</span>} />
          <ListRow title="Eggs" meta="Goes off Thu" icon="stock" onActivate={noop} chevron />
          <ListRow title="Lasagne" meta="2 portions" leading={<RecipeThumb name="Lasagne" />} href="/recipes/1" selected />
        </ListGroup>
      </Cell>
    </Group>
  )
}

function RecipeThumbGroup() {
  return (
    <Group name="RecipeThumb">
      {([40, 48, 72, 'hero'] as const).map((size) => (
        <Cell key={size} caption={`generated ${size}`}>
          <RecipeThumb name="Chickpea curry" tags={['vegetarian']} size={size} />
        </Cell>
      ))}
    </Group>
  )
}

function ProgressGroup() {
  return (
    <Group name="ProgressTile">
      <Cell caption="progress">
        <ProgressTile label="Shopping List" value={3} max={8} />
      </Cell>
    </Group>
  )
}

function TimerGroup() {
  return (
    <Group name="TimerTile">
      <Cell caption="running">
        <TimerTile label="Simmer sauce" seconds={605} running totalSeconds={900} onToggle={noop} onAddMinute={noop} onDismiss={noop} />
      </Cell>
      <Cell caption="paused">
        <TimerTile label="Rice" seconds={90} onToggle={noop} />
      </Cell>
      <Cell caption="finished">
        <TimerTile label="Pasta" seconds={0} running />
      </Cell>
      <Cell caption="overdue">
        <TimerTile label="Roast" seconds={-5} running onDismiss={noop} />
      </Cell>
    </Group>
  )
}

function EmptyStateGroup() {
  return (
    <Group name="EmptyState">
      <Cell caption="plan">
        <EmptyState
          icon="planEmpty"
          title="The week is wide open"
          description="Add Meal Slots and a few Recipes, and Feeder fills it in."
          action={<Button variant="secondary" size="sm" onClick={noop}>Open Settings</Button>}
        />
      </Cell>
    </Group>
  )
}

const FIELD_SIZES: FieldSize[] = ['xs', 'sm', 'md', 'lg', 'full']
const FRUITS = [
  { value: 'apple', label: 'Apple' },
  { value: 'pear', label: 'Pear' },
]

function WideCell({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="gallery__cell gallery__cell--wide" {...{ [PRIMARY_SCOPE_ATTR]: '' }}>
      {children}
      <p className="gallery__caption">{caption}</p>
    </div>
  )
}

function FieldSizesGroup() {
  return (
    <Group name="Field sizes">
      {FIELD_SIZES.map((size) => (
        <WideCell key={size} caption={`TextField size ${size}`}>
          <TextField label={`Name (${size})`} value="Tomato soup" onChange={noop} size={size} />
        </WideCell>
      ))}
      <WideCell caption="NumberField xs with stepper (136 px)">
        <NumberField label="Servings" value={4} onChange={noop} size="xs" />
      </WideCell>
      <WideCell caption="Stepper size sm">
        <Stepper label="portions" value={4} onChange={noop} size="sm" />
      </WideCell>
      <WideCell caption="Select (md)">
        <Select label="Fruit" options={FRUITS} value="apple" onChange={noop} />
      </WideCell>
      <WideCell caption="DateField (md)">
        <DateField label="Day" value="2026-11-10" onChange={noop} />
      </WideCell>
      <WideCell caption="TimeField (sm)">
        <TimeField label="From" value="19:30" onChange={noop} />
      </WideCell>
      <WideCell caption="TimeField disabled (muted, not dimmed)">
        <TimeField label="Until" value="21:00" onChange={noop} disabled />
      </WideCell>
      <WideCell caption="Segmented disabled (outlined track, selected option ringed)">
        <Segmented label="Theme" options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} value="dark" onChange={noop} disabled />
      </WideCell>
      <WideCell caption="SearchField (full)">
        <SearchField label="Search" value="" onChange={noop} />
      </WideCell>
      <WideCell caption="Focus ring, shown statically">
        <div data-gallery-focus="">
          <TextField label="Focused" value="Ring" onChange={noop} />
        </div>
      </WideCell>
      <WideCell caption="Button block always">
        <Button block="always">Save</Button>
      </WideCell>
    </Group>
  )
}

function FieldRowGroup() {
  return (
    <Group name="FieldRow">
      <WideCell caption="Three xs NumberFields wrap on a phone">
        <FieldRow>
          <NumberField label="Yield" value={4} onChange={noop} size="xs" />
          <NumberField label="Cool-down" value={30} onChange={noop} size="xs" unit="days" />
          <NumberField label="Leftover Use-by" value={3} onChange={noop} size="xs" unit="days" />
        </FieldRow>
      </WideCell>
    </Group>
  )
}

function FormActionsGroup() {
  return (
    <Group name="FormActions">
      <WideCell caption="Destructive, tertiary, secondary, primary">
        <FormActions
          destructive={<Button variant="danger-tertiary">Delete</Button>}
          tertiary={<Button variant="tertiary">Cancel</Button>}
          secondary={<Button variant="secondary">Save and add</Button>}
          primary={<Button>Save</Button>}
        />
      </WideCell>
    </Group>
  )
}

function PageGroup() {
  return (
    <Group name="Page">
      {(['narrow', 'default', 'wide'] as const).map((w) => (
        <WideCell key={w} caption={`width="${w}": content ${w === 'narrow' ? 720 : w === 'default' ? 1120 : 1480} px plus the gutters, centred`}>
          <div className="gallery__frame">
            <Page width={w} header={<PageHeader title={`Page ${w}`} />}>
              <Tile>
                <p>Content column</p>
              </Tile>
            </Page>
          </div>
        </WideCell>
      ))}
    </Group>
  )
}

function StickyActionBarGroup() {
  return (
    <Group name="StickyActionBar">
      <WideCell caption="Opaque, as wide as the Page, hairline on top; scroll the frame to see it stick">
        <div className="gallery__frame gallery__frame--scroll">
          <Page width="default">
            <Tile>
              <p>A long form goes here.</p>
              <div className="gallery__spacer" />
            </Tile>
            <StickyActionBar>
              <FormActions tertiary={<Button variant="tertiary">Cancel</Button>} primary={<Button>Save</Button>} />
            </StickyActionBar>
          </Page>
        </div>
      </WideCell>
      <WideCell caption='column="narrow": the actions sit under the narrow form column'>
        <div className="gallery__frame">
          <Page width="default">
            <StickyActionBar column="narrow">
              <FormActions tertiary={<Button variant="tertiary">Cancel</Button>} primary={<Button>Save</Button>} />
            </StickyActionBar>
          </Page>
        </div>
      </WideCell>
    </Group>
  )
}

function WeekdayPickerGroup() {
  return (
    <Group name="WeekdayPicker">
      <WideCell caption="Selected days (Mon, Wed, Fri) with a helper">
        <WeekdayPicker label="Apply to" value={[1, 3, 5]} onChange={noop} helper="The same change is made on each chosen day." />
      </WideCell>
      <WideCell caption="Error, and a week that starts on Sunday">
        <WeekdayPicker label="Days" value={[]} onChange={noop} error="Choose at least one weekday." weekStart={7} />
      </WideCell>
      <WideCell caption="Disabled">
        <WeekdayPicker label="Locked" value={[2]} onChange={noop} disabled />
      </WideCell>
    </Group>
  )
}

/** A Member colour is user data ("#rrggbb"), not a theme colour; built here so the file holds no colour literal. */
const memberColour = (r: number, g: number, b: number) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`

function MemberPillGroup() {
  return (
    <Group name="MemberPill">
      <Cell caption="Initials">
        <MemberPill name="Anna" colour={memberColour(51, 102, 204)} />
      </Cell>
      <Cell caption="Emoji">
        <MemberPill name="Sam" colour={memberColour(129, 178, 154)} glyph="🦊" />
      </Cell>
      <Cell caption="First name only">
        <MemberPill name="Lucia Maria Bernadette" colour={memberColour(224, 122, 95)} />
      </Cell>
    </Group>
  )
}

function Scheme({ scheme }: { scheme: 'light' | 'dark' }) {
  return (
    <section data-scheme={scheme} className="gallery__scheme">
      <h2>{scheme === 'light' ? 'Light' : 'Dark'}</h2>
      <ButtonGroup />
      <IconButtonGroup />
      <ChipGroup />
      <WhyGroup />
      <TileGroup />
      <BentoGroup />
      <PageHeaderGroup />
      <ListGroupExample />
      <RecipeThumbGroup />
      <ProgressGroup />
      <TimerGroup />
      <EmptyStateGroup />
      <FieldSizesGroup />
      <FieldRowGroup />
      <FormActionsGroup />
      <PageGroup />
      <StickyActionBarGroup />
      <WeekdayPickerGroup />
      <MemberPillGroup />
      <OverlayGalleryGroups />
    </section>
  )
}

export function Gallery() {
  return (
    <main className="gallery">
      <Scheme scheme="light" />
      <Scheme scheme="dark" />
    </main>
  )
}
