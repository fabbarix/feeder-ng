// PPX: storage limits of a Picture queued offline (docs/dev/design/ppx-product-picture-sync.md).
import { describe, expect, it } from 'vitest'
import { RAW_MAX_SIDE } from '../../../ui/ImagePicker/lib/limits'
import { MAX_QUEUED_PICTURE_BYTES } from './queue'
import { OFFLINE_PICTURE_MAX_BYTES, OFFLINE_PICTURE_MAX_SIDE, OFFLINE_PICTURE_SOURCES } from './offlinePicture'

describe('offline Picture limits', () => {
  it('shrinks to the 1600 px the server keeps, below the 2576 px of raw mode', () => {
    expect(OFFLINE_PICTURE_MAX_SIDE).toBe(1600)
    expect(OFFLINE_PICTURE_MAX_SIDE).toBeLessThan(RAW_MAX_SIDE)
  })

  it('caps the stored Blob at 2 MiB, and the queue guards the same number', () => {
    expect(OFFLINE_PICTURE_MAX_BYTES).toBe(2 * 1024 * 1024)
    expect(MAX_QUEUED_PICTURE_BYTES).toBe(OFFLINE_PICTURE_MAX_BYTES)
  })

  it('offers no link source: the server fetches links, and it is out of reach', () => {
    expect([...OFFLINE_PICTURE_SOURCES]).toEqual(['file', 'paste', 'camera'])
  })
})
