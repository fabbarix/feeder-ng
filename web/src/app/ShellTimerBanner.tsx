import { Button, Icon } from '../ui'
import { shellTimerStrings as s } from './shellTimerStrings'

export interface ShellTimerBannerProps {
  headline: string
  subline: string
  onOpen: () => void
  onDismiss: () => void
}

/**
 * The in-app finish alert (PC-04): role alert, success tone, never native. The bell sits on the headline line (the status is in
 * the headline). Open Cook Mode is the primary button, Dismiss a secondary one. It does not take focus.
 */
export function ShellTimerBanner({ headline, subline, onOpen, onDismiss }: ShellTimerBannerProps) {
  return (
    <div className="shell-timer-banner" role="alert" data-primary-scope="">
      <p className="shell-timer-banner__head">
        <Icon name="bellRinging" size={24} />
        <span className="shell-timer-banner__title">{headline}</span>
      </p>
      {subline ? <p className="shell-timer-banner__subline">{subline}</p> : null}
      <div className="shell-timer-banner__actions">
        <Button variant="primary" onClick={onOpen}>
          {s.openCookMode}
        </Button>
        <Button variant="secondary" onClick={onDismiss}>
          {s.dismiss}
        </Button>
      </div>
    </div>
  )
}
