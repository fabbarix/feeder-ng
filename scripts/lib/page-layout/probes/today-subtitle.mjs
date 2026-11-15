// Probe "today-subtitle" (in-page, B9-44, RES-05; P42): on `/` only, fills todaySubtitle: { texts: [string], expected: string | null }, null elsewhere.
//   texts     the text of every visible .page-header__subtitle in main (a skeleton or an empty subtitle reads "").
//   expected  the Household's date as Today writes it ("Mon 9 Nov"), from the zone /api/me gives (read with a synchronous request, so the page's own
//             requests are not touched); null when the zone is unknown (then the rule only asks that a subtitle is not the device's date, below).
//   device    the same date as the DEVICE's clock writes it, to tell a household date from a device date.
const source = `
(() => {
  if (location.pathname !== '/') return null
  const fmt = (zone) => {
    const o = { weekday: 'short', day: 'numeric', month: 'short' }
    if (zone) o.timeZone = zone
    return new Intl.DateTimeFormat('en-GB', o).format(new Date()).replace(/,/g, '').replace(/\\s+/g, ' ').trim()
  }
  let zone = null
  try {
    const x = new XMLHttpRequest()
    x.open('GET', '/api/me', false)
    x.send()
    if (x.status === 200) zone = JSON.parse(x.responseText).householdTimeZone || null
  } catch (e) {
    zone = null
  }
  const main = document.querySelector('main')
  const texts = [...(main ? main.querySelectorAll('.page-header__subtitle') : [])].filter((e) => e.getClientRects().length > 0).map((e) => e.textContent.replace(/\\s+/g, ' ').trim())
  return { texts, expected: zone ? fmt(zone) : null, device: fmt(null) }
})()`

export default { name: 'today-subtitle', key: 'todaySubtitle', order: 190, source }
