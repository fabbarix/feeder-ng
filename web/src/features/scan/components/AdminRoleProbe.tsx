// B9-41 (SSP-15): reports whether the signed-in User is the Admin. Mounted only while the weighed-goods hint is open, so the Scan screen
// asks for the User (useMe) only when it needs the answer. Renders nothing.
import { useEffect } from 'react'
import { useMe } from '../../../app/useMe'

export function AdminRoleProbe({ onAdmin }: { onAdmin: (admin: boolean) => void }) {
  const admin = useMe().data?.isAdmin === true
  useEffect(() => onAdmin(admin), [admin, onAdmin])
  return null
}
