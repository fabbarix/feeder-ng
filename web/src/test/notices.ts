import { screen, waitFor } from '@testing-library/react'

// The app shell keeps two always-mounted live regions (status, alert); pick the one carrying this notice.
export const noticeWith = (role: 'status' | 'alert', text: string) =>
  screen.getAllByRole(role).find((el) => el.textContent?.includes(text))
export const findNotice = (role: 'status' | 'alert', text: string) =>
  waitFor(() => {
    const el = noticeWith(role, text)
    if (!el) throw new Error(`no ${role} with "${text}"`)
    return el
  })
