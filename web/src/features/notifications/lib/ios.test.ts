// B9-49 (SET-14g): Notifications on iPhone Safari. A pure user-agent check; the line "Safari on iPhone sends notifications only to Feeder added
// to the Home Screen. Use Share, then Add to Home Screen, then open Feeder from there." shows only for iOS Safari.
import { describe, expect, it } from 'vitest'
import { isIosSafari } from './ios'

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPAD_SAFARI = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1'
const IPHONE_FIREFOX = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15'
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'

describe('isIosSafari', () => {
  it.each([['iPhone Safari', IPHONE_SAFARI], ['iPad Safari', IPAD_SAFARI]])('is true for %s', (_n, ua) => expect(isIosSafari(ua)).toBe(true))
  it.each([
    ['iPhone Chrome (CriOS)', IPHONE_CHROME],
    ['iPhone Firefox (FxiOS)', IPHONE_FIREFOX],
    ['Android Chrome', ANDROID_CHROME],
    ['Mac Safari', MAC_SAFARI],
    ['an empty string', ''],
  ])('is false for %s (they keep the old line)', (_n, ua) => expect(isIosSafari(ua)).toBe(false))
})
