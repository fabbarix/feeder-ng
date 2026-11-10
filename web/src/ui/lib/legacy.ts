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
export function resolveButtonVariant(variant: ButtonVariant | LegacyButtonVariant | undefined): ButtonVariant {
  if (variant === 'tonal') return 'secondary'
  if (variant === 'ghost') return 'tertiary'
  return variant ?? 'primary'
}

/**
 * `kind` wins. Otherwise a clickable chip is a `filter`; else tone neutral -> tag, accent -> why,
 * spoil / leftover -> status with that status.
 */
export function resolveChip(input: { kind?: ChipKind; status?: ChipStatus; tone?: LegacyChipTone; clickable: boolean }): {
  kind: ChipKind
  status?: ChipStatus
} {
  if (input.kind) return input.status ? { kind: input.kind, status: input.status } : { kind: input.kind }
  if (input.clickable) return { kind: 'filter' }
  switch (input.tone) {
    case 'accent':
      return { kind: 'why' }
    case 'spoil':
    case 'leftover':
      return { kind: 'status', status: input.tone }
    default:
      return { kind: 'tag' }
  }
}

/**
 * `variant` / `status` / `span` win. Otherwise tone neutral -> surface, accent -> soft, spoil / leftover -> status
 * with that status; size wide / full -> span 'full', anything else -> 1.
 */
export function resolveTile(input: {
  variant?: TileVariant
  status?: ChipStatus
  span?: TileSpan
  tone?: LegacyTileTone
  size?: LegacyTileSize
}): { variant: TileVariant; status?: ChipStatus; span: TileSpan } {
  const span: TileSpan = input.span ?? (input.size === 'wide' || input.size === 'full' ? 'full' : 1)
  if (input.variant) {
    return input.variant === 'status' && input.status
      ? { variant: 'status', status: input.status, span }
      : { variant: input.variant, span }
  }
  switch (input.tone) {
    case 'accent':
      return { variant: 'soft', span }
    case 'spoil':
    case 'leftover':
      return { variant: 'status', status: input.tone, span }
    default:
      return { variant: 'surface', span }
  }
}
