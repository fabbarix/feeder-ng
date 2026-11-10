// English copy for the overlay and status primitives (Dialog, ConfirmDialog, Toast, OfflineBanner, ErrorState).
export const overlayStrings = {
  cancel: 'Cancel',
  tryAgain: 'Try again',
  offline: 'Offline',
  showingSaved: 'showing what was saved',
  savedAt: (time: string) => ` at ${time}`,
  scansWaiting: (count: number) => `${count} ${count === 1 ? 'Scan' : 'Scans'} waiting to sync`,
  customColour: 'Custom colour',
}
