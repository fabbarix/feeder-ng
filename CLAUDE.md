# Feeder

Family meal-planning app: a Go backend with an embedded React (pnpm) SPA and SQLite on `/data`.

## Sources of truth
- [GLOSSARY.md](GLOSSARY.md): the domain language. Use these terms in UI copy, code identifiers and docs; never use a word listed under `_Avoid_`.
- [docs/adr/](docs/adr/): architectural decisions. Don't reverse one without writing a new ADR.
- [docs/design/ux-brief.md](docs/design/ux-brief.md): look, feel and UX. The chosen direction is **Bento**.

## Agent workflow

Roles (model in brackets):

- **Main agent**, the session talking to the user. Does **no direct work**: no code, specs, tests or reviews. It delegates everything to the Project Manager, reports progress to the user, relays the user's changes and interventions, and stays available at all times. Long-running work goes to background agents so the main agent is never blocked.
- **Project Manager** [Opus 5.5]. Breaks the specs into features and tasks, decides which can run in parallel, and creates **as many teams as can work independently**, each in its own git worktree and branch. It assigns the work, tracks progress, sequences merges and reports status to the main agent. It does no implementation itself.
- **Each team** runs one feature through this pipeline:
  1. **Designer / test author** [Sonnet 5.5]: designs the feature from the spec and writes the test cases first: **unit tests** and **BDD scenarios** (Gherkin).
  2. **Developer** [Haiku 5.5]: implements the code until the tests pass, following the code structure rules below.
  3. **Reviewer** [Opus 5.5]: checks the diff against the spec, GLOSSARY, ADRs, conventions and tests, then approves it or sends it back to step 1 or 2. **Nothing merges without this approval.**

Parallel-work rules:

- Two teams never touch the same files at the same time. When work overlaps, the Project Manager serialises it.
- Never use `git stash`, because it is shared across all worktrees.
- Each worktree writes its check output to `<worktree>/build/check.log`, never to a shared file.
- Don't generate synthetic load (busy loops, stress tests), because it breaks other teams' tests.
- Start servers detached (`setsid`/`nohup`) with a log file; don't keep an agent watching their output.
- Merge and deploy chains are gated on checks with `&&`, so they stop as soon as the checks fail.

## Code structure

### Frontend (React)
- **Components are small, focused and reusable.** A component renders and wires events; nothing more. If one grows beyond a single responsibility, split it.
- **No business logic in components.** Planning rules, portion and leftover maths, unit conversion, stock calculations, list derivation, scan handling, data fetching and sync all live in:
  - **hooks** (`useShoppingList`, `useCookMode`, …): React-facing state and effects, which call into libraries;
  - **libraries/modules** (plain TypeScript, no React imports): pure domain functions, which are unit-tested on their own.
- Components get data and callbacks from hooks or props; they never call the API or compute domain values inline.
- Build Bento tiles, chips, timers and the scanner viewfinder as shared primitives, and compose screens from them. Never copy markup between screens.
- **No native browser UI.** Buttons, selects, alerts and other controls (checkboxes, radios, date and number pickers) are always our own purpose-built, designed shared components, never the browser's default look or behaviour:
  - Never call `alert`, `confirm` or `prompt`. Use crafted dialogs built on the `<dialog>` element, and toasts for transient feedback.
  - Never use a native `<select>`. Our select boxes have crafted option layouts: thumbnails, subheaders, search and filter, sorting, as the use case needs.
  - Icons come only from [Phosphor Icons](https://phosphoricons.com/), through our shared icon component.
  - Under the styling, components still use the right semantic element and ARIA (a real `<button>`, a `<dialog>`, listbox roles) so they stay keyboard- and screen-reader-accessible.

### Backend (Go)
- Apply the same rule: HTTP handlers are thin (parse, call, respond). Domain logic lives in packages with no HTTP or SQL concerns, and those packages are unit-tested directly.
