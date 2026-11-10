import type { ReactNode } from 'react'
import type { Crumb } from './Breadcrumbs'
import './PageHeader.css'

export interface PageHeaderProps {
  /** The screen title, an h1 (title-1). */
  title: string
  subtitle?: string
  /** R11a (type only for now): the Breadcrumbs trail, rendered on its own row above the title. */
  breadcrumbs?: Crumb[]
  /** E.g. a back IconButton. */
  leading?: ReactNode
  /** Right-aligned actions (IconButtons, one Button). */
  actions?: ReactNode
}

/** The title row of a screen: `<header>` with the h1, an optional subtitle, leading node and actions. */
export function PageHeader({ title, subtitle, leading, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      {leading ? <div className="page-header__leading">{leading}</div> : null}
      <div className="page-header__text">
        <h1 className="page-header__title">{title}</h1>
        {subtitle ? <p className="page-header__subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  )
}
