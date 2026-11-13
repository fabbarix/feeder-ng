// The words of a review row, its notes and the counts (docs/design/receipt-reading.md 3.4; mock-ups 15 and 16). Pure.
import { receiptStrings as t } from '../strings'
import type { Proposal, ReceiptNote, ReceiptRow } from '../types'

export type Money = (cents: number) => string

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Thu 12 Nov" for a calendar day (YYYY-MM-DD), read in UTC so no zone moves it. */
export function dayText(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const day = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
  return `${WEEKDAYS[day.getUTCDay()]} ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}`
}

/** Today as a calendar day in the phone's zone (YYYY-MM-DD), the review's "today". */
export function localDay(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

function gramsText(g: number): string {
  return g >= 1000 ? `${g / 1000} kg` : `${g} g`
}

function priceText(p: Proposal, money: Money): string {
  const hadPrice = p.before.priceCents !== undefined
  const kg = p.after.perKg === true
  const from = hadPrice ? `${money(p.before.priceCents ?? 0)}${kg ? '/kg' : ''}` : t.addPrice
  const to = `${money(p.after.priceCents ?? 0)}${kg ? '/kg' : ''}`
  return `${from} → ${to}${!kg && hadPrice ? ' per pack' : ''}`
}

function weightText(p: Proposal, money: Money): string {
  const text = `${gramsText(p.before.grams ?? 0)} → ${gramsText(p.after.grams ?? 0)}`
  return p.after.priceCents !== undefined ? `${text} · ${money(p.after.priceCents)}` : text
}

function packText(p: Proposal): string {
  const unit = (n: number | undefined) => {
    const u = p.after.packUnit
    if (!u) return ''
    return u === 'piece' ? plural(n ?? 0, 'piece', 'pieces') : u
  }
  const show = (n: number | undefined) => `${n ?? ''}${unit(n) ? ` ${unit(n)}` : ''}`
  return `Pack size ${show(p.before.packSize)} → ${show(p.after.packSize)}`
}

function addText(p: Proposal, money: Money): string {
  const a = p.after
  const quantity = a.grams !== undefined ? `${a.grams / 1000} kg` : a.count !== undefined ? `×${a.count}` : ''
  const price = a.priceCents !== undefined ? money(a.priceCents) : ''
  return [quantity, price].filter((s) => s !== '').join(' · ')
}

/** The row's change line, as plain text ("A → B"). `today` names the day as "today". */
export function changeText(p: Proposal, o: { money: Money; today: string }): string {
  switch (p.kind) {
    case 'price':
      return priceText(p, o.money)
    case 'weight':
      return weightText(p, o.money)
    case 'quantity':
      return `×${p.before.count ?? ''} → ×${p.after.count ?? ''} (the receipt has ${p.after.count ?? ''})`
    case 'pack_size':
      return packText(p)
    case 'name':
      return `Name ${p.before.name ?? ''} → ${p.after.name ?? ''}`
    case 'add':
      return addText(p, o.money)
    case 'shop':
      return `Shop: ${p.before.shop ?? ''} → ${p.after.shop ?? ''}`
    case 'date':
      return `Date: ${p.before.date === o.today ? 'today' : dayText(p.before.date ?? '')} → ${dayText(p.after.date ?? '')}`
    case 'missing':
      return t.notOnReceipt
    default:
      return ''
  }
}

/** The row's name: the Scanned Product, the Add's name (or its printed line), "Shop" and "Date". */
export function rowTitle(p: Proposal, rows: ReceiptRow[]): string {
  if (p.kind === 'shop') return t.shop
  if (p.kind === 'date') return t.date
  if (p.kind === 'add') return p.after.name || p.text
  const row = rows.find((r) => r.row === p.row)
  return row?.product ?? p.before.name ?? p.text
}

function noteText(n: ReceiptNote, money: Money): string[] {
  switch (n.code) {
    case 'total_differs': {
      const c = n.cents ?? 0
      if (c === 0) return []
      return [`The receipt total is ${money(Math.abs(c))} ${c < 0 ? 'less' : 'more'} than the Scanned list. Check the lines below.`]
    }
    case 'discount':
      return [`A discount of ${money(Math.abs(n.cents ?? 0))} is in the receipt total; it is not spread over Prices.`]
    case 'shop_unknown':
      return [`The receipt names "${n.text}", which is not a saved Shop.`]
    default:
      return []
  }
}

/** One sentence per note the review shows; the total difference first. */
export function noteTexts(notes: ReceiptNote[], money: Money): string[] {
  const rank = (n: ReceiptNote) => (n.code === 'total_differs' ? 0 : 1)
  return [...notes].sort((a, b) => rank(a) - rank(b)).flatMap((n) => noteText(n, money))
}

export const applyLabel = (n: number) => `Apply ${n} ${plural(n, 'change', 'changes')}`
export const appliedToast = (n: number) => `Applied ${n} ${plural(n, 'change', 'changes')} from the receipt`
export const photosTitle = (n: number) => `Photos (${n} of up to 4)`
/** The body of the leave dialog: the photos are in memory only, so leaving loses them. */
export const photosNotKept = (n: number) => (n === 1 ? 'The photo is not kept.' : `The ${n} photos are not kept.`)
export const waitingText = (n: number) => `Waiting for ${n} ${plural(n, 'Scan', 'Scans')} to sync first`
