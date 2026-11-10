import type { ReactNode } from 'react'
import { BentoGrid } from './BentoGrid'
import { Button, PRIMARY_SCOPE_ATTR, type ButtonVariant } from './Button'
import { Chip, type ChipStatus } from './Chip'
import { EmptyState } from './EmptyState'
import { IconButton } from './IconButton'
import { ListGroup, ListRow } from './ListRow'
import { PageHeader } from './PageHeader'
import { ProgressTile } from './ProgressTile'
import { RecipeThumb } from './RecipeThumb'
import { Tile, TileMetric } from './Tile'
import { TimerTile } from './TimerTile'
import { WhyChip } from './WhyChip'
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
