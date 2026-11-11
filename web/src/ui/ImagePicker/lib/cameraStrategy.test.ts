import { describe, expect, it } from 'vitest'
import { cameraStrategy } from './cameraStrategy'

const env = (over = {}) => ({ hasGetUserMedia: true, coarsePointer: false, iosStandalone: false, ...over })

describe('cameraStrategy', () => {
  it('a desktop with a webcam API gets the viewfinder', () => expect(cameraStrategy(env())).toBe('viewfinder'))
  it('a phone with getUserMedia gets the viewfinder', () => expect(cameraStrategy(env({ coarsePointer: true }))).toBe('viewfinder'))
  it('a phone without getUserMedia (plain http) gets the system camera input', () =>
    expect(cameraStrategy(env({ hasGetUserMedia: false, coarsePointer: true }))).toBe('capture-input'))
  it('a desktop without getUserMedia offers no camera', () => expect(cameraStrategy(env({ hasGetUserMedia: false }))).toBe('none'))
  it('an iOS home-screen app uses the system camera input even though getUserMedia exists', () =>
    expect(cameraStrategy(env({ coarsePointer: true, iosStandalone: true }))).toBe('capture-input'))
})
