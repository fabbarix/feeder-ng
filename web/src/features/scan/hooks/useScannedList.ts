// SR3: the Scanned list as React state, kept on the phone by the session store (spec §10.1; shop-scan-proposals.md
// §13.2, §13.7). The pure grouping is in lib/scannedList; this hook loads, merges, saves and exposes it.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { UnitSystem } from '../../../lib/units'
import type { ShoppingLine, ShoppingList } from '../../shop/types'
import {
  buildScannedRows,
  dropEntries,
  displayOrder,
  nextWithoutPrice,
  recordEntry,
  repriceEntries,
  scannedTotals,
  settleEntries,
  toGetLines,
  type PriceUpdate,
  type ScannedRow,
  type ScannedTotals,
  type SessionEntry,
} from '../lib/scannedList'
import type { SessionStore } from '../lib/sessionStore'
import type { OfflineData, Op, ScanResult } from '../types'

export interface UseScannedListOptions {
  /** the Shop of the session; null (Stock-take, or no Shop yet) reads and writes nothing */
  shopId: number | null
  /** the household day of the session (the Shopping List's today); null until the list has loaded */
  day: string | null
  store: SessionStore
  /** the cached offline Products, which name the queued scans */
  offline: OfflineData | null
  /** the live Shopping List of the Shop, for "To get" */
  list?: ShoppingList
  system: UnitSystem
}

export interface ScannedList {
  /** the stored session of this Shop and day is in */
  loaded: boolean
  entries: SessionEntry[]
  /** one row per Product, newest first */
  rows: ScannedRow[]
  totals: ScannedTotals
  toGet: ShoppingLine[]
  toGetCount: number
  /** the next row without a Price after `current` (from the top when none), or null */
  nextUnpriced(current?: string | null): ScannedRow | null
  record(op: Op, result: ScanResult | null): void
  settle(results: ScanResult[]): void
  drop(clientUuids: string[]): void
  reprice(updates: PriceUpdate[]): void
  /** Change Shop: empties the session and its stored record */
  clear(): void
}

interface SessionState {
  /** the Shop and day the entries belong to ("shop|day"); null before a day is known */
  key: string | null
  loaded: boolean
  entries: SessionEntry[]
}

const NO_PRODUCTS: NonNullable<OfflineData['products']> = []

export function useScannedList(options: UseScannedListOptions): ScannedList {
  const { shopId, day, store, offline, list } = options
  const [state, setState] = useState<SessionState>({ key: null, loaded: false, entries: [] })

  // Loads the stored session of this Shop and day. Scans recorded before the load finishes are kept and merged after it.
  useEffect(() => {
    if (shopId === null || day === null) return
    const owner = `${shopId}|${day}`
    let alive = true
    setState((prev) => (prev.key === owner ? prev : { key: owner, loaded: false, entries: prev.key === null ? prev.entries : [] }))
    void store.load(shopId, day).then((stored) => {
      if (!alive) return
      setState((prev) => (prev.key !== owner || prev.loaded ? prev : { key: owner, loaded: true, entries: [...stored, ...prev.entries] }))
    })
    return () => {
      alive = false
    }
  }, [store, shopId, day])

  // Every change of a loaded session is saved; an empty session removes the record.
  const key = shopId !== null && day !== null ? `${shopId}|${day}` : null
  useEffect(() => {
    if (shopId === null || day === null || !state.loaded || state.key !== key) return
    void store.save(shopId, day, state.entries)
  }, [state, key, store, shopId, day])

  const products = offline?.products ?? NO_PRODUCTS
  const rows = useMemo(() => displayOrder(buildScannedRows(state.entries, products, list)), [state.entries, products, list])
  const totals = useMemo(() => scannedTotals(rows), [rows])
  const toGet = useMemo(() => toGetLines(list, rows), [list, rows])

  const record = useCallback((op: Op, result: ScanResult | null) => setState((s) => ({ ...s, entries: recordEntry(s.entries, op, result) })), [])
  const settle = useCallback((results: ScanResult[]) => setState((s) => ({ ...s, entries: settleEntries(s.entries, results) })), [])
  const drop = useCallback((clientUuids: string[]) => setState((s) => ({ ...s, entries: dropEntries(s.entries, clientUuids) })), [])
  const reprice = useCallback((updates: PriceUpdate[]) => setState((s) => ({ ...s, entries: repriceEntries(s.entries, updates) })), [])
  const clear = useCallback(() => {
    setState((s) => ({ ...s, entries: [] }))
    void store.clear()
  }, [store])
  const nextUnpriced = useCallback((current?: string | null) => nextWithoutPrice(rows, current), [rows])

  return {
    loaded: state.loaded && state.key === key,
    entries: state.entries,
    rows,
    totals,
    toGet,
    toGetCount: toGet.length,
    nextUnpriced,
    record,
    settle,
    drop,
    reprice,
    clear,
  }
}
