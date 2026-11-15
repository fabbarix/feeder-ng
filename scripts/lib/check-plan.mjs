#!/usr/bin/env node
// The changed mode of scripts/check.sh (CHECK_SINCE=<git ref>): which checks a diff can affect, and why.
//   node scripts/lib/check-plan.mjs --since REF [--env FILE]       the files changed since REF (merge base, working tree and untracked)
//   node scripts/lib/check-plan.mjs --files a,b,c [--env FILE]     the same plan for a given list (tests)
//   node scripts/lib/check-plan.mjs --since REF --layout           only the page-layout part (scripts/check-page-layout.sh --changed-since)
// It prints one line per decision ("vitest: related to 3 file(s): ...") and writes the plan as shell assignments (PLAN_*) to FILE.
// It is conservative: a file it cannot place selects the whole of the part it may affect, and the whole check when it is the check
// itself (scripts/check.sh, this file). The default profiles (full, ci) never read it: they keep their full coverage.
//
// The rules, in short (docs/dev/checks.md has the table):
//   web/src ts/tsx      typecheck, UI guards, `vitest related` on the file, the page-layout routes whose feature imports it
//   web/src css, other  the same, and the vitest files that read it from disk (they name it, or walk every stylesheet)
//   ui/ app/ theme/ styles*.css main.tsx sw/ index.html public/      every page-layout route and the shell layout guard
//   web config (package.json, lockfile, vite, tsconfig, src/test/)   every web check
//   Go file             go vet and go test of its package and every package that imports it (go list -deps), the BDD features
//                       tagged with its area (check-areas.mjs), the page-layout routes of that area; a _test.go file: its package
//   go.mod, go.sum      every Go package and every BDD feature
//   bdd/                the features tagged with a changed feature's area; a step file: every feature
//   page-layout guard   (driver, rules, probes, seed) every route; a scenario module: its scenarios
//   scripts/test/*_test.sh  itself; any other file: the shell tests that name it (path or file name) or list it in `# check-paths:`
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { GO_AREAS } from './check-areas.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

// ---------------------------------------------------------------------------------------------------------------------- changed files
/** The files changed since `since`: committed since the merge base, staged, unstaged and untracked (both names of a rename). */
export function changedFiles(since, root = ROOT) {
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const base = git('merge-base', since, 'HEAD').trim()
  const out = new Set()
  for (const line of git('diff', '--name-status', '-M', base).split('\n')) {
    const parts = line.split('\t').slice(1)
    for (const p of parts) if (p) out.add(p)
  }
  for (const p of git('ls-files', '--others', '--exclude-standard').split('\n')) if (p) out.add(p)
  return [...out].sort()
}

// ------------------------------------------------------------------------------------------------------------------- web import graph
const SRC = 'web/src'
const CODE = /\.(ts|tsx|mjs|js)$/
const isTest = (f) => /\.test\.(ts|tsx)$|\.test-helper\.(ts|tsx)$|\.fixture\.(ts|tsx)$|(^|\/)test\//.test(f)
function walk(dir, root = ROOT) {
  const out = []
  let entries = []
  try {
    entries = readdirSync(join(root, dir), { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = `${dir}/${e.name}`
    if (e.isDirectory()) out.push(...walk(p, root))
    else out.push(p)
  }
  return out
}
const IMPORT = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g
function resolveImport(from, spec, root) {
  if (!spec.startsWith('.')) return null
  const base = join(dirname(from), spec)
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    try {
      if (statSync(join(root, c)).isFile()) return c
    } catch {
      /* next candidate */
    }
  }
  return null
}
/** web/src file -> the web/src files it imports (static, dynamic and side-effect imports, stylesheets included). */
export function importGraph(root = ROOT) {
  const graph = new Map()
  for (const f of walk(SRC, root)) {
    if (!/\.(ts|tsx)$/.test(f) || isTest(f)) continue
    const text = readFileSync(join(root, f), 'utf8')
    const deps = new Set()
    for (const m of text.matchAll(IMPORT)) {
      const r = resolveImport(f, m[1] ?? m[2], root)
      if (r) deps.add(r)
    }
    graph.set(f, deps)
  }
  return graph
}
function closure(entries, graph) {
  const seen = new Set()
  const stack = [...entries]
  while (stack.length) {
    const f = stack.pop()
    if (seen.has(f)) continue
    seen.add(f)
    for (const d of graph.get(f) ?? []) stack.push(d)
  }
  return seen
}

/** Route pattern -> the web/src files its screen imports (its feature's index.ts line, then the lazy screen it loads). */
export function routeSources(routes, root = ROOT, graph = importGraph(root)) {
  const entryOf = new Map()
  for (const f of walk(`${SRC}/features`, root)) {
    if (!/\/features\/[^/]+\/index\.tsx?$/.test(f)) continue
    const text = readFileSync(join(root, f), 'utf8')
    const at = [...text.matchAll(/path:\s*'([^']+)'/g)]
    at.forEach((m, i) => {
      const chunk = text.slice(m.index, at[i + 1]?.index ?? text.length)
      const lazy = /import\(\s*'([^']+)'\s*\)/.exec(chunk)
      const viaVar = /lazyScreen\((\w+)\s*,/.exec(chunk)
      let entry = lazy ? resolveImport(f, lazy[1], root) : null
      if (!entry && viaVar) {
        const def = new RegExp(`const ${viaVar[1]}\\s*=\\s*\\(\\)\\s*=>\\s*import\\(\\s*'([^']+)'`).exec(text)
        if (def) entry = resolveImport(f, def[1], root)
      }
      if (!entryOf.has(m[1])) entryOf.set(m[1], [f, entry].filter(Boolean))
    })
  }
  const out = new Map()
  for (const [pattern] of routes) {
    const entries = entryOf.get(pattern)
    out.set(pattern, entries ? closure(entries, graph) : null) // null: no feature declares it (every change selects it)
  }
  return out
}

// ----------------------------------------------------------------------------------------------------------------------------- rules
/** web files whose change touches every page (the shell, the shared primitives, the stylesheet, the build). */
const WEB_EVERY_ROUTE = /^web\/(src\/(ui|app|theme|sw|dev)\/|src\/styles[^/]*\.css$|src\/main\.tsx$|index\.html$|public\/)/
const WEB_CONFIG = /^web\/(package\.json|pnpm-lock\.yaml|vite\.config\.ts|vite\.phosphor-weights\.ts|tsconfig[^/]*\.json|src\/test\/)/
const LAYOUT_EVERY = /^(scripts\/check-page-layout\.(sh|mjs|exempt|modes)|scripts\/check-page-layout\.modes\.d\/|scripts\/lib\/page-layout(-[a-z-]+)?\.(mjs|js)$|scripts\/lib\/page-layout\/(?!scenarios\/)|scripts\/test\/fixtures\/page-layout-seed)/
const LAYOUT_SCENARIO = /^scripts\/lib\/page-layout\/scenarios\/([^/]+\.mjs)$/
const SHELL_LAYOUT = /^scripts\/(check-shell-layout\.(sh|mjs))$/
const UI_GUARDS = /^(scripts\/check-ui[^/]*|scripts\/check-ui\.(d|rules\.d)\/|GLOSSARY\.md$)/
const GO_ALL = /^(go\.mod|go\.sum)$/
const WHOLE_CHECK = /^scripts\/(check\.sh|lib\/check-plan\.mjs)$/
// Generic names that would select every shell test that mentions them in passing.
const GENERIC = new Set(['index.ts', 'index.tsx', 'index.mjs', 'README.md', 'main.go', 'store.go', 'httpapi.go', 'service.go', 'types.go', 'wire.go', 'package.json'])

/** The Go package (import path suffix, "./internal/x") a repo file belongs to: the nearest directory with a .go file. */
function goPackageOf(file, goDirs) {
  let d = dirname(file)
  while (d && d !== '.') {
    if (goDirs.has(d)) return d
    d = dirname(d)
  }
  return null
}
/** Go package dirs (relative) with, for each, the relative dirs it depends on (production and test imports, transitively). */
function goGraph(root) {
  const fmt = '{{.Dir}}\t{{join .Deps " "}}\t{{join .TestImports " "}} {{join .XTestImports " "}}\t{{.ImportPath}}'
  const text = execFileSync('go', ['list', '-buildvcs=false', '-e', '-f', fmt, './...'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 })
  const byPath = new Map()
  const rows = []
  for (const line of text.split('\n')) {
    if (!line) continue
    const [dir, deps, testImports, path] = line.split('\t')
    const rel = relative(root, dir)
    byPath.set(path, rel)
    rows.push({ rel, deps: deps.split(' ').filter(Boolean), testImports: testImports.split(' ').filter(Boolean), path })
  }
  const depsOf = new Map(rows.map((r) => [r.path, r.deps]))
  const graph = new Map()
  for (const r of rows) {
    const all = new Set(r.deps)
    for (const t of r.testImports) {
      all.add(t)
      for (const d of depsOf.get(t) ?? []) all.add(d)
    }
    graph.set(r.rel, new Set([...all].map((p) => byPath.get(p)).filter(Boolean)))
  }
  return graph
}

function shellTests(root) {
  return readdirSync(join(root, 'scripts/test'))
    .filter((n) => n.endsWith('_test.sh'))
    .sort()
    .map((n) => {
      const file = `scripts/test/${n}`
      const text = readFileSync(join(root, file), 'utf8')
      const paths = [...text.matchAll(/^# check-paths:\s*(.+)$/gm)].flatMap((m) => m[1].trim().split(/\s+/))
      // `# check-paths-only`: only the listed paths select the test, not the files its text names (a test that names many files
      // as data, as this planner's own test does).
      return { file, text, paths, only: /^# check-paths-only\b/m.test(text) }
    })
}

/**
 * The plan for a list of changed files. Returns { parts, reasons } where parts holds:
 *   ui, typecheck, build, shellLayout: booleans; vitest: 'none' | 'all' | 'related'; vitestFiles: files for `vitest related`
 *   go: 'none' | 'all' | dirs; bdd: 'none' | 'all' | areas; layoutRoutes: 'all' | patterns; layoutScenarios: names; shell: test files
 */
export async function plan(files, root = ROOT) {
  const reasons = []
  const why = (part, text) => reasons.push(`${part}: ${text}`)
  const p = { ui: false, typecheck: false, build: false, shellLayout: false, vitest: 'none', vitestFiles: new Set(), vitestAll: false, go: new Set(), goAll: false, bdd: new Set(), bddAll: false, routes: new Set(), routesAll: false, scenarios: new Set(), shell: new Set(), whole: false }
  const { ROUTES, SCENARIOS } = await import(pathToFileURL(join(root, 'scripts/lib/page-layout-rules.mjs')).href)
  let routeSrc = null
  const routeSourcesOnce = () => (routeSrc ??= routeSources(ROUTES, root))
  let goG = null
  let goDirs = null
  const goOnce = () => {
    if (!goG) {
      goG = goGraph(root)
      goDirs = new Set(goG.keys())
    }
    return goG
  }
  const tests = shellTests(root)
  const webTests = walk(SRC, root).filter((f) => /\.test\.(ts|tsx)$/.test(f))
  let webTestText = null
  const testTexts = () => (webTestText ??= new Map(webTests.map((f) => [f, readFileSync(join(root, f), 'utf8')])))
  const exists = (f) => existsSync(join(root, f))

  for (const f of files) {
    if (WHOLE_CHECK.test(f)) {
      p.whole = true
      why('everything', `${f} is the check itself`)
      continue
    }
    // ------------------------------------------------------------------------------------------------------------------ web
    if (f.startsWith('web/') && !f.startsWith('web/dist/') && !f.endsWith('.go')) {
      p.ui = true
      p.typecheck = true
      if (WEB_CONFIG.test(f)) {
        p.vitestAll = true
        p.routesAll = true
        p.shellLayout = true
        why('web', `${f} is web configuration: every vitest file, every page-layout route`)
      } else if (f.startsWith(`${SRC}/`)) {
        if (CODE.test(f) && exists(f)) p.vitestFiles.add(f)
        // Tests that read the file from disk name it (or, for a stylesheet, walk every stylesheet).
        const name = basename(f)
        if (!CODE.test(f) || !exists(f)) {
          for (const [t, text] of testTexts()) {
            if (text.includes(name) || (f.endsWith('.css') && /cssWalk|sweepStylesheets|sweepRules|sweep\.test-helper|readStylesCss|readdirSync|globSync|import\.meta\.glob/.test(text))) p.vitestFiles.add(t)
          }
        }
        if (isTest(f)) {
          // a test file selects itself only
        } else if (WEB_EVERY_ROUTE.test(f)) {
          p.routesAll = true
          p.shellLayout = true
          why('page-layout', `${f} is shared (ui/, app/, theme/, styles, the shell): every route and the shell layout guard`)
        } else {
          const hit = []
          for (const [pattern, src] of routeSourcesOnce()) if (src === null || src.has(f)) hit.push(pattern)
          if (hit.length) {
            hit.forEach((r) => p.routes.add(r))
            why('page-layout', `${f} is imported by ${hit.join(' ')}`)
          } else why('page-layout', `${f}: no route imports it`)
        }
      } else if (WEB_EVERY_ROUTE.test(f)) {
        p.routesAll = true
        p.shellLayout = true
        why('page-layout', `${f}: every route and the shell layout guard`)
      }
    }
    // ------------------------------------------------------------------------------------------------------------------- Go
    const isGo = f.endsWith('.go') || /^(internal|cmd)\//.test(f)
    if (GO_ALL.test(f)) {
      p.goAll = true
      p.bddAll = true
      why('go', `${f}: every package and every BDD feature`)
    } else if (f.startsWith('bdd/')) {
      p.go.add('bdd')
      if (f.endsWith('.feature')) {
        const area = bddAreaOf(f, root)
        if (area) {
          p.bdd.add(area)
          why('bdd', `${f}: @area-${area}`)
        } else {
          p.bddAll = true
          why('bdd', `${f}: no area tag, every feature`)
        }
      } else {
        p.bddAll = true
        why('bdd', `${f}: step definitions, every feature`)
      }
    } else if (isGo) {
      goOnce()
      const pkg = goPackageOf(f, goDirs) ?? (f.endsWith('.go') ? dirname(f) : null)
      if (!pkg) {
        why('go', `${f}: in no Go package`)
      } else if (f.endsWith('_test.go')) {
        p.go.add(pkg)
        why('go', `${f}: test file, its package ${pkg}`)
      } else {
        const rdeps = [...goG].filter(([, deps]) => deps.has(pkg)).map(([d]) => d)
        p.go.add(pkg)
        rdeps.forEach((d) => p.go.add(d))
        why('go', `${f}: ${pkg} and the ${rdeps.length} package(s) that import it`)
        if (rdeps.includes('bdd') || pkg === 'bdd') {
          const area = goArea(pkg)
          if (area === null || area.bdd === 'all') {
            p.bddAll = true
            why('bdd', `${pkg}: shared package, every feature`)
          } else {
            area.bdd.forEach((a) => p.bdd.add(a))
            if (area.bdd.length) why('bdd', `${pkg}: @area-${area.bdd.join(' @area-')}`)
          }
        }
        if (!/^(bdd|internal\/testkit|cmd\/fakeanthropic|docs\/)/.test(pkg)) {
          const area = goArea(pkg)
          if (area === null || area.routes === 'all') {
            p.routesAll = true
            why('page-layout', `${pkg}: shared package, every route`)
          } else if (area.routes.length) {
            area.routes.forEach((r) => p.routes.add(r))
            why('page-layout', `${pkg}: ${area.routes.join(' ')}`)
          }
        }
      }
    }
    // ----------------------------------------------------------------------------------------------------------- guards
    if (UI_GUARDS.test(f)) {
      p.ui = true
      why('ui', `${f}: the UI guards`)
    }
    if (LAYOUT_EVERY.test(f)) {
      p.routesAll = true
      p.vitestFiles.add(`${SRC}/app/pageLayoutSources.ts`)
      if (CODE.test(f)) p.vitestFiles.add(f)
      why('page-layout', `${f} is the guard or its seed: every route`)
    }
    const sc = LAYOUT_SCENARIO.exec(f)
    if (sc) {
      p.vitestFiles.add(`${SRC}/app/pageLayoutSources.ts`)
      if (exists(f)) {
        const mod = (await import(pathToFileURL(join(root, f)).href)).default
        const names = (mod?.scenarios ?? []).map((s) => s.name)
        names.forEach((n) => p.scenarios.add(n))
        why('page-layout', `${f}: scenario(s) ${names.join(' ') || '(none)'}`)
      } else {
        p.routesAll = true
        why('page-layout', `${f} was removed: every route`)
      }
    }
    if (SHELL_LAYOUT.test(f)) {
      p.shellLayout = true
      why('shell-layout', `${f}`)
    }
    // ------------------------------------------------------------------------------------------------------- shell tests
    const name = basename(f)
    for (const t of tests) {
      // A shell test names a file by its path, or by a file name specific enough (not index.ts, not a two-letter name). The other
      // shell tests a test names are not selected by it: a changed test runs itself.
      const testFile = /^scripts\/test\/[^/]+_test\.sh$/.test(f)
      const named = t.file === f || (!testFile && !t.only && (t.text.includes(f) || (!GENERIC.has(name) && name.length >= 6 && t.text.includes(name))))
      const listed = t.paths.some((x) => f === x || f.startsWith(x.endsWith('/') ? x : `${x}/`))
      if (named || listed) {
        if (!p.shell.has(t.file)) why('shell', `${t.file} (${t.file === f ? 'changed' : named ? `names ${f}` : `check-paths covers ${f}`})`)
        p.shell.add(t.file)
      }
    }
  }

  // Unify.
  if (p.whole) {
    return { whole: true, reasons }
  }
  if (p.vitestAll) p.vitest = 'all'
  else if (p.vitestFiles.size) p.vitest = 'related'
  const routes = p.routesAll ? 'all' : [...p.routes]
  // A selected route brings its scenarios (and their walks).
  if (!p.routesAll) for (const s of SCENARIOS) if (p.routes.has(s.route)) p.scenarios.add(s.name)
  const layout = p.routesAll || p.routes.size > 0 || p.scenarios.size > 0
  return {
    whole: false,
    reasons,
    ui: p.ui,
    typecheck: p.typecheck,
    vitest: p.vitest,
    vitestFiles: [...p.vitestFiles].sort(),
    build: layout || p.shellLayout || p.typecheck,
    layout,
    layoutRoutes: routes,
    layoutScenarios: p.routesAll ? [] : [...p.scenarios],
    shellLayout: p.shellLayout,
    go: p.goAll ? 'all' : [...p.go].sort(),
    bdd: p.bddAll ? 'all' : [...p.bdd].sort(),
    shell: [...p.shell].sort(),
  }
}

/** A feature file's area: its @area-<name> tag. */
function bddAreaOf(f, root) {
  try {
    const m = /@area-([a-z0-9-]+)/.exec(readFileSync(join(root, f), 'utf8'))
    return m ? m[1] : null
  } catch {
    return null
  }
}
/** The area entry of a Go package dir (internal/<area>/...), or null: a shared package. */
function goArea(pkg) {
  const m = /^internal\/([^/]+)/.exec(pkg)
  return m && GO_AREAS[m[1]] ? GO_AREAS[m[1]] : null
}

// ------------------------------------------------------------------------------------------------------------------------------ CLI
const q = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`
export function toEnv(pl) {
  if (pl.whole) return 'PLAN_WHOLE=1\n'
  const list = (v) => (Array.isArray(v) ? v.join(' ') : v)
  const lines = {
    PLAN_WHOLE: 0, PLAN_UI: +pl.ui, PLAN_TYPECHECK: +pl.typecheck, PLAN_VITEST: pl.vitest, PLAN_VITEST_FILES: list(pl.vitestFiles),
    PLAN_BUILD: +pl.build, PLAN_LAYOUT: +pl.layout, PLAN_LAYOUT_ROUTES: list(pl.layoutRoutes), PLAN_LAYOUT_SCENARIOS: list(pl.layoutScenarios),
    PLAN_SHELL_LAYOUT: +pl.shellLayout, PLAN_GO: list(pl.go), PLAN_BDD: list(pl.bdd), PLAN_SHELL: list(pl.shell),
  }
  return Object.entries(lines).map(([k, v]) => `${k}=${q(v)}`).join('\n') + '\n'
}
export function summary(pl, files) {
  const out = [`check plan: ${files.length} changed file(s)`]
  for (const f of files.slice(0, 40)) out.push(`  ${f}`)
  if (files.length > 40) out.push(`  … and ${files.length - 40} more`)
  out.push('why:')
  for (const r of pl.reasons) out.push(`  ${r}`)
  if (pl.whole) {
    out.push('runs: the whole check (the check itself changed)')
    return out.join('\n')
  }
  const n = (v) => (v === 'all' ? 'all' : v.length ? v.join(' ') : 'none')
  out.push('runs:')
  out.push(`  UI guards: ${pl.ui ? 'yes' : 'no'}; typecheck: ${pl.typecheck ? 'yes' : 'no'}`)
  out.push(`  vitest: ${pl.vitest === 'related' ? `related to ${pl.vitestFiles.length} file(s)` : pl.vitest}`)
  out.push(`  vite build: ${pl.build ? 'yes' : 'no'}; shell layout guard: ${pl.shellLayout ? 'yes' : 'no'}`)
  out.push(`  page layout: ${pl.layout ? `routes ${n(pl.layoutRoutes)}${pl.layoutScenarios.length ? `; scenarios ${pl.layoutScenarios.join(' ')}` : ''}` : 'none'}`)
  out.push(`  go vet + go test: ${n(pl.go)}`)
  out.push(`  BDD areas: ${pl.bdd === 'all' ? 'all' : pl.bdd.length ? pl.bdd.map((a) => `@area-${a}`).join(' ') : 'none'}`)
  out.push(`  shell tests: ${n(pl.shell)}`)
  return out.join('\n')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = (name) => {
    const i = process.argv.indexOf(`--${name}`)
    return i > 0 ? process.argv[i + 1] : undefined
  }
  const since = arg('since')
  const given = arg('files')
  if (!since && given === undefined) {
    console.error('check-plan: --since REF or --files a,b,c')
    process.exit(2)
  }
  let files
  try {
    files = given !== undefined ? given.split(',').filter(Boolean) : changedFiles(since)
  } catch (e) {
    console.error(`check-plan: cannot list the files changed since ${since} (${String(e.stderr ?? e.message).trim()})`)
    process.exit(2)
  }
  const pl = await plan(files)
  if (process.argv.includes('--layout')) {
    // scripts/check-page-layout.sh --changed-since: "all", or the routes and scenarios, one "routes=" and one "scenarios=" line.
    if (pl.whole) console.log('routes=all\nscenarios=')
    else console.log(`routes=${pl.layout ? (pl.layoutRoutes === 'all' ? 'all' : pl.layoutRoutes.join(',')) : ''}\nscenarios=${pl.layoutScenarios.join(',')}`)
    process.exit(0)
  }
  console.log(summary(pl, files))
  const env = arg('env')
  if (env) writeFileSync(env, toEnv(pl))
}
