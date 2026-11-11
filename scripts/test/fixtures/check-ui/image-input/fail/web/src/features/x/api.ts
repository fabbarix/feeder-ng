import { http } from '../../lib/http'
export const upload = (dataUrl: string) => http.post('/api/images', { dataUrl })
export const fromUrl = (url: string) => http.post("/api/images/from-url", { url })
