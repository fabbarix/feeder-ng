// Mapping of the deprecated primitive props onto the new ones (docs/dev/design/wp3-primitives-a.md, "Compatibility").
// Pure; removed together with the deprecated props once WP6 to WP11 have migrated their call sites.
import type { ButtonVariant } from '../Button'
import type { ChipKind, ChipStatus } from '../Chip'
import type { TileSpan, TileVariant } from '../Tile'

export type LegacyButtonVariant = 'tonal' | 'ghost'
export type LegacyChipTone = 'neutral' | 'accent' | 'spoil' | 'leftover'
export type LegacyTileSize = 'sm' | 'md' | 'lg' | 'wide' | 'full'
export type LegacyTileTone = 'neutral' | 'accent' | 'spoil' | 'leftover'

/** tonal -> secondary, ghost -> tertiary; new variants pass through. */
export function resolveButtonVariant(_variant: ButtonVariant | LegacyButtonVariant | undefined): ButtonVariant {
  throw new Error('not implemented')
}

/**
 * `kind` wins. Otherwise a clickable chip is a `filter`; else tone neutral -> tag, accent -> why,
 * spoil / leftover -> status with that status.
 */
export function resolveChip(_input: { kind?: ChipKind; status?: ChipStatus; tone?: LegacyChipTone; clickable: boolean }): {
  kind: ChipKind
  status?: ChipStatus
} {
  throw new Error('not implemented')
}

/**
 * `variant` / `status` / `span` win. Otherwise tone neutral -> surface, accent -> soft, spoil / leftover -> status
 * with that status; size wide / full -> span 'full', anything else -> 1.
 */
export function resolveTile(_input: {
  variant?: TileVariant
  status?: ChipStatus
  span?: TileSpan
  tone?: LegacyTileTone
  size?: LegacyTileSize
}): { variant: TileVariant; status?: ChipStatus; span: TileSpan } {
  throw new Error('not implemented')
}
