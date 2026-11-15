// B9-44 (RES-09): each Today tile has a title (for "<Tile> couldn’t be shown.") and the queries its Try again resets. New module lib/tiles.ts.
import { describe, expect, it } from 'vitest'
import type { TileId } from '../types'
import { tileQueryKeys, tileTitle } from './tiles'

describe('tileTitle', () => {
  it.each<[TileId, string]>([
    ['nextMeal', 'Next meal'], ['toConfirm', 'To confirm'], ['advanceSteps', 'Advance Steps'], ['metrics', 'At a glance'], ['couldntPlan', 'Couldn’t plan'],
    ['spoiled', 'Throw out or keep?'], ['leftovers', 'Leftovers'], ['useSoon', 'Use soon'], ['setup', 'Set up your Household'], ['shopping', 'Shopping'],
  ])('%s is "%s"', (id, title) => {
    expect(tileTitle(id)).toBe(title)
  })
})

describe('tileQueryKeys: what Try again resets for each tile', () => {
  it.each<[TileId, unknown[][]]>([
    ['nextMeal', [['plan', 'view']]],
    ['toConfirm', [['plan', 'to-confirm'], ['plan', 'view']]],
    ['advanceSteps', [['today', 'advance-steps']]],
    ['metrics', [['today', 'streak']]],
    ['couldntPlan', [['plan', 'couldnt-plan']]],
    ['spoiled', [['stock', 'spoiled']]],
    ['leftovers', [['plan', 'leftovers']]],
    ['useSoon', [['stock', 'totals'], ['stock', 'lots', 'all']]],
    ['setup', []],
    ['shopping', []],
  ])('%s', (id, keys) => {
    expect(tileQueryKeys(id)).toEqual(keys)
  })
})
