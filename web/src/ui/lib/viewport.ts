// B9-19 (SHORT-04, system.md 11.1): the size classes as media-query constants. Heights are in px (a zoomed page loses CSS height too);
// widths come from the one breakpoint table (DS-09): short landscape from the tablet band, the compact rail below the desktop band.
// app/shell.css writes the same queries by hand; shell.chrome.css.test.ts keeps the two in step.
import { BREAKPOINTS, breakpointQuery } from './breakpoints'

/** Short: under 500 px tall. */
export const SHORT_MAX_HEIGHT = 499
/** Very short: under 340 px tall (400 % zoom on a phone); the bars stop floating. */
export const VERY_SHORT_MAX_HEIGHT = 339

export const SHORT_QUERY = `(max-height: ${SHORT_MAX_HEIGHT}px)`
export const VERY_SHORT_QUERY = `(max-height: ${VERY_SHORT_MAX_HEIGHT}px)`
/** Short and at least the tablet band wide: a phone held sideways. */
export const SHORT_LANDSCAPE_QUERY = `${SHORT_QUERY} and ${breakpointQuery('tablet')}`
/** Short and narrower than the tablet band: a short portrait window, or a zoomed page. */
export const SHORT_NARROW_QUERY = `${SHORT_QUERY} and (width < ${BREAKPOINTS.tablet}em)`
/** Short landscape below the desktop band: the 64 px compact rail replaces the bottom bar. */
export const COMPACT_RAIL_QUERY = `${SHORT_LANDSCAPE_QUERY} and (width < ${BREAKPOINTS.desktop}em)`
/** A touch screen: the only place an on-screen keyboard comes up. */
export const COARSE_QUERY = '(pointer: coarse)'
