import { describe, expect, it } from 'vitest'
import { scanStrings } from '../strings'
import { cameraFailure } from './cameraFailure'

describe('cameraFailure', () => {
  it.each(['idle', 'starting', 'ready'] as const)('%s is not a failure', (status) => {
    expect(cameraFailure(status)).toBeNull()
  })

  it.each([
    // B9-35 (SSP-06): the camera bar's message is short, one line at 375 px. Main-session ruling: a busy and a failed camera get short
    // words too ("The camera is busy", "The camera did not start"), not the old sentences.
    ['denied', true, scanStrings.cameraBarDenied],
    ['no_camera', true, scanStrings.noCameraBar],
    ['in_use', true, scanStrings.cameraBarInUse],
    ['error', true, scanStrings.cameraBarError],
    ['unsupported', false, scanStrings.noCameraBar],
  ] as const)('%s: retry %s and its own message', (status, canRetry, message) => {
    expect(cameraFailure(status)).toEqual({ status, canRetry, message })
  })
})
