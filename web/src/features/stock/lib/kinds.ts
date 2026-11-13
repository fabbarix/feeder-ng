// The kinds of Storage Place and the icon each shows (GLOSSARY: Storage Place, "of one kind: pantry, fridge or freezer"). Plain TS.
import type { IconName } from '../../../ui/icons'
import type { StorageKind } from '../types'

export const STORAGE_KINDS: readonly StorageKind[] = ['pantry', 'fridge', 'freezer']

export const KIND_ICON: Record<StorageKind, IconName> = { pantry: 'stock', fridge: 'fridge', freezer: 'freezer' }
