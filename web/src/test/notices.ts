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

// A toast whose words include `text`. A message of several sentences is set as a headline and a body (DS-12 R-D), so its
// words span two elements and findByText cannot match the whole message; the toast's own text still reads as one run.
export const findToast = (text: string) =>
  waitFor(() => {
    const el = [...document.querySelectorAll<HTMLElement>('.toast')].find((t) => (t.textContent ?? '').replace(/\s+/g, ' ').includes(text))
    if (!el) throw new Error(`no toast with "${text}"`)
    return el
  })
