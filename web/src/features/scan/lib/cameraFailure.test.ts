import { describe, expect, it } from 'vitest'
import { scanStrings } from '../strings'
import { cameraFailure } from './cameraFailure'

describe('cameraFailure', () => {
  it.each(['idle', 'starting', 'ready'] as const)('%s is not a failure', (status) => {
    expect(cameraFailure(status)).toBeNull()
  })

  it.each([
    ['denied', true, scanStrings.cameraDenied],
    ['no_camera', true, scanStrings.cameraNoCamera],
    ['in_use', true, scanStrings.cameraInUse],
    ['error', true, scanStrings.cameraError],
    ['unsupported', false, scanStrings.cameraUnsupported],
  ] as const)('%s: retry %s and its own message', (status, canRetry, message) => {
    expect(cameraFailure(status)).toEqual({ status, canRetry, message })
  })
})
