/** Largest size that fits max x max keeping the aspect ratio; never upscales; each side at least 1; rounds like internal/imaging ScaledSize. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  if (width <= max && height <= max) return { width, height }
  if (width >= height) return { width: max, height: Math.max(1, Math.round((height * max) / width)) }
  return { width: Math.max(1, Math.round((width * max) / height)), height: max }
}
