import { useState, type ReactNode } from 'react'
import { BentoGrid } from './BentoGrid'
import { Button, PRIMARY_SCOPE_ATTR, type ButtonVariant } from './Button'
import { Chip } from './Chip'
import { CloseButton } from './CloseButton'
import { DetailList, DetailRow, type DetailTone } from './DetailList'
import { EmptyState } from './EmptyState'
import { IconButton } from './IconButton'
import { ListGroup, ListRow } from './ListRow'
import { ListPage } from './ListPage'
import { FormActions } from './FormActions'
import { DateField } from './fields/DateField'
import { FieldRow } from './fields/FieldRow'
import { NumberField } from './fields/NumberField'
import { SearchField } from './fields/SearchField'
import { Segmented } from './fields/Segmented'
import { TextField } from './fields/TextField'
import { TimeField } from './fields/TimeField'
import { Select } from './Select/Select'
import { CourseMultiSelect, CourseSelect } from './Select/CourseSelect'
import { TagSelect, type TagChoice } from './Select/TagSelect'
import { TagDot } from './TagColour/TagDot'
import { TagColourPicker, type TagColourPickerProps } from './TagColour/TagColourPicker'
import { TAG_PALETTE } from '../lib/tags/palette'
import { CoursePicker, type CoursePickerProps } from './CoursePicker/CoursePicker'
import type { CourseChoice } from '../lib/courses'
import { Stepper } from './Stepper'
import type { FieldSize } from './fields/Field'
import { Muted } from './Muted'
import { Overline } from './Overline'
import { Page } from './Page'
import { PageHeader } from './PageHeader'
import { StickyActionBar } from './StickyActionBar'
import { Menu } from './Menu'
import { MemberPill } from './MemberPill/MemberPill'
import { WeekdayPicker } from './WeekdayPicker/WeekdayPicker'
import { ProgressTile } from './ProgressTile'
import { RecipeThumb } from './RecipeThumb'
import { SectionTitle } from './SectionTitle'
import { Cluster, Stack } from './Stack'
import { TileHeader } from './TileHeader'
import { Tile, TileMetric, type TileStatus } from './Tile'
import { TimerTile } from './TimerTile'
import { TimerPill } from './TimerPill'
import { ViewfinderStrip } from './ViewfinderStrip'
import { WhyChip } from './WhyChip'
import { OverlayGalleryGroups } from './GalleryOverlays'
import { RowsGalleryGroup } from './GalleryRows'
import './focusLayer.css'
import './Gallery.css'

/**
 * Dev-only catalogue of the shared primitives (route `/_gallery`, lazy-loaded in main.tsx behind import.meta.env.DEV).
 * Two schemes side by side; every example sits in its own cell, so each cell is its own primary scope.
 */
const noop = () => {}
const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'danger', 'danger-secondary']
const STATUSES: TileStatus[] = ['leftover', 'spoil', 'danger', 'success', 'pinned']

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
      <Cell caption="link (running text only)">
        <p>
          See the <Button variant="link">Planning rules</Button> for why.
        </p>
      </Cell>
      <Cell caption='iconOnly="narrow" (label hidden at 375 px and below)'>
        <Button variant="secondary" icon="filter" iconOnly="narrow">
          Filters
        </Button>
      </Cell>
      {(['soft', 'hero'] as const).map((variant) => (
        <Cell key={`on-${variant}`} caption={`secondary on a ${variant} tile`}>
          <Tile variant={variant}>
            <Button variant="secondary" size="sm">
              Dismiss
            </Button>
          </Tile>
        </Cell>
      ))}
      <Cell caption="secondary on a spoil tile">
        <Tile variant="status" status="spoil">
          <Button variant="secondary" size="sm">
            Correct Stock
          </Button>
        </Tile>
      </Cell>
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
      <Cell caption='shape="circle"'>
        <IconButton icon="add" label="Add" shape="circle" />
      </Cell>
      <Cell caption="on a soft tile">
        <Tile variant="soft">
          <IconButton icon="more" label="More" />
        </Tile>
      </Cell>
      <Cell caption="on a leftover tile">
        <Tile variant="status" status="leftover">
          <IconButton icon="more" label="More" />
        </Tile>
      </Cell>
    </Group>
  )
}

function CloseButtonGroup() {
  return (
    <Group name="CloseButton">
      <Cell caption="40 px circle, 52 px target">
        <CloseButton />
      </Cell>
    </Group>
  )
}

// The warn tone (and its tile tint) arrives with B9-02's tokens.
const DETAIL_TONES = ['spoil', 'info', 'danger', 'leftover', 'neutral'] as const satisfies readonly DetailTone[]

// B9-02 (DS-07, DS-08): the type and layout primitives.
function TypeLayoutGroup() {
  return (
    <Group name="SectionTitle, TileHeader, Muted, Overline, Stack, Cluster">
      <Cell caption="Tile with TileHeader, Stack and Cluster">
        <Tile>
          <Stack>
            <TileHeader icon="leftover" title="Leftovers" count={2} />
            <Overline>This week</Overline>
            <SectionTitle as="h3">Chicken curry</SectionTitle>
            <Muted>2 Portions, use by Thursday</Muted>
            <Cluster>
              <Button variant="secondary">Plan</Button>
              <Button variant="secondary">Threw it out</Button>
            </Cluster>
          </Stack>
        </Tile>
      </Cell>
    </Group>
  )
}

function DetailListGroup() {
  return (
    <Group name="DetailList">
      {DETAIL_TONES.map((tone) => (
        <Cell key={tone} caption={`tone ${tone}`}>
          {tone === 'neutral' ? (
            <DetailList tone={tone} fill="surface">
              <DetailRow label="Preferences" state="3" detail="Favourites, Dislikes and Exclusions" />
              <DetailRow label="Sign-in" state="Ends" />
            </DetailList>
          ) : (
            <Tile variant="status" status={tone}>
              <DetailList tone={tone}>
                <DetailRow label="Chestnut mushrooms" state="200 g short" detail="The Recipe used 300 g · Stock showed 100 g" />
                <DetailRow label="Gorgonzola" state="none in Stock" detail="The Recipe used 250 g" />
              </DetailList>
            </Tile>
          )}
        </Cell>
      ))}
    </Group>
  )
}

function ChipGroup() {
  return (
    <Group name="Chip">
      <Cell caption="why">
        <Chip kind="why" icon="ingredientOverlap">
          uses Monday's chicken
        </Chip>
      </Cell>
      {STATUSES.map((s) => (
        <Cell key={`state-${s}`} caption={`state ${s}`}>
          <Chip kind="state" status={s}>
            {s}
          </Chip>
        </Cell>
      ))}
      {STATUSES.map((s) => (
        <Cell key={`status-${s}`} caption={`status ${s}`}>
          <Chip kind="status" status={s} icon="leftover">
            Leftover from Mon
          </Chip>
        </Cell>
      ))}
      <Cell caption="tag">
        <Chip kind="tag" icon="tag">
          pasta
        </Chip>
      </Cell>
      <Cell caption="filter off">
        <Chip kind="filter" selected={false} onClick={noop}>
          Use soon
        </Chip>
      </Cell>
      <Cell caption="filter on">
        <Chip kind="filter" selected onClick={noop}>
          Use soon
        </Chip>
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
          <Button size="sm" variant="secondary" onClick={noop}>
            Keep it
          </Button>
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
        <BentoGrid min="card" label="Example grid">
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

function ListPageGroup() {
  return (
    <Group name="ListPage">
      <WideCell caption="header, search, filter chip, list">
        <ListPage
          header={<PageHeader title="Ingredients" actions={<Button size="sm" icon="add">New Ingredient</Button>} />}
          search={<SearchField label="Search Ingredients" value="" onChange={noop} />}
          filters={<Chip kind="filter" selected={false} onClick={noop}>Archived</Chip>}
        >
          <ListGroup label="Ingredients">
            <ListRow title="Flour" meta="2 kg" icon="stock" onActivate={noop} chevron />
            <ListRow title="Eggs" meta="6 pieces" icon="stock" onActivate={noop} chevron />
          </ListGroup>
        </ListPage>
      </WideCell>
    </Group>
  )
}

/** Beta.5: a stateful expandable row, the controlled pattern a screen uses (the row keeps no state of its own). */
function ExpandableRowDemo({ title, initial }: { title: string; initial: boolean }) {
  const [expanded, setExpanded] = useState(initial)
  return <ListRow title={title} meta="2 kg" expanded={expanded} onToggle={() => setExpanded((v) => !v)} panel={<p>Opened 1 Jun</p>} chevron />
}

function ListGroupExample() {
  return (
    <Group name="ListRow">
      <Cell caption="list">
        <ListGroup label="Shopping List">
          <ListRow title="Milk" trailing={<span>2 L</span>} />
          <ListRow title="Eggs" meta="Good until Thu" icon="stock" onActivate={noop} chevron />
          <ListRow title="Lasagne" meta="2 portions" leading={<RecipeThumb name="Lasagne" />} href="/recipes/1" selected />
        </ListGroup>
      </Cell>
      <Cell caption="beta.5 glyphs">
        <ListGroup label="Leftovers, Shopping List and Guests">
          <ListRow title="Snowflake" icon="snowflake" onActivate={noop} chevron />
          <ListRow title="Question" icon="question" onActivate={noop} chevron />
          <ListRow title="Shopping cart" icon="shoppingCart" onActivate={noop} chevron />
          <ListRow title="Guests" icon="guests" onActivate={noop} chevron />
        </ListGroup>
      </Cell>
      <Cell caption="expandable">
        <ListGroup label="Expandable rows">
          <ExpandableRowDemo title="Flour" initial={false} />
          <ListRow title="Rice" meta="1 kg" expanded onToggle={noop} panel={<p>Opened 3 Jun</p>} chevron />
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

// ---- B9-17: tones, chips and timers (DS-06, DS-04, PC-03, PC-04, SSP-06, TB-05). One block; nothing else in this file is B9-17's.
const LONG_TAG = 'HEARTY HOMEMADE MUSHROOM WELLINGTONS'

function TonesChipsTimersGroup() {
  return (
    <Group name="Tones, chips and timers">
      <Cell caption="tile warn (a decision)">
        <Tile variant="status" status="warn" overline="Couldn't plan" overlineIcon="warning">
          <p>Every Recipe is excluded for someone who eats it</p>
        </Tile>
      </Cell>
      <Cell caption="tile info (Advance Steps)">
        <Tile variant="status" status="info" overline="Advance Steps" overlineIcon="advanceStep">
          <Chip kind="status" status="info" overdue icon="advanceStep">
            Overdue
          </Chip>
          <p>Marinate the chicken</p>
        </Tile>
      </Cell>
      <Cell caption="chips warn, info, neutral, overdue">
        <Cluster>
          <Chip kind="status" status="warn">Held: outside cooking times</Chip>
          <Chip kind="status" status="info">Start Tue 21:30</Chip>
          <Chip kind="state" status="warn">Rule conflict</Chip>
          <Chip kind="state" status="neutral" icon="notCooked">
            Not cooked
          </Chip>
          <Chip kind="status" status="info" overdue icon="advanceStep">
            Overdue
          </Chip>
        </Cluster>
      </Cell>
      <Cell caption="count chips (round)">
        <Cluster>
          <Chip kind="count">3</Chip>
          <Chip kind="count">+2</Chip>
          <Chip kind="count">12</Chip>
          <Chip kind="count">128</Chip>
        </Cluster>
      </Cell>
      <Cell caption="long Tag ends in an ellipsis; whole is never cut">
        <div className="gallery__stack" style={{ inlineSize: "15rem" }}>
          <Chip kind="tag" onRemove={noop} removeLabel={`Remove Tag ${LONG_TAG}`}>
            {LONG_TAG}
          </Chip>
          <Cluster>
            <Chip kind="status" status="leftover" outline whole>
              Leftover for Fri
            </Chip>
            <Chip kind="tag">{LONG_TAG}</Chip>
          </Cluster>
        </div>
      </Cell>
      <Cell caption="chip buttons and the selected filter">
        <Cluster>
          <Chip as="button" kind="why" icon="leftover" onClick={noop}>
            Uses Beef by Tue
          </Chip>
          <Chip kind="filter" selected onClick={noop}>
            Fish
          </Chip>
          <Chip kind="filter" selected tagColour="apricot" onClick={noop}>
            Spicy
          </Chip>
          <Chip kind="filter" tagColour="apricot" onClick={noop}>
            Mild
          </Chip>
          <Chip kind="filter" onClick={noop}>
            Meat
          </Chip>
        </Cluster>
      </Cell>
      <Cell caption="TimerTile md (running, place)">
        <div className="gallery__stack">
          <TimerTile
            size="md"
            label="Pre-heat the oven to 220 °C and put the tray in"
            place="Step 1 · Roast chicken with rice"
            seconds={163}
            running
            onToggle={noop}
            onMore={noop}
          />
        </div>
      </Cell>
      <Cell caption="TimerTile md (paused, overdue)">
        <div className="gallery__stack">
          <TimerTile size="md" label="Rice" place="Step 2" seconds={420} onToggle={noop} onMore={noop} />
          <TimerTile size="md" label="Rest the meat" seconds={-42} running onDismiss={noop} />
        </div>
      </Cell>
      <Cell caption="TimerTile compact">
        <TimerTile density="compact" label="Pasta" seconds={300} totalSeconds={600} running />
      </Cell>
      <Cell caption="TimerPill running, paused, finished, gate">
        <div className="gallery__stack">
          <TimerPill label="Roast the chicken" seconds={18 * 60 + 42} more={1} onOpen={noop} />
          <TimerPill label="Rice" seconds={420} running={false} onOpen={noop} onToggle={noop} />
          <TimerPill label="Roast the chicken" seconds={0} more={2} onOpen={noop} />
          <TimerPill label="Simmer the sauce until it thickens" seconds={95} gate onOpen={noop} onToggle={noop} />
        </div>
      </Cell>
      <Cell caption="camera bar">
        <div className="gallery__stack">
          <ViewfinderStrip
            size="bar"
            status="No camera on this device"
            action={
              <Button size="sm" variant="secondary" onClick={noop}>
                Try again
              </Button>
            }
          />
        </div>
      </Cell>
      <Cell caption="tiles spoil, danger, warn, info (one row)">
        <Cluster>
          <Chip kind="status" status="spoil">Use soon</Chip>
          <Chip kind="status" status="danger">Went off</Chip>
          <Chip kind="status" status="warn">Rule conflict</Chip>
          <Chip kind="status" status="info">To confirm</Chip>
        </Cluster>
      </Cell>
      <Cell caption="MemberPill chosen and not chosen">
        <Cluster>
          <MemberPill name="Anna" colour={memberColour(51, 102, 204)} selected />
          <MemberPill name="Sam" colour={memberColour(129, 178, 154)} selected={false} />
        </Cluster>
      </Cell>
      <Cell caption="hero and its why chips (this panel's scheme)">
        <div className="gallery__stack">
          <Tile variant="hero" overline="Tonight">
            <h4>Lasagne</h4>
            <Cluster>
              <Chip as="button" kind="why" icon="leftover" onClick={noop}>
                Uses Beef by Tue
              </Chip>
              <Chip kind="why" icon="favourite">
                Anna's favourite
              </Chip>
              <Chip kind="why" icon="why">
                Again soon: also on Sat
              </Chip>
            </Cluster>
            <Button variant="primary" onClick={noop}>
              Cook
            </Button>
          </Tile>
        </div>
      </Cell>
    </Group>
  )
}
// ---- end B9-17

function EmptyStateGroup() {
  return (
    <Group name="EmptyState">
      <Cell caption="plan">
        <EmptyState
          icon="planEmpty"
          title="The week is wide open"
          description="Add Meal Slots and a few Recipes, and Feeder fills it in."
          action={
            <Button variant="secondary" size="sm" onClick={noop}>
              Open Settings
            </Button>
          }
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
        <Segmented
          label="Theme"
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          value="dark"
          onChange={noop}
          disabled
        />
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
      <WideCell caption="Destructive, Cancel, secondary, primary">
        <FormActions
          destructive={<Button variant="danger-secondary">Delete</Button>}
          tertiary={<Button variant="secondary">Cancel</Button>}
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
        <WideCell
          key={w}
          caption={`width="${w}": content ${w === 'narrow' ? 720 : w === 'default' ? 1120 : 1480} px plus the gutters, centred`}
        >
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
              <FormActions tertiary={<Button variant="secondary">Cancel</Button>} primary={<Button>Save</Button>} />
            </StickyActionBar>
          </Page>
        </div>
      </WideCell>
      <WideCell caption='column="narrow": the actions sit under the narrow form column'>
        <div className="gallery__frame">
          <Page width="default">
            <StickyActionBar column="narrow">
              <FormActions tertiary={<Button variant="secondary">Cancel</Button>} primary={<Button>Save</Button>} />
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

function MenuGroup() {
  return (
    <Group name="Menu">
      <Cell caption="Popover from 768 px, sheet below">
        <Menu
          label="More actions"
          title="More"
          items={[
            { id: 'archive', label: 'Archive', icon: 'archive' },
            { separator: true },
            { id: 'delete', label: 'Delete', icon: 'delete', tone: 'danger' },
          ]}
        />
      </Cell>
    </Group>
  )
}

const COURSES: CourseChoice[] = [
  { id: 1, name: 'Main', main: true },
  { id: 2, name: 'Side', main: false },
  { id: 3, name: 'Starter', main: false },
  { id: 4, name: 'Dessert', main: false },
]

/** A picker that keeps its own value, so the samples can be clicked. */
function ControlledCoursePicker({ initial, ...rest }: Omit<CoursePickerProps, 'value' | 'onChange'> & { initial: number[] }) {
  const [value, setValue] = useState(initial)
  return <CoursePicker {...rest} value={value} onChange={setValue} />
}

function CoursePickerGroup() {
  return (
    <Group name="CoursePicker">
      <WideCell caption="Ordered: chosen Courses in the slot's order, with a row extra and a helper">
        <ControlledCoursePicker
          label="Courses"
          courses={COURSES}
          initial={[2, 1]}
          helper="Drag to set the order."
          renderRowExtras={() => (
            <span data-testid="course-row-extra-sample">
              <Chip kind="tag">Optional</Chip>
            </span>
          )}
        />
      </WideCell>
      <WideCell caption="Unordered (a Recipe's Courses): household order">
        <ControlledCoursePicker label="Courses" courses={COURSES} initial={[4, 1]} ordered={false} />
      </WideCell>
      <WideCell caption="Empty choice: the error">
        <ControlledCoursePicker label="Courses" courses={COURSES} initial={[]} />
      </WideCell>
      <WideCell caption="Disabled">
        <ControlledCoursePicker label="Courses" courses={COURSES} initial={[1, 2]} disabled />
      </WideCell>
    </Group>
  )
}

function CourseSelectGroup() {
  return (
    <Group name="CourseSelect">
      <WideCell caption="CourseSelect (one Course, main marked)">
        <CourseSelect label="Replacement Course" courses={COURSES} value={1} onChange={noop} />
      </WideCell>
      <WideCell caption="CourseMultiSelect (filter)">
        <CourseMultiSelect label="Courses" courses={COURSES} values={[2, 4]} onChange={noop} />
      </WideCell>
    </Group>
  )
}

/** The id of a Tag colour by its display name (the samples name colours by what people see). */
const paletteId = (name: string): string => TAG_PALETTE.find((c) => c.name === name)?.id ?? ''

/** Tag colours (TG-UI, spec 4.1): every colour as a tag chip and a dot, the filter chip off and on, and the picker and select. */
function TagChipsGroup() {
  return (
    <Group name="Tag chips">
      {TAG_PALETTE.map((c) => (
        <Cell key={c.id} caption={`tag ${c.name}`}>
          <Chip kind="tag" tagColour={c.id}>
            {c.name}
          </Chip>
        </Cell>
      ))}
      <Cell caption="filter off, plum">
        <Chip kind="filter" tagColour={paletteId('Plum')} selected={false} onClick={noop}>
          Pasta
        </Chip>
      </Cell>
      <Cell caption="filter on, plum">
        <Chip kind="filter" tagColour={paletteId('Plum')} selected onClick={noop}>
          Pasta
        </Chip>
      </Cell>
      <Cell caption="unknown colour: neutral">
        <Chip kind="tag" tagColour="chartreuse">
          New
        </Chip>
      </Cell>
    </Group>
  )
}

function TagDotGroup() {
  return (
    <Group name="TagDot">
      {TAG_PALETTE.map((c) => (
        <Cell key={c.id} caption={c.name}>
          <TagDot colour={c.id} />
        </Cell>
      ))}
      <Cell caption="neutral">
        <TagDot />
      </Cell>
    </Group>
  )
}

/** A picker that keeps its own value; with `preview` it shows a pill in the chosen colour. */
function ControlledTagColourPicker({ initial, preview, ...rest }: Omit<TagColourPickerProps, 'value' | 'onChange' | 'preview'> & { initial: string; preview?: boolean }) {
  const [value, setValue] = useState(initial)
  return <TagColourPicker {...rest} value={value} onChange={setValue} preview={preview ? <Chip kind="tag" tagColour={value}>Fish</Chip> : undefined} />
}

function TagColourPickerGroup() {
  return (
    <Group name="TagColourPicker">
      <WideCell caption="Sage chosen, with a pill preview and a helper">
        <ControlledTagColourPicker label="Tag colour" initial="sage" helper="Colours repeat after ten Tags." preview />
      </WideCell>
      <WideCell caption="Error">
        <ControlledTagColourPicker label="Tag colour" initial="tomato" error="Choose a colour" />
      </WideCell>
      <WideCell caption="Disabled">
        <ControlledTagColourPicker label="Tag colour" initial="rose" disabled />
      </WideCell>
    </Group>
  )
}

const GALLERY_TAGS: TagChoice[] = [
  { id: 1, name: 'Fish', colour: paletteId('Teal'), recipes: 12 },
  { id: 2, name: 'Pasta', colour: paletteId('Apricot'), recipes: 1 },
  { id: 3, name: 'Roast', colour: paletteId('Olive'), recipes: 0 },
]

function TagSelectGroup() {
  return (
    <Group name="TagSelect">
      <WideCell caption="TagSelect (a dot and the Recipe count on each Tag)">
        <TagSelect label="Tag" tags={GALLERY_TAGS} value={1} onChange={noop} />
      </WideCell>
    </Group>
  )
}

function Scheme({ scheme }: { scheme: 'light' | 'dark' }) {
  return (
    <section data-scheme={scheme} className="gallery__scheme">
      <h2>{scheme === 'light' ? 'Light' : 'Dark'}</h2>
      <ButtonGroup />
      <IconButtonGroup />
      <CloseButtonGroup />
      <DetailListGroup />
      <TypeLayoutGroup />
      <ChipGroup />
      <WhyGroup />
      <TileGroup />
      <BentoGroup />
      <PageHeaderGroup />
      <ListPageGroup />
      <ListGroupExample />
      <RowsGalleryGroup />
      <RecipeThumbGroup />
      <ProgressGroup />
      <TimerGroup />
      <TonesChipsTimersGroup />
      <EmptyStateGroup />
      <FieldSizesGroup />
      <FieldRowGroup />
      <FormActionsGroup />
      <PageGroup />
      <StickyActionBarGroup />
      <WeekdayPickerGroup />
      <MemberPillGroup />
      <MenuGroup />
      <CoursePickerGroup />
      <CourseSelectGroup />
      <TagChipsGroup />
      <TagDotGroup />
      <TagColourPickerGroup />
      <TagSelectGroup />
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
