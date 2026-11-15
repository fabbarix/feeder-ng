// B9-35 (SSP-06, SSP-12, SHORT-04; plan section 9): the scenarios of Scan without a camera, with a (fake) one, and in landscape.
//   scan-typed          /scan with no camera (a headless Chrome has none): the camera bar, the typed entry open under it, three codes typed. The
//                       setup fails (not inspected) unless the field still has focus after the last Use (SSP-06: several codes can be typed) and the
//                       newest Scanned row is on screen above the bottom bar. P12 (nothing of main under the floating bar at the end of the scroll)
//                       and P30 (no [data-one-line] button, Use, Back to the camera or Try again, on two lines) at 375, 390, 834 and 1440 (SCENARIO_VIEWPORTS has no 820 or 1024); and in a
//                       phone held sideways (667x375, the rail beside the page, no bottom bar).
//   scan-camera-typed   /scan with a fake camera (below): Type a barcode in the strip's control row opens the entry and focuses the field; one
//                       code typed. P12, P29, P30, P36, P39.
//   scan-camera-landscape  /scan with a fake camera at 667x375 (SHORT-04): the compact rail, no bottom bar, and Mute and Type a barcode are not
//                       covered by anything (elementFromPoint at their centres) and take the R-A surface (P29). P29, P32, P36.
// The guard's headless Chrome has no camera. The fake camera is a script that runs before the page's own: navigator.mediaDevices.getUserMedia
// answers with a canvas stream, so useCamera reaches `ready` and the viewfinder strip shows (no torch: a canvas track has none).
import { byText, evaluate, ids, press, scanSession, typeInto, until } from '../helpers.mjs'

const FAKE_CAMERA = `(() => {
  const stream = () => {
    const c = document.createElement('canvas')
    c.width = 640
    c.height = 480
    const x = c.getContext('2d')
    const paint = () => { x.fillStyle = '#334455'; x.fillRect(0, 0, 640, 480) }
    paint()
    setInterval(paint, 200)
    return c.captureStream(5)
  }
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => stream(), enumerateDevices: async () => [], addEventListener() {}, removeEventListener() {} }, configurable: true })
})()`
const fakeCamera = [{ method: 'Page.addScriptToEvaluateOnNewDocument', params: { source: FAKE_CAMERA } }]

const FIELD = `[data-typed-entry] input`
const startSession = async () => {
  await until(`!!document.querySelector('.shop-picker, .scan-screen__split')`, 'the Scan screen')
  if (await evaluate(`!!document.querySelector('.shop-picker')`)) {
    await press(`document.querySelector('.shop-picker .list-row__target[aria-label=' + ${JSON.stringify(JSON.stringify(ids.shopName ?? ''))} + ']')`, `Shop "${ids.shopName}" in the picker`)
  }
  await until(`!!document.querySelector('.scan-screen__split')`, 'the shop session')
}
const viewfinderOn = () => until(`(() => { const r = document.querySelector('[role=region][aria-label=Scanner]'); return !!r && r.dataset.size !== 'bar' && !!r.querySelector('video') })()`, 'the fake camera (the viewfinder strip, not the camera bar)', 15000)

export default {
  order: 340,
  scenarios: [
    { name: 'scan-typed', route: '/scan', start: '/scan', setup: 'scanTyped', widths: [375, 390, 834, 1440, '667x375'], rules: ['P12', 'P30'] },
    { name: 'scan-camera-typed', route: '/scan', start: '/scan', setup: 'scanCameraTyped', widths: [375, 390, 834], emulate: fakeCamera, rules: ['P12', 'P29', 'P30', 'P36', 'P39'] },
    { name: 'scan-camera-landscape', route: '/scan', start: '/scan', setup: 'scanCameraLandscape', widths: ['667x375'], emulate: fakeCamera, rules: ['P29', 'P32', 'P36'] },
  ],
  setups: {
    async scanTyped() {
      const codes = (ids.scanBarcodes ?? []).slice(0, 3)
      if (codes.length < 2) throw new Error('setup: the seed has fewer than two scan barcodes')
      await scanSession(codes)
      if (!(await evaluate(`document.querySelector('[role=region][aria-label=Scanner]')?.dataset.size === 'bar'`))) throw new Error('setup: not inspected: the camera bar is not shown (is there a camera?)')
      if (!(await evaluate(`document.activeElement === document.querySelector(${JSON.stringify(FIELD)})`))) throw new Error('SSP-06: after Use the Barcode field does not have focus (several codes cannot be typed)')
      const hidden = await evaluate(`(() => {
        const row = document.querySelector('ul[aria-label="Scanned list"] > .list-row'); const bar = document.querySelector('nav.bottom-bar')
        if (!row) return 'no Scanned row'
        const r = row.getBoundingClientRect(); const b = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect() : null
        if (r.bottom > innerHeight || r.top < 0) return 'the newest row is outside the window (' + Math.round(r.top) + '-' + Math.round(r.bottom) + ' of ' + innerHeight + ')'
        if (b && r.bottom > b.top) return 'the newest row (bottom ' + Math.round(r.bottom) + ') is under the bottom bar (top ' + Math.round(b.top) + ')'
        return ''
      })()`)
      if (hidden) throw new Error(`SSP-06: ${hidden}`)
    },
    async scanCameraTyped() {
      await startSession()
      await viewfinderOn()
      await press(byText('.viewfinder-strip__controls button', 'Type a barcode'), '"Type a barcode" in the strip')
      await until(`!!document.querySelector(${JSON.stringify(FIELD)})`, 'the typed entry')
      if (!(await evaluate(`document.activeElement === document.querySelector(${JSON.stringify(FIELD)})`))) throw new Error('SSP-06: opening the typed entry does not focus the Barcode field')
      const code = (ids.scanBarcodes ?? [])[0]
      if (!code) throw new Error('setup: the seed has no scan barcodes')
      if (!(await evaluate(typeInto(FIELD, code)))) throw new Error('setup: the barcode field went away')
      await press(`document.querySelector('[data-typed-entry] button[type=submit]')`, '"Use this barcode"')
      await until(`document.querySelectorAll('ul[aria-label="Scanned list"] > .list-row').length > 0`, 'the typed scan as a Scanned row')
      if (!(await evaluate(`document.activeElement === document.querySelector(${JSON.stringify(FIELD)})`))) throw new Error('SSP-06: after Use the Barcode field does not have focus')
      await evaluate(`document.querySelectorAll('.toast > button:last-child').forEach((b) => b.click())`)
    },
    async scanCameraLandscape() {
      await startSession()
      await viewfinderOn()
      if (await evaluate(`!!document.querySelector('nav.bottom-bar') && getComputedStyle(document.querySelector('nav.bottom-bar')).display !== 'none'`)) throw new Error('SHORT-04: the bottom bar is shown in landscape (the compact rail should replace it)')
      const covered = await evaluate(`(() => {
        const out = []
        for (const name of ['Mute beep', 'Unmute beep', 'Type a barcode']) {
          const b = [...document.querySelectorAll('.viewfinder-strip__controls button')].find((e) => e.getAttribute('aria-label') === name)
          if (!b) continue
          const r = b.getBoundingClientRect()
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          if (hit !== b && !b.contains(hit)) out.push(name + ' is covered by ' + (hit ? hit.tagName.toLowerCase() + '.' + [...hit.classList].slice(0, 2).join('.') : 'nothing'))
        }
        return out.join('; ')
      })()`)
      if (covered) throw new Error(`SHORT-04: ${covered}`)
      if (!(await evaluate(`!!document.querySelector('.viewfinder-strip__controls button[aria-label="Mute beep"]')`))) throw new Error('setup: not inspected: no Mute button in the strip')
    },
  },
}
