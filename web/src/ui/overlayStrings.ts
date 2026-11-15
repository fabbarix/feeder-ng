// English copy for the overlay and status primitives (Dialog, ConfirmDialog, Toast, OfflineBanner, ErrorState).
export const overlayStrings = {
  cancel: 'Cancel',
  tryAgain: 'Try again',
  offline: 'Offline',
  showingSaved: 'showing what was saved',
  savedAt: (time: string) => ` at ${time}`,
  scansWaiting: (count: number) => `${count} ${count === 1 ? 'Scan' : 'Scans'} waiting to sync`,
  /** B9-49 (RES-07): "2 Scans and 1 Tick", "1 Tick"; '' when nothing waits. */
  queueCount: (scans: number, ticks: number) =>
    [scans > 0 ? `${scans} ${scans === 1 ? 'Scan' : 'Scans'}` : '', ticks > 0 ? `${ticks} ${ticks === 1 ? 'Tick' : 'Ticks'}` : '']
      .filter(Boolean)
      .join(' and '),
  /** B9-49 (RES-07): the offline banner's queue line, "2 Scans and 1 Tick waiting to sync"; '' when nothing waits. */
  queueWaiting: (scans: number, ticks: number) => {
    const what = overlayStrings.queueCount(scans, ticks)
    return what ? `${what} waiting to sync` : ''
  },
  /** B9-49 (RES-07): the toast once the queue has synced after a return, "Back online · 2 Scans and 1 Tick synced". */
  backOnlineSynced: (scans: number, ticks: number) => `Back online · ${overlayStrings.queueCount(scans, ticks)} synced`,
  customColour: 'Custom colour',
}
