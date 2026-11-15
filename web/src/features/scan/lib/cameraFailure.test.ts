import { describe, expect, it } from 'vitest'
import { scanStrings } from '../strings'
import { cameraFailure } from './cameraFailure'

describe('cameraFailure', () => {
  it.each(['idle', 'starting', 'ready'] as const)('%s is not a failure', (status) => {
    expect(cameraFailure(status)).toBeNull()
  })

  it.each([
    // B9-35 (SSP-06): the camera bar's message is short; a blocked camera and an absent one have their own words, a busy or failed one keeps its sentence.
    ['denied', true, scanStrings.cameraBarDenied],
    ['no_camera', true, scanStrings.noCameraBar],
    ['in_use', true, scanStrings.cameraInUse],
    ['error', true, scanStrings.cameraError],
    ['unsupported', false, scanStrings.noCameraBar],
  ] as const)('%s: retry %s and its own message', (status, canRetry, message) => {
    expect(cameraFailure(status)).toEqual({ status, canRetry, message })
  })
})
