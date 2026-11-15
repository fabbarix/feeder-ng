// B9-49 (SET-14g): Safari on an iPhone or iPad, where notifications reach only Feeder added to the Home Screen. Plain TypeScript.
// Other iOS browsers (CriOS, FxiOS, EdgiOS, OPiOS) keep the general line. An iPad in desktop mode reports itself as a Mac and keeps it too.

const IOS_DEVICE = /\b(iPhone|iPad|iPod)\b/
const OTHER_IOS_BROWSER = /\b(CriOS|FxiOS|EdgiOS|OPiOS|GSA|YaBrowser|DuckDuckGo)\//

export function isIosSafari(userAgent: string): boolean {
  return IOS_DEVICE.test(userAgent) && /\bSafari\//.test(userAgent) && /\bVersion\//.test(userAgent) && !OTHER_IOS_BROWSER.test(userAgent)
}
