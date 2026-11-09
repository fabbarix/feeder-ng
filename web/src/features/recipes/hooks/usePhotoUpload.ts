import { useState } from 'react'
import { recipesApi } from '../api'
import { photoErrorMessage } from '../lib/photo'

export interface UsePhotoUpload {
  /** Uploads the photo; resolves with its image id, or null when it failed (see `error`). */
  upload: (file: File) => Promise<string | null>
  uploading: boolean
  /** The message for the last failed upload, or null. */
  error: string | null
}

/** Uploads a Recipe photo (the server re-encodes it to WebP). */
export function usePhotoUpload(): UsePhotoUpload {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return {
    uploading,
    error,
    upload: async (file) => {
      setUploading(true)
      setError(null)
      try {
        const uploaded = await recipesApi.uploadImage(file)
        return uploaded.id
      } catch (err) {
        setError(photoErrorMessage(err))
        return null
      } finally {
        setUploading(false)
      }
    },
  }
}
