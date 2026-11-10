import { describe, expect, it } from 'vitest'
import { resolveButtonVariant, resolveChip, resolveTile } from './legacy'

describe('resolveButtonVariant', () => {
  it('maps the deprecated names', () => {
    expect(resolveButtonVariant('tonal')).toBe('secondary')
    expect(resolveButtonVariant('ghost')).toBe('tertiary')
  })
  it.each(['primary', 'secondary', 'accent-secondary', 'tertiary', 'danger', 'danger-tertiary'] as const)('passes %s through', (v) => {
    expect(resolveButtonVariant(v)).toBe(v)
  })
  it('defaults to primary', () => {
    expect(resolveButtonVariant(undefined)).toBe('primary')
  })
})

describe('resolveChip', () => {
  it('kind and status win over tone', () => {
    expect(resolveChip({ kind: 'state', status: 'pinned', tone: 'spoil', clickable: false })).toEqual({ kind: 'state', status: 'pinned' })
  })
  it('maps the deprecated tones', () => {
    expect(resolveChip({ tone: 'neutral', clickable: false })).toEqual({ kind: 'tag' })
    expect(resolveChip({ tone: 'accent', clickable: false })).toEqual({ kind: 'why' })
    expect(resolveChip({ tone: 'spoil', clickable: false })).toEqual({ kind: 'status', status: 'spoil' })
    expect(resolveChip({ tone: 'leftover', clickable: false })).toEqual({ kind: 'status', status: 'leftover' })
  })
  it('a clickable chip without a kind is a filter, whatever its tone', () => {
    expect(resolveChip({ tone: 'accent', clickable: true })).toEqual({ kind: 'filter' })
    expect(resolveChip({ clickable: true })).toEqual({ kind: 'filter' })
  })
  it('defaults to tag', () => {
    expect(resolveChip({ clickable: false })).toEqual({ kind: 'tag' })
  })
})

describe('resolveTile', () => {
  it('defaults to a surface tile spanning one column', () => {
    expect(resolveTile({})).toEqual({ variant: 'surface', span: 1 })
  })
  it('maps the deprecated tones', () => {
    expect(resolveTile({ tone: 'neutral' }).variant).toBe('surface')
    expect(resolveTile({ tone: 'accent' }).variant).toBe('soft')
    expect(resolveTile({ tone: 'spoil' })).toEqual({ variant: 'status', status: 'spoil', span: 1 })
    expect(resolveTile({ tone: 'leftover' })).toEqual({ variant: 'status', status: 'leftover', span: 1 })
  })
  it('maps the deprecated sizes: wide and full span the row, the rest one column', () => {
    expect(resolveTile({ size: 'wide' }).span).toBe('full')
    expect(resolveTile({ size: 'full' }).span).toBe('full')
    for (const size of ['sm', 'md', 'lg'] as const) expect(resolveTile({ size }).span).toBe(1)
  })
  it('new props win over deprecated ones', () => {
    expect(resolveTile({ variant: 'hero', tone: 'spoil', span: 2, size: 'full' })).toEqual({ variant: 'hero', span: 2 })
  })
})
