// SR5: pack-size chips from the Ingredient's Base Unit and its known Products.
import { describe, expect, it } from 'vitest'
import { COMMON_SIZES, MAX_PACK_CHIPS, packChip, suggestPackChips } from './packChips'

const labels = (s: ReturnType<typeof suggestPackChips>) => s.chips.map((c) => c.label)

describe('packChip', () => {
  it.each([
    [250, 'g', '250 g', '250', 'g'],
    [500, 'g', '500 g', '500', 'g'],
    [1000, 'g', '1 kg', '1', 'kg'],
    [1500, 'g', '1.5 kg', '1.5', 'kg'],
    [999, 'g', '999 g', '999', 'g'],
    [500, 'ml', '500 ml', '500', 'ml'],
    [1000, 'ml', '1 l', '1', 'l'],
    [1500, 'ml', '1.5 l', '1.5', 'l'],
    [1, 'piece', '1 piece', '1', 'piece'],
    [6, 'piece', '6 pieces', '6', 'piece'],
  ] as const)('%s %s is "%s", kept as %s %s', (size, base, label, value, unit) => {
    expect(packChip(size, base)).toEqual({ key: String(size), size, value, unit, label })
  })
})

describe('suggestPackChips', () => {
  it('g without Products: 250 g, 500 g, 1 kg', () => {
    expect(labels(suggestPackChips({ ingredientId: 1, baseUnit: 'g' }, []))).toEqual(['250 g', '500 g', '1 kg'])
  })
  it('ml without Products: 500 ml, 1 l', () => {
    expect(labels(suggestPackChips({ ingredientId: 1, baseUnit: 'ml' }, []))).toEqual(['500 ml', '1 l'])
  })
  it('piece without Products: 1, 4, 6, 10', () => {
    expect(labels(suggestPackChips({ ingredientId: 1, baseUnit: 'piece' }, []))).toEqual(['1 piece', '4 pieces', '6 pieces', '10 pieces'])
  })
  it('the common sizes are the ones of the spec', () => {
    expect(COMMON_SIZES).toEqual({ g: [250, 500, 1000], ml: [500, 1000], piece: [1, 4, 6, 10] })
  })

  it('a new Ingredient (no id) knows no Products', () => {
    expect(labels(suggestPackChips({ baseUnit: 'g' }, [{ ingredientId: 1, packSize: 700 }]))).toEqual(['250 g', '500 g', '1 kg'])
  })

  it('puts the Ingredient\'s known sizes first, ascending, then the common sizes not already there', () => {
    const s = suggestPackChips({ ingredientId: 1, baseUnit: 'g' }, [{ ingredientId: 1, packSize: 700 }, { ingredientId: 1, packSize: 400 }])
    expect(labels(s)).toEqual(['400 g', '700 g', '250 g', '500 g', '1 kg'])
  })

  it('does not repeat a size that is both known and common', () => {
    const s = suggestPackChips({ ingredientId: 1, baseUnit: 'g' }, [{ ingredientId: 1, packSize: 500 }])
    expect(labels(s)).toEqual(['500 g', '250 g', '1 kg'])
  })

  it('counts a size once however many Products have it', () => {
    const s = suggestPackChips({ ingredientId: 1, baseUnit: 'g' }, [{ ingredientId: 1, packSize: 700 }, { ingredientId: 1, packSize: 700 }])
    expect(labels(s).filter((l) => l === '700 g')).toHaveLength(1)
  })

  it('ignores other Ingredients\' Products', () => {
    expect(labels(suggestPackChips({ ingredientId: 1, baseUnit: 'g' }, [{ ingredientId: 2, packSize: 700 }]))).toEqual(['250 g', '500 g', '1 kg'])
  })

  it('shows at most 5 chips, the known sizes keeping their place', () => {
    expect(MAX_PACK_CHIPS).toBe(5)
    const known = [100, 200, 300, 400, 600, 700].map((packSize) => ({ ingredientId: 1, packSize }))
    expect(labels(suggestPackChips({ ingredientId: 1, baseUnit: 'g' }, known))).toEqual(['100 g', '200 g', '300 g', '400 g', '600 g'])
  })

  describe('preselected', () => {
    it('is the first chip when the Ingredient has exactly one usual size', () => {
      const s = suggestPackChips({ ingredientId: 1, baseUnit: 'g' }, [{ ingredientId: 1, packSize: 700 }])
      expect(s.preselected).toEqual(s.chips[0])
      expect(s.preselected?.label).toBe('700 g')
    })
    it('counts one distinct size, however many Products', () => {
      const s = suggestPackChips({ ingredientId: 1, baseUnit: 'g' }, [{ ingredientId: 1, packSize: 700 }, { ingredientId: 1, packSize: 700 }])
      expect(s.preselected?.label).toBe('700 g')
    })
    it('is null with two or more usual sizes', () => {
      expect(suggestPackChips({ ingredientId: 1, baseUnit: 'g' }, [{ ingredientId: 1, packSize: 700 }, { ingredientId: 1, packSize: 400 }]).preselected).toBeNull()
    })
    it('is null with no known size: the common sizes are only suggestions', () => {
      expect(suggestPackChips({ ingredientId: 1, baseUnit: 'ml' }, []).preselected).toBeNull()
    })
  })
})
