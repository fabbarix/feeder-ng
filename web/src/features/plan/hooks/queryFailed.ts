/** True when a query has no data and either failed or is paused for lack of a network connection. */
export function queryFailed(q: { data: unknown; isError: boolean; isPending: boolean; fetchStatus: string }): boolean {
  return q.data === undefined && (q.isError || (q.isPending && q.fetchStatus === 'paused'))
}
