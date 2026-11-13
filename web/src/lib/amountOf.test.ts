import { describe, expect, it } from 'vitest'
import { amountOf } from './amountOf'

// The shared "x of y" rule of the Shop screen's Restock reason and the Scanned row's Line cover.
describe('amountOf: the two amounts of "x of y" in one Base Unit', () => {
  it('pieces are bare numbers, at most 1 decimal', () => {
    expect(amountOf(2, 6, 'piece', 'metric')).toEqual(['2', '6'])
    expect(amountOf(2.25, 6, 'piece', 'imperial')).toEqual(['2.3', '6'])
  })

  it('metric g and ml name the unit once when both amounts share it', () => {
    expect(amountOf(250, 375, 'g', 'metric')).toEqual(['250', '375 g'])
    expect(amountOf(200, 500, 'ml', 'metric')).toEqual(['200', '500 ml'])
  })

  it('imperial keeps both units', () => {
    expect(amountOf(200, 500, 'g', 'imperial')).toEqual(['7.1 oz', '1 lb 2 oz'])
    expect(amountOf(200, 1000, 'ml', 'imperial')).toEqual(['0.75 cups', '4.25 cups'])
  })

  it('float dust and a negative x count as 0', () => {
    expect(amountOf(1e-12, 6, 'piece', 'metric')).toEqual(['0', '6'])
    expect(amountOf(-0.5, 500, 'g', 'metric')).toEqual(['0', '500 g'])
  })
})
