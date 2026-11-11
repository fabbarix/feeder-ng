// The one place that may talk about image files.
export const P = () => <FileDrop label="Add an image" accept="image/jpeg,image/png,image/webp" onFiles={() => {}} />
export const Cam = () => <input type="file" hidden accept="image/*" capture="environment" />
export const up = (dataUrl: string) => http.post('/api/images', { dataUrl })
