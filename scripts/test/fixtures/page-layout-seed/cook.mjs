// B9-40 review (PC-03, SHORT-01, DS 3): one rich Recipe for Cook Mode, so the guard and the captures see what the plain seed Recipes
// never show: two Advance Steps (the info tile before Step 1, the one-line form after it, the chip in short landscape), a Passive pre-heat
// that holds Next, a 50-word Step with a photo, a second Passive Step. Runs last (order 900), after every plan regenerate of the other
// areas, and is archived, so no planned meal changes. Best effort like the base areas: a refused step is reported and skipped.
// seed(ctx) reads step and line from ctx; adds cookRecipeId (written to the ids file as cookRecipeId).
import { deflateSync } from 'node:zlib'

export const order = 900

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** A 960x600 PNG: a warm diagonal gradient with soft stripes, enough to read as a photo in the layout (no binary file in the repo). */
export function photoDataUrl(w = 960, h = 600) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    for (let x = 0; x < w; x++) {
      const t = (x + y) / (w + h)
      const stripe = Math.sin((x - y) / 18) * 12
      const o = y * (w * 3 + 1) + 1 + x * 3
      raw[o] = Math.max(0, Math.min(255, 196 - 60 * t + stripe))
      raw[o + 1] = Math.max(0, Math.min(255, 120 - 40 * t + stripe))
      raw[o + 2] = Math.max(0, Math.min(255, 60 + 30 * t))
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // RGB
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
  return `data:image/png;base64,${png.toString('base64')}`
}

/** The 50-word Step of PC-03's measurements. */
export const LONG_STEP =
  'Pat the chicken dry, season it all over with salt and pepper, tuck the lemon halves and the crushed garlic into the cavity, tie the legs together with kitchen string and set it breast-side up on a rack in a deep roasting tray so the fat can drain away while it roasts.'

export async function seed(ctx) {
  const { step, line } = ctx
  const img = await step('cook photo', 'POST', '/api/images', { dataUrl: photoDataUrl() })
  const image = img.ok ? img.json?.id : undefined
  const s = (text, kind, durationMinutes, extra = {}) => ({ text, kind, durationMinutes, leadTimeMinutes: 0, after: [], uses: [], ...extra })
  const steps = [
    s('Marinate the chicken in lemon, garlic and thyme', 'advance', 10, { leadTimeMinutes: 480 }),
    s('Soak the rice in cold water', 'advance', 5, { leadTimeMinutes: 60 }),
    s('Pre-heat the oven to 220 °C.', 'passive', 15),
    s(LONG_STEP, 'active', 5, { after: [2], ...(image ? { image } : {}) }),
    s('Simmer the rice', 'passive', 12),
    s('Rest the chicken for 10 minutes, then carve it.', 'active', 10),
    s('Serve.', 'active', 0),
  ]
  const r = await step('cook recipe', 'POST', '/api/recipes', {
    name: 'Lemon roast chicken with rice', description: 'A seeded recipe for the Cook Mode guard.', yield: 4, readyMeal: false, tags: [],
    lines: [line(10, 1200), line(1, 300), line(18, 1)], steps,
  })
  const id = r.ok ? (r.json?.id ?? null) : null
  // Archived at once: Cook Mode still opens it, and the planner never picks it, so the plan the other scenarios see is unchanged.
  if (id !== null) await step('archive cook recipe', 'POST', `/api/recipes/${id}/archive`, {})
  Object.assign(ctx, { cookRecipeId: id })
}
