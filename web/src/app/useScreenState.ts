// B9-20 (RES-02): the React-facing wrapper of screenState; the connection comes from useConnectivity.
import { screenState, type QueryShape, type ScreenState } from '../lib/dataState'
import { useConnectivity } from './useConnectivity'

export function useScreenState(q: QueryShape, o: { isEmpty: boolean; hasFilter: boolean }): ScreenState {
  const { offline } = useConnectivity()
  return screenState(q, { online: !offline, isEmpty: o.isEmpty, hasFilter: o.hasFilter })
}
