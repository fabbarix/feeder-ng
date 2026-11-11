// Model options for the shared Select (design 2.3). Pure: no React, so `leading` (the price badge) is added by the component.
import { describe, expect, it } from 'vitest'
import { models } from '../fixtures'
import { createModelLabel, isValidModelId, metaLine, toModelOptions } from './modelOptions'

describe('toModelOptions', () => {
  const opts = toModelOptions(models, 'claude-haiku-5-5')

  it('keeps the API order, so Haiku 5.5 is first (the default)', () => {
    expect(opts[0]).toMatchObject({ value: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', group: 'Recommended' })
    expect(opts.map((o) => o.value)).toEqual(models.map((m) => m.id))
  })
  it('meta is "price · speed · description"', () => {
    expect(opts[0]!.meta).toBe('$ · Fastest · Fastest and cheapest. Default. May need more fixing in Import Review.')
    expect(opts[1]!.meta).toBe('$$ · Quick · Better with messy pages and handwriting.')
  })
  it('keywords carry the id so it can be searched', () => expect(opts[0]!.keywords).toEqual(['claude-haiku-5-5']))
  it('exposes the price tier for the badge and flags a deprecated model', () => {
    expect(opts[0]!.priceTier).toBe('$')
    expect(opts[0]!.warning).toBe(false)
    const old = opts.find((o) => o.value === 'claude-opus-4-8')!
    expect(old.warning).toBe(true)
    expect(old.meta).toBe('Retires 12 Mar 2027')
    expect(old.group).toBe('Older models')
  })
  it('orders groups Recommended, Other models, Older models, then any other', () => {
    const shuffled = [models[4]!, models[3]!, { ...models[1]!, group: 'Zeta' }, models[0]!]
    expect(toModelOptions(shuffled, 'claude-haiku-5-5').map((o) => o.group)).toEqual(['Recommended', 'Other models', 'Older models', 'Zeta'])
  })
  it('a model the catalogue does not know shows "Price not known"', () => {
    const unknown = { ...models[0]!, id: 'claude-new-9', name: 'Claude New 9', priceTier: '', speedTier: '', description: '' }
    expect(toModelOptions([unknown], 'claude-new-9')[0]!.meta).toBe('Price not known')
  })
  it('adds the current model as a Custom entry when the list does not have it', () => {
    const withCustom = toModelOptions(models, 'my-gateway-model')
    const last = withCustom[withCustom.length - 1]!
    expect(last).toMatchObject({ value: 'my-gateway-model', label: 'my-gateway-model', group: 'Custom', meta: 'Custom model ID' })
    expect(toModelOptions(models, 'claude-haiku-5-5').some((o) => o.group === 'Custom')).toBe(false)
  })
  it('with no list (failed or still loading) offers only the current model, so the trigger can show it', () => {
    expect(toModelOptions(undefined, 'claude-haiku-5-5')).toEqual([expect.objectContaining({ value: 'claude-haiku-5-5', label: 'claude-haiku-5-5' })])
    expect(toModelOptions(undefined, '')).toEqual([])
  })
})

describe('metaLine', () => {
  it('skips an empty speed tier', () => expect(metaLine({ ...models[4]!, lifecycle: 'active' })).toBe('$$$ · Previous generation.'))
})

describe('isValidModelId', () => {
  it.each(['claude-haiku-5-5', 'a', 'x.y_z:1@2/3-4', 'A'.repeat(128)])('accepts %s', (id) => expect(isValidModelId(id)).toBe(true))
  it.each(['', 'has space', 'bad!', 'é', 'A'.repeat(129)])('rejects %j', (id) => expect(isValidModelId(id)).toBe(false))
})

describe('createModelLabel', () => {
  it('is the create row copy', () => expect(createModelLabel('claude-x')).toBe('Use model ID “claude-x”'))
})
