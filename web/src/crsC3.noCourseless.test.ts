// CRS C3 (docs/dev/design/crs-c3.md 4, "greps that nothing still sends a course-less key or a two-part scope").
// The SPA always uses the real id of a Course. This reads the production sources and fails on every fallback that
// stood for the main Course: `courseId ?? 0`, a made-up courseId 0, a key built without its Course, the two-part scope.
//
// MealTile, TonightHero, PlannedMealSheet and CourseRow are scanned too: SF-chips has merged (crs-c3.md 6).
import { describe, expect, it } from 'vitest'

const raw = import.meta.glob(['./**/*.ts', './**/*.tsx', '!./**/*.test.*', '!./**/*.d.ts', '!./**/test-utils*', '!./**/*fixtures*', '!./**/Gallery.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const files = Object.entries(raw).map(([path, text]) => ({ path: path.replace(/^\.\//, ''), text }))

/** Every production line that matches, as "file:line  text". */
function hits(pattern: RegExp, only?: RegExp): string[] {
  const found: string[] = []
  for (const f of files) {
    if (only && !only.test(f.path)) continue
    f.text.split('\n').forEach((line: string, i: number) => {
      if (pattern.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line)) found.push(`${f.path}:${i + 1}  ${line.trim()}`)
    })
  }
  return found
}

describe('no course-less fallback is left in the SPA', () => {
  it('scans the sources', () => {
    expect(files.length).toBeGreaterThan(200)
  })

  it('no `courseId ?? 0`: a missing Course is not the main Course', () => {
    expect(hits(/courseId\s*\?\?\s*0\b/)).toEqual([])
  })

  it('no made-up Course with the id 0 or the name "Main"', () => {
    expect(hits(/courseId:\s*0\b/)).toEqual([])
    expect(hits(/courseName:\s*'Main'/)).toEqual([])
    expect(hits(/courseName\s*\?\?\s*'Main'/)).toEqual([])
  })

  it('no plan route or key built with or without its Course depending on the key', () => {
    expect(hits(/key\.courseId\s*===\s*undefined/)).toEqual([])
    expect(hits(/courseId\s*\?\s*\{\s*date/)).toEqual([])
    expect(hits(/courseId\s*===\s*undefined\s*\?\s*\{\s*date/)).toEqual([])
    expect(hits(/courseId\s*!==\s*undefined\s*\?\s*\{\s*courseId/)).toEqual([])
  })

  it('the plan and cook libraries read the Course rows, not the slot\'s own meal and unfilled', () => {
    expect(hits(/\bslot\.(meal|unfilled)\b/, /^features\/(plan\/lib\/(courses|hero)|board\/lib\/tiles)\.ts$/)).toEqual([])
    expect(hits(/\bs\.meal\b/, /^features\/plan\/lib\/regenerate\.ts$/)).toEqual([])
  })

  it('no two-part Planned Meal scope is written', () => {
    expect(hits(/`meal:\$\{[^}]+\}\/\$\{[^}]+\}`/)).toEqual([])
    expect(hits(/mainCourseId/, /^features\/cook\/lib\//)).toEqual([])
  })

  it('no cook screen or hook looks the main Course up to read a scope', () => {
    expect(hits(/useCourses\(\)\.main/, /^features\/cook\//)).toEqual([])
  })
})
