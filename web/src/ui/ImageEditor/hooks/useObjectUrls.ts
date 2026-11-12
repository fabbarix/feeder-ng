// Stub (test-first step). See docs/dev/design/photo-read.md section 4.2.
export interface ObjectUrlApi {
  create: (blob: Blob) => string
  revoke: (url: string) => void
}
export interface ObjectUrls {
  urlFor: (key: string, blob: Blob) => string
  release: (key: string) => void
  releaseAll: () => void
}

export function useObjectUrls(_api?: ObjectUrlApi): ObjectUrls {
  throw new Error('not implemented')
}
