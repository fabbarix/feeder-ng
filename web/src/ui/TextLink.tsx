import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import './TextLink.css'

export interface TextLinkProps {
  /** An in-app path; navigates without a page load. */
  to: string
  children: ReactNode
}

/** A text link to a page in the app: react-router's Link, styled as the shared `text-link`. */
export function TextLink({ to, children }: TextLinkProps) {
  return (
    <Link className="text-link" to={to}>
      {children}
    </Link>
  )
}
