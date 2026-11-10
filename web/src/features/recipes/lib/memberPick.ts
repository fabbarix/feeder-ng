// Which Member the preference toggles act for (G1). Plain TypeScript.

export interface MemberRef {
  id: number
  name: string
  /** The linked User, or null. */
  userId: number | null
}

/**
 * The Member shown as chosen: the explicit pick if any, else the Member linked to the signed-in User, else null
 * (the API then defaults to the linked Member itself, so "no pick" is sent as undefined).
 */
export function selectedMemberId(members: MemberRef[], meUserId: number | null, chosen: number | undefined): number | null {
  void members
  void meUserId
  void chosen
  throw new Error('not implemented')
}

/**
 * MemberSelect is multi-valued; the picker needs one. Given the previous single value and the new list,
 * returns the id that was just added (the one not in `previous`), or `previous` when nothing was added
 * (deselecting the only value keeps it), or null when the list is empty and there was no previous value.
 */
export function singleMember(previous: number | null, next: number[]): number | null {
  void previous
  void next
  throw new Error('not implemented')
}
