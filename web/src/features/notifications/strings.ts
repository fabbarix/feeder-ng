// English UI strings for notification settings. Glossary terms only.
import type { NotificationType } from './types'

export const notificationStrings = {
  title: 'Notifications',
  linkLabel: 'Notifications',
  linkHint: 'Choose what Feeder tells each of your devices about',
  thisDeviceHeading: 'This device',
  loading: 'Loading',
  loadError: 'Notification settings could not load. Try again in a moment.',
  thisDevice: 'This device',
  otherDevices: 'Your other devices',
  enable: 'Turn on notifications on this device',
  enabling: 'Turning on',
  disable: 'Turn off notifications on this device',
  remove: (label: string) => `Remove ${label}`,
  removeShort: 'Remove',
  unsupported: 'This browser cannot receive push notifications.',
  needsInstall: 'On iPhone and iPad, add Feeder to your Home Screen first, then open it from there to turn on notifications.',
  denied: 'Notifications are blocked for Feeder in this browser. Allow them in the browser settings, then come back.',
  quietHours: (start: string, end: string) => `No notifications between ${start} and ${end}, except Timer finished.`,
  types: {
    advanceStep: { label: 'Advance Step due', hint: 'When an Advance Step needs to start' },
    startCooking: { label: 'Start cooking', hint: 'When it is time to start so the Planned Meal is ready on time' },
    confirmCooked: { label: 'Confirm Cooked', hint: '2 hours after a Planned Meal, if you have not confirmed it' },
    leftoverUseBy: { label: 'Leftover Use-by', hint: 'At 10:00 on the Use-by date' },
    stockSpoil: { label: 'Stock about to spoil', hint: 'At 10:00 the day before, if no plan uses it' },
    timerFinished: { label: 'Timer finished', hint: 'Straight away, even in quiet hours' },
    accessRequest: { label: 'Sign-in request', hint: 'When someone asks to sign in and waits for approval' },
  } satisfies Record<NotificationType, { label: string; hint: string }>,
}
