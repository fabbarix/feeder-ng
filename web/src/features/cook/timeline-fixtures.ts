// CRS F test support: a cooking timeline as GET /api/cook/meals/{date}/{slotId}/all sends it (docs/dev/design/crs-c2.md 5.1).
// Dinner 19:00 (30 minutes): Main (id 1, the main Course: its scope is two-part until C3) and Side (id 2, three-part).
import type { CookTimer, CookView, TimelineItem, TimelineView } from './types'

export const MAIN_SCOPE = 'meal:2026-11-10/4/1'
export const SIDE_SCOPE = 'meal:2026-11-10/4/2'

export function item(over: Partial<TimelineItem> = {}): TimelineItem {
  return {
    courseId: 1, scope: MAIN_SCOPE, kind: 'active', step: 0, number: 1, text: 'Brown the chicken', durationMinutes: 10, startSeconds: 0, endSeconds: 600,
    uses: [], imageUrl: '', timer: null, after: [], ...over,
  }
}

/** Four items over two Courses: Main step 0 (active), Side step 0 (passive, timer), Main step 1 (passive, after 0), Side step 1 (active, after 0). */
export function timelineView(over: Partial<TimelineView> = {}): TimelineView {
  return {
    date: '2026-11-10', mealSlotId: 4, slotName: 'Dinner', time: '19:00', startAt: '2026-11-10T18:30:00Z', totalMinutes: 30,
    courses: [
      { courseId: 1, name: 'Main', recipeId: 7, recipeName: 'Roast chicken', scope: MAIN_SCOPE, batches: 1, fresh: true, state: 'planned' },
      { courseId: 2, name: 'Side', recipeId: 8, recipeName: 'Green beans', scope: SIDE_SCOPE, batches: 1, fresh: true, state: 'planned' },
    ],
    advance: [],
    items: [
      item({ number: 1, step: 0, text: 'Brown the chicken', startSeconds: 0, endSeconds: 600 }),
      item({
        courseId: 2, scope: SIDE_SCOPE, kind: 'passive', step: 0, number: 2, text: 'Simmer the beans', durationMinutes: 10, startSeconds: 600, endSeconds: 1200,
        timer: { label: 'Green beans · Simmer the beans', durationSeconds: 600 },
      }),
      item({
        kind: 'passive', step: 1, number: 3, text: 'Roast in the oven', durationMinutes: 20, startSeconds: 600, endSeconds: 1800, after: [0],
        timer: { label: 'Roast chicken · Roast in the oven', durationSeconds: 1200 },
      }),
      item({ courseId: 2, scope: SIDE_SCOPE, kind: 'active', step: 1, number: 4, text: 'Toss the beans', durationMinutes: 5, startSeconds: 1500, endSeconds: 1800, after: [0] }),
    ],
    ...over,
  }
}

/** The same slot with only the Side left to cook (Main already Cooked): one Course, its items renumbered. */
export function sideOnly(): TimelineView {
  const v = timelineView()
  return {
    ...v,
    courses: [{ ...v.courses[0]!, state: 'cooked' }, v.courses[1]!],
    items: v.items.filter((i) => i.courseId === 2).map((i, n) => ({ ...i, number: n + 1 })),
  }
}

export function timer(over: Partial<CookTimer> = {}): CookTimer {
  const now = Date.now()
  return {
    id: 41, scope: SIDE_SCOPE, step: 0, recipeName: 'Green beans', label: 'Green beans · Simmer the beans', durationSeconds: 600, state: 'running',
    remainingSeconds: 252, endsAt: new Date(now + 252_000).toISOString(), startedAt: new Date(now - 348_000).toISOString(), ...over,
  }
}

/** A one-Course TimelineView equivalent to a two-part CookView (the old single-Recipe meal payload): main Course, same Steps and Advance Steps. */
export function oneCourseTimeline(v: CookView, over: Partial<TimelineView> = {}): TimelineView {
  const date = v.meal?.date ?? '2026-11-09'
  const mealSlotId = v.meal?.mealSlotId ?? 2
  let at = 0
  const items: TimelineItem[] = v.steps.map((s) => {
    const startSeconds = at
    at += s.durationMinutes * 60
    return {
      courseId: 1, scope: v.scope, kind: s.kind === 'passive' ? 'passive' : 'active', step: s.index, number: s.number, text: s.text,
      durationMinutes: s.durationMinutes, startSeconds, endSeconds: at, uses: s.uses, imageUrl: s.imageUrl, timer: s.timer, after: s.after ?? [],
    }
  })
  return {
    date, mealSlotId, slotName: 'Dinner', time: '19:00', startAt: `${date}T18:00:00Z`, totalMinutes: Math.round(at / 60),
    courses: [{ courseId: 1, name: 'Main', recipeId: v.recipeId, recipeName: v.recipeName, scope: v.scope, batches: v.batches, fresh: true, state: 'planned' }],
    advance: v.advance.map((a) => ({ courseId: 1, scope: v.scope, ...a })),
    items,
    ...over,
  }
}
