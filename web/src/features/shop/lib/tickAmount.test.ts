// B9-34 (SSP-01, SSP-02, SSP-18): lib/tickAmount.ts, plain TypeScript. What one tap adds to Stock, what a ticked row says, what the Change
// sheet offers, which addition Change acts on, the time of an addition, and the pure "what to send" step of a tick (B9-54 routes the
// same plan through the offline queue). Decisions SSP 1 (the last-bought pack, else the Line's need, and by a later answer the suggested
// priced pack when the Ingredient was never bought: the server sends it as `pack`, with `pack.price`), SSP 2 and SSP 3.
import { describe, expect, it } from 'vitest'
import { formatQuantity } from '../../../lib/units'
import { makeAddition, makeExtra, makeGarlic, makeLine, makeTick } from '../testData'
import { extraEntry, lineEntry } from './lines'
import { additionDetail, changeTargetOf, defaultTickAmount, planTick, tickChoices, tickedMeta } from './tickAmount'

const garlic = (over = {}) => lineEntry(makeGarlic(over), 'USD', 'metric')
const CTX = { to: '2026-11-15', shopId: 1, clientUuid: 'c-1' }

describe('defaultTickAmount: the amount one tap ticks with (SSP 1)', () => {
  it('is the suggested pack: count x size (1 x 500 g of Garlic, although the Line needs 150 g)', () => {
    expect(defaultTickAmount(makeGarlic())).toBe(500)
    expect(defaultTickAmount(makeLine())).toBe(1400) // 2 x Mutti 700 g
  })

  it('is the suggested priced pack when the Ingredient was never bought (the server sends it as `pack`, with its price)', () => {
    const priced = makeGarlic({ pack: { productId: 12, name: 'Garlic bulbs 3 pack', size: 150, count: 2, remainder: 150, price: { cents: 199, date: '2026-11-10', shopId: 1 } } })
    expect(defaultTickAmount(priced)).toBe(300)
  })

  it('is what the Line still needs when no pack is known', () => {
    expect(defaultTickAmount(makeGarlic({ pack: null }))).toBe(150)
  })

  it('a ticked Line that grew ("more since your tick") ticks the difference when there is no pack', () => {
    expect(defaultTickAmount(makeGarlic({ ticked: true, quantity: 750, more: 750, pack: null }))).toBe(750)
  })
})

describe('tickedMeta: what a ticked row says about the tick (SSP-01)', () => {
  const meta = (tick: Parameters<typeof tickedMeta>[0], unit: 'g' | 'ml' | 'piece' = 'g', system: 'metric' | 'imperial' = 'metric') => tickedMeta(tick, unit, system)

  it('a hand tick that added Stock: success tone, the Package icon, "+500 g in Stock" (it has no shorter form)', () => {
    expect(meta(makeTick())).toEqual({ text: '+500 g in Stock', compact: '', tone: 'success', icon: 'stock' })
  })

  it('a hand tick that added nothing: muted, MinusCircle, "Not added to Stock", compact "No Stock added"', () => {
    expect(meta(makeTick({ added: null, additions: [makeAddition({ quantity: null })] }))).toEqual({ text: 'Not added to Stock', compact: 'No Stock added', tone: 'muted', icon: 'notAdded' })
  })

  it('a Scan: muted, the Barcode icon, "Scanned · 700 g"', () => {
    const tick = makeTick({ by: 'scan', added: 700, additions: [makeAddition({ by: 'scan', quantity: 700, who: 'Sam', mine: false })] })
    expect(meta(tick)).toEqual({ text: 'Scanned · 700 g', compact: '', tone: 'muted', icon: 'scan' })
  })

  it('a Scan that added nothing is just "Scanned"', () => {
    expect(meta(makeTick({ by: 'scan', added: null, additions: [makeAddition({ by: 'scan', quantity: null })] }))?.text).toBe('Scanned')
  })

  it('a Line with two additions (RES 2): "Added twice · Sam 50 g, you 50 g", compact "Added twice · 100 g"; the viewer is "you"', () => {
    const tick = makeTick({ additions: [makeAddition({ who: 'Sam', mine: false, quantity: 50, clientUuid: 's-1' }), makeAddition({ quantity: 50, clientUuid: 'u-2' })] })
    expect(meta(tick)).toEqual({ text: 'Added twice · Sam 50 g, you 50 g', compact: 'Added twice · 100 g', tone: 'success', icon: 'stock' })
  })

  it('three additions read "Added 3 times · …" (the same form; the count in digits)', () => {
    const adds = ['Ann', 'Sam', 'You'].map((who, i) => makeAddition({ who, mine: who === 'You', quantity: 40, clientUuid: `u-${i}` }))
    const m = meta(makeTick({ additions: adds }))!
    expect(m.text).toBe('Added 3 times · Ann 40 g, Sam 40 g, you 40 g')
    expect(m.compact).toBe('Added 3 times · 120 g')
  })

  it('the amount is written as the rest of the app writes it: the display system and the Base Unit', () => {
    expect(meta(makeTick(), 'g', 'imperial')?.text).toBe(`+${formatQuantity(500, 'g', 'imperial')} in Stock`)
    expect(meta(makeTick({ added: 6, additions: [makeAddition({ quantity: 6 })] }), 'piece')?.text).toBe(`+${formatQuantity(6, 'piece', 'metric')} in Stock`)
    expect(meta(makeTick({ added: 2000, additions: [makeAddition({ quantity: 2000 })] }), 'ml')?.text).toBe(`+${formatQuantity(2000, 'ml', 'metric')} in Stock`)
  })

  it('an open Line has no tick, so no meta', () => {
    expect(meta(null)).toBeNull()
    expect(meta(undefined)).toBeNull()
  })
})

describe('tickChoices: what the Change sheet offers (SSP-01)', () => {
  it('the pack ("1 × Garlic organic pack · 500 g") and what the Line needed (150 g)', () => {
    expect(tickChoices(garlic(), 'metric')).toEqual({ pack: { label: '1 × Garlic organic pack · 500 g', amount: 500 }, need: { amount: 150 } })
  })

  it('several packs: the label carries the total ("2 × Mutti 700 g · 1.4 kg")', () => {
    expect(tickChoices(lineEntry(makeLine(), 'USD', 'metric'), 'metric').pack).toEqual({ label: `2 × Mutti 700 g · ${formatQuantity(1400, 'g', 'metric')}`, amount: 1400 })
  })

  it('no pack known: only what the Line needed', () => {
    expect(tickChoices(garlic({ pack: null }), 'metric')).toEqual({ pack: null, need: { amount: 150 } })
  })

  it('a ticked Line offers the same choices (its need is the server\'s `need`, not the 0 left to buy)', () => {
    const ticked = garlic({ ticked: true, quantity: 0, tick: makeTick() })
    expect(tickChoices(ticked, 'metric')).toEqual({ pack: { label: '1 × Garlic organic pack · 500 g', amount: 500 }, need: { amount: 150 } })
  })

  it('free text has nothing to offer', () => {
    expect(tickChoices(extraEntry(makeExtra(), 'metric'), 'metric')).toEqual({ pack: null, need: null })
  })
})

describe('changeTargetOf: which addition Change acts on (SSP-01: the viewer\'s own)', () => {
  const sam = makeAddition({ who: 'Sam', mine: false, quantity: 50, clientUuid: 's-1' })
  const first = makeAddition({ quantity: 500, clientUuid: 'u-1', tickedAt: '2026-11-14T10:12:00Z' })
  const second = makeAddition({ quantity: 300, clientUuid: 'u-2', tickedAt: '2026-11-14T11:00:00Z' })

  it('the viewer\'s latest hand addition, with what it added and when', () => {
    const entry = garlic({ ticked: true, quantity: 0, tick: makeTick({ additions: [sam, first, second] }) })
    expect(changeTargetOf(entry)).toEqual({ entry, added: 300, tickedAt: '2026-11-14T11:00:00Z', clientUuid: 'u-2' })
  })

  it('ignores a Scan of the viewer and every addition of someone else', () => {
    const scan = makeAddition({ by: 'scan', quantity: 700, clientUuid: 'u-3' })
    expect(changeTargetOf(garlic({ ticked: true, quantity: 0, tick: makeTick({ additions: [sam, scan] }) }))).toBeNull()
  })

  it('an addition that added nothing is still the viewer\'s (Change can raise it from 0)', () => {
    const none = makeAddition({ quantity: null, clientUuid: 'u-4' })
    expect(changeTargetOf(garlic({ ticked: true, quantity: 0, tick: makeTick({ added: null, additions: [none] }) }))).toMatchObject({ added: 0, clientUuid: 'u-4' })
  })

  it('an open entry has none', () => {
    expect(changeTargetOf(garlic())).toBeNull()
  })
})

describe('additionDetail: the time of an addition, in the Household zone, 24 hours (SSP-18)', () => {
  const at = '2026-11-14T10:12:00Z'
  it('a hand addition: "Ticked at 10:12", with no Storage Place (the list does not say where the Lot is, and it may be put away since: main-session ruling)', () => {
    expect(additionDetail(makeAddition({ tickedAt: at }), 'UTC')).toBe('Ticked at 10:12')
    expect(additionDetail(makeAddition({ tickedAt: at }), 'UTC')).not.toMatch(/Not sorted/)
  })
  it('while the Household zone is unknown there is no time at all, never the device\'s (main-session ruling)', () => {
    expect(additionDetail(makeAddition({ tickedAt: at }), null)).toBe('')
    expect(additionDetail(makeAddition({ tickedAt: at }), undefined)).toBe('')
  })
  it('moves with the zone: Rome is an hour ahead in November, Kiritimati is 14 hours ahead', () => {
    expect(additionDetail(makeAddition({ tickedAt: at }), 'Europe/Rome')).toBe('Ticked at 11:12')
    expect(additionDetail(makeAddition({ tickedAt: at }), 'Pacific/Kiritimati')).toBe('Ticked at 00:12')
  })
  it('a Scan\'s addition: "Scanned at 10:12"', () => {
    expect(additionDetail(makeAddition({ by: 'scan', tickedAt: at }), 'UTC')).toBe('Scanned at 10:12')
  })
})

describe('planTick: what to send (the pure step B9-54 routes through the queue)', () => {
  it('an open Line: its Ingredient, the range end, the default amount, the Shop and the caller\'s client id', () => {
    expect(planTick(garlic(), CTX)).toEqual({ kind: 'line', request: { ingredientId: 9, to: '2026-11-15', quantity: 500, shopId: 1, clientUuid: 'c-1' } })
    expect(planTick(lineEntry(makeLine(), 'USD', 'metric'), CTX)).toMatchObject({ kind: 'line', request: { ingredientId: 2, quantity: 1400 } })
  })

  it('without a pack it is what the Line needs', () => {
    expect(planTick(garlic({ pack: null }), CTX)).toMatchObject({ request: { quantity: 150 } })
  })

  it('no Shop picked is null, sent as null', () => {
    expect(planTick(garlic(), { ...CTX, shopId: null })).toMatchObject({ request: { shopId: null } })
  })

  it('the "more since your tick" entry ticks the difference (the server covers it with this tick)', () => {
    const more = { ...garlic({ pack: null }), key: 'more:9', moreSince: true, quantity: 750, defaultAmount: 750 }
    expect(planTick(more, CTX)).toEqual({ kind: 'line', request: { ingredientId: 9, to: '2026-11-15', quantity: 750, shopId: 1, clientUuid: 'c-1' } })
  })

  it('an Ingredient extra ticks with its quantity; free text ticks with none', () => {
    const milk = extraEntry(makeExtra({ id: 2, text: null, ingredientId: 3, name: 'milk', baseUnit: 'ml', quantity: 2000 }), 'metric')
    expect(planTick(milk, CTX)).toEqual({ kind: 'extra', request: { extraId: 2, quantity: 2000, shopId: 1, clientUuid: 'c-1' } })
    expect(planTick(extraEntry(makeExtra(), 'metric'), CTX)).toEqual({ kind: 'extra', request: { extraId: 1, quantity: 0, shopId: 1, clientUuid: 'c-1' } })
  })

  it('an entry with no Ingredient and no extra id cannot be ticked', () => {
    expect(planTick({ ...garlic(), ingredientId: null }, CTX)).toBeNull()
  })
})
