import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/http'
import { readFileError } from './errors'

describe('readFileError', () => {
  it('reads the JSON-path list of a schema error', () => {
    const errors = [{ path: '$.recipes[0].yield', message: 'must be > 0' }]
    expect(readFileError(new ApiError(422, 'invalid_recipe_file', 'x', { errors }))).toEqual({ kind: 'schema', errors })
  })
  it('reads an unknown version', () => {
    expect(readFileError(new ApiError(422, 'unsupported_version', 'x', { version: '2' }))).toEqual({ kind: 'version', version: '2' })
  })
  it('reads syntax and size errors', () => {
    expect(readFileError(new ApiError(422, 'invalid_json', 'x'))).toEqual({ kind: 'syntax' })
    expect(readFileError(new ApiError(413, 'file_too_large', 'x'))).toEqual({ kind: 'tooLarge' })
  })
  it('keeps the message of anything else', () => {
    expect(readFileError(new ApiError(500, 'internal', 'Boom'))).toEqual({ kind: 'other', message: 'Boom' })
    expect(readFileError(new Error('offline'))).toEqual({ kind: 'other', message: 'offline' })
    expect(readFileError('weird')).toEqual({ kind: 'other', message: 'weird' })
  })
  it('survives a schema error without a list', () => {
    expect(readFileError(new ApiError(422, 'invalid_recipe_file', 'x'))).toEqual({ kind: 'schema', errors: [] })
  })
})
