// SR4: the Scanned list or the To get Lines, as the User last chose them on this device (feeder.scan.view). Storage can be
// blocked (private windows, cleared site data): then the choice is simply not kept. Pure TypeScript, no React.
export type ListView = 'scanned' | 'to-get'

export const LIST_VIEW_KEY = 'feeder.scan.view'

export function readListView(storage: Storage | null): ListView {
  try {
    return storage?.getItem(LIST_VIEW_KEY) === 'to-get' ? 'to-get' : 'scanned'
  } catch {
    return 'scanned'
  }
}

export function writeListView(storage: Storage | null, view: ListView): void {
  try {
    storage?.setItem(LIST_VIEW_KEY, view)
  } catch {
    // not kept: the next visit starts on the Scanned list
  }
}
