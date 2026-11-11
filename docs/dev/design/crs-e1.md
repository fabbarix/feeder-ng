# CRS E1: Recipe File Courses, Import Review, Agent Prompt, Recipe Assistant

Team E1 of [crs-plan.md](crs-plan.md) (workstream E, wave 2, backend and docs; E2 does the web after D1, C1 and E1). Spec: functional-spec 13 and 16, [recipe-file.md](../../spec/recipe-file.md). Decision: [ADR 0008](../../adr/0008-courses.md) (point 3 and the Consequences on the Recipe File).

E1 owns `docs/spec/recipe-file.md`, `docs/spec/recipe-file-v1.schema.json`, `docs/spec/examples/**`, `internal/recipefile/**` (the `httpapi` and `store` packages included: they are the Recipe File's) and `internal/recipeassistant/**`. It does not touch GLOSSARY, CHANGELOG, `functional-spec.md`, the other stores (it calls `internal/course`, `internal/recipe/store` and `internal/course/store` through their APIs and, in one place, SQL, see 5) or `web`.

## 1. The Recipe File

Both fields are optional additions to a Recipe, so the format stays **version 1**.

| Field | Schema | Meaning |
|---|---|---|
| `courses` | `{ "type": "array", "uniqueItems": true, "maxItems": 20, "items": { "type": "string", "minLength": 1, "maxLength": 40 }, "description": ... }` | Course names. No `enum` (the schema is the same for every Household; the names reach the model through the prompt). `[]` and absent both mean the main Course. |
| `wholeMeal` | `{ "type": ["boolean", "null"], "description": ... }`, **no `default`** | `null` and absent both mean "use the default" (below). |

The schema patch is exactly this, after `readyMeal` (the `description` texts are the ones in the Recipe Assistant golden, so copy them):

```json
"courses": {
  "description": "Names of the Courses this Recipe can fill (for example \"Main\", \"Side\"), taken from the list in the prompt. Omit it, or leave it empty, for the main Course.",
  "type": "array", "uniqueItems": true, "maxItems": 20,
  "items": { "type": "string", "minLength": 1, "maxLength": 40 }
},
"wholeMeal": {
  "description": "true when the Recipe needs no other Course beside it; false when it does; null or omitted when unknown (a Ready Meal in the main Course then counts as a Whole meal).",
  "type": ["boolean", "null"]
},
```

`uniqueItems` compares the exact strings; two spellings of one Course ("Side", "side") are legal in the file and count once on import (3.1).

`docs/spec/recipe-file.md` is already updated by this design commit: the two table rows, Import Review step 5 (Courses), the Agent Prompt paragraph, **rule 8** reworded (the plan's text: "main protein, cooking method or style, e.g. "chicken", "traybake", "vegetarian""; "dish type" and "soup" gone) and two new rules, **13 Courses** (holding `{{COURSES}}`) and **14 Whole meal**. `internal/recipeassistant/testdata/agent-prompt-template.golden.txt` is regenerated from it and `output-schema.golden.json` from the schema patch above (so `TestOutputSchemaMatchesTheGoldenFile` is red until the developer applies the patch). The developer also puts `courses` and `wholeMeal` into `docs/spec/examples/recipe-file-example.json`: the traybake `"courses": ["Main"], "wholeMeal": true`, the Ready Meal `"courses": ["Main"]` with `"wholeMeal": true` (it teaches the model the field). No example test counts break (9 Ingredients, 2 Recipes).

Go (`internal/recipefile/file.go`, stubbed): `Recipe.Courses []string` (`omitempty`) and `Recipe.WholeMeal *bool` (`omitempty`). A pointer, so `false` is written and kept; `null` decodes to `nil`.

## 2. Export

`Build` writes, per Recipe: `Courses` = the names of `recipe.Recipe.Courses` in the order the store gives them (household order), and `WholeMeal` = a copy of `recipe.Recipe.WholeMeal` (a stored Recipe always has it set, so export always writes it, `false` included). A Recipe with no Courses and no `WholeMeal` (a caller that has none) writes neither. `Exportable` needs no change (`recipes.Get` already loads both). The exported file validates against the schema and round-trips.

## 3. Import Review (pure, `internal/recipefile`)

### 3.1 Input

`Existing.Courses []CourseRef` (`ID`, `Name`, `Main`, `Archived`): every Course of the Household, **archived ones included, in household order**. The store fills it. **If it is empty** (a caller that does not know Courses: every pre-E1 test) the planner does nothing about Courses: `Input.CourseIDs` stays nil and `Input.WholeMeal` is the file's value or nil, the store then defaults them (create) or keeps them (update). In production it is never empty.

### 3.2 Matching

Per Recipe, each entry of `courses` is cleaned with `course.CleanName` (trim and collapse; an entry with no characters is a **Problem** `course_name_invalid` at `$.recipes[i].courses[j]`) and keyed with `course.NameKey`. Rows are one per distinct key over the **kept** Recipes (a Recipe whose decision is skip lists none), in first-seen order:

| Status | Meaning | Default answer (`Effective`) | `Resolved` |
|---|---|---|---|
| `exact` | matches an active Course | `use` that Course | true |
| `archived` | matches an archived Course | `use` the main Course | true |
| `unknown` | matches no Course | `use` the main Course | true |

`CourseMatch` = `{ name (first spelling, cleaned), key, status, match (CourseRef, for exact and archived), effective, resolved, usedBy (JSON paths) }`; `Plan.Courses` is the list (always present, `[]` when none). Defaults are "use the main Course", so a file with unknown names is `Ready` straight away: Import never creates or unarchives a Course without an answer (spec 13).

### 3.3 Answers (`Decisions.Courses []CourseDecision{key, action, courseId}`)

| Action | For | Effect |
|---|---|---|
| `use` + `courseId` | unknown, archived | the name stands for that **active** Course. An id that is archived or not a Course of the Household makes the commit `ErrStale` (like a missing Recipe to replace). |
| `skip` | unknown, archived | the name is left out |
| `add` | unknown | create the Course (Admin only) |
| `unarchive` | archived | bring the Course back (Admin only) |

An answer for a key not in the file is ignored (as for Ingredients). An answer that does not fit the row (`unarchive` for an unknown name, `add` for a matched one) is ignored and the default stays. The `add` of a name makes a `NewCourse{Key, Name}` (name = the first spelling, cleaned); if the active Courses plus the added ones would pass `course.MaxCourses` (20) the plan has a **Problem** `too_many_courses` at the first use of the name and is not `Ready` (the commit is a `*NotReadyError`). A name taken since is the store's `ErrStale` (5).

Admin-only is enforced by the HTTP layer (3.6), not by the pure planner.

### 3.4 What a Recipe gets (`Commit`)

For every kept Recipe, after answers: the existing Courses it ends up with (matched, used, unarchived), **deduplicated and in household order**, as `Input.CourseIDs`; the added ones as `RecipeCommit.NewCourseKeys` (keys into `Commit.NewCourses`). **If it has none of either** (no `courses`, `[]`, or every name skipped) it gets the main Course: `CourseIDs = [main]`. A Recipe whose only Course is an added one gets no main Course on top. `Commit.NewCourses` lists the added Courses once, in first-seen order; `Commit.UnarchiveCourses` the Course ids to bring back.

### 3.5 Whole meal

Every kept Recipe gets an **explicit** `Input.WholeMeal`, so a Replace never keeps the stored value and a create never depends on the store default: the file's value when it is `true` or `false`; otherwise (absent or `null`) `recipe.DefaultWholeMeal(readyMeal, courseIDs, mainID)` over the **matched** Courses (so an unknown name that falls back to the main Course counts as the main Course, a Ready Meal in Side only is `false`, an added Course is not the main Course). The ADR's point 3 and the Recipe editor use the same function.

### 3.6 HTTP (`internal/recipefile/httpapi`)

- `POST /api/imports` and `/plan` answer the plan with `courses`. `confirm` accepts `decisions.courses`.
- **Admin only**: a `confirm` whose decisions hold an `add` or `unarchive` that applies (a key of the file, on a row it fits) from a User who is not an Admin answers `403 forbidden`, writes nothing and keeps the Review open (the existing "restore on failure" path), so the User can answer again with `use` or `skip`. `plan` does not check (it writes nothing).
- `confirm` answers gain `coursesCreated` and `coursesUnarchived`.
- After a commit that created or unarchived a Course the module publishes the household event `changed: courses` (and `recipes` as today).
- **`GET /api/recipe-file/agent-prompt` builds the prompt per request** from the template and the active Courses (4). `promptOK` becomes "the template was found".

## 4. Agent Prompt

`recipefile.AgentPrompt(template, schema, example string, courses []PromptCourse) string` (the signature changes; every caller is updated in the stubs). `PromptCourse{Name string; Main bool}`.

- `{{SCHEMA}}` and `{{EXAMPLE}}` as before.
- `{{COURSES}}` = the Courses one per line, `- <name>`, and `- <name> (default)` for the main one (the Course "Leave `courses` out" falls back to); joined with `\n`, **no trailing newline** (the template's own newline follows the placeholder). Order = the order given (household order). **No Courses**: the single line `(no Courses defined)`.
- One pass, so a Course named `{{SCHEMA}}` is not expanded again.
- Callers pass the **active** (not archived) Courses in household order: from `recipefile/store` a new method `PromptCourses(ctx) ([]PromptCourse, error)` that reads `courses` (`course/store.List(ctx, false)`).

The template is extracted once; the prompt is built **for every call** (the Recipes screen's Copy Agent Prompt and every Recipe Assistant read), because the Courses are the Household's own.

## 5. Store (`internal/recipefile/store`)

- `Existing`: fills `Courses` (all, archived included, household order, with the main flag).
- `PromptCourses`: as in 4; it implements `service.CourseSource`.
- `Apply` (one transaction, as now), new steps **before the Recipes**: (1) unarchive each `UnarchiveCourses` (a missing id is `ErrStale`; one already active is fine); (2) create each `NewCourses`, last in the order, with the `course` rules (`CleanName`, `NameKey`; a clashing key with any Course, archived ones included, or more than 20 active is `ErrStale`: the Household changed since the review). `internal/course/store.Create` opens its own transaction, so E1 writes the same three statements in the Recipe File transaction (`INSERT INTO courses ...` with `position = MAX + 1`), reusing `course.CleanName` and `course.NameKey`; it does not change the Course store. (3) each Recipe's `Input.CourseIDs` plus the ids of its `NewCourseKeys` go to `CreateTx`/`ReplaceTx`; a Course that no longer exists (foreign key) is `ErrStale`.
- `Result` gains `CoursesCreated` and `CoursesUnarchived`.
- A failed Apply leaves no added Course (the existing rollback).

## 6. Recipe Assistant

- **Output schema**: `OutputSchema` is unchanged; the projection gains `courses` (array of strings, no `enum`, no `uniqueItems`/`maxItems`) and `wholeMeal` (`anyOf` boolean, null) as **required** on each Recipe by the rules it already has. The golden is updated.
- **Prune**: `pruneNone` is unchanged: both fields are optional in the canonical schema, `courses: []` and `wholeMeal: null` are dropped, `false` is kept (`isNone` does not treat a boolean as none). Tests pin it.
- **Prompt**: `service.Deps.Courses` (`CourseSource`, `PromptCourses(ctx)`) is called by `StartRead` for every read; the system prompt is `SystemPrompt(AgentPrompt(template, schema, example, courses))` built per read. A nil source lists no Courses; an error from the source makes `StartRead` return the error (no job, no slot held, no call to the model): the model must not be left to invent Courses. `service.For` wires the `recipefile/store` source.
- **Addendum**: unchanged (its "none" sentence already covers lists and nullable fields).
- The existing `fullAnswer()` test fixture gains `"courses": []`, `"wholeMeal": nil` (the projection requires them).

## 7. Tests (red, written first)

| File | Pins |
|---|---|
| `internal/recipefile/courses_file_test.go` | schema shape (`courses`, `wholeMeal` `["boolean","null"]`, no default, version 1); Parse accepts and rejects (paths); old files parse; the example shows both fields; recipe-file.md documents both and has no "dish type"; export names and `false`; round trip; rule 8 and `{{COURSES}}` in the template; `AgentPrompt` list format, default marker, empty list, no re-expansion |
| `internal/recipefile/courses_import_test.go` | no `courses` and `[]` give the main Course; `NameKey` matching, household order, duplicates once; rows, `usedBy`, skipped Recipes; unknown and archived defaults, `use`, `skip`, `add`, `unarchive`; stale ids; the 20 limit; the invalid-name Problem; empty `Existing.Courses`; Whole meal defaults (Ready Meal, matched Courses, explicit values, Replace explicit, an added Course) |
| `internal/recipefile/store/courses_test.go` | `Existing.Courses`; Apply matched Courses and Whole meal; add (last, cleaned, shared); unarchive; stale on a taken name, on 20 active, on a vanished Course; rollback; Replace takes the file's values; Exportable; cross-Household round trip |
| `internal/recipefile/httpapi/courses_test.go`, `courses_reads_test.go`, `httpapi_test.go` | prompt built per request (rename, archived, added); export fields; unknown Course never created; plan decisions; Admin add and unarchive; a non-Admin gets `403 forbidden`, nothing written, Review kept; round trip over HTTP; a Recipe Assistant read sends the Courses and sees a later change |
| `internal/recipeassistant/courses_test.go`, `outputschema_test.go`, golden files | projection of both fields; `courses: []`/`wholeMeal: null` pruned, `false`/`true`/names kept; the golden template; the output-schema golden |
| `internal/recipeassistant/service/courses_test.go` | per-read Courses in the system prompt, byte-stable, nil source, failing source |

BDD: the Gherkin for `bdd/features/import-export/` and `bdd/features/recipe-assistant/` and their steps are E1's per the plan but need the Course HTTP routes (team C1) to set Courses up; they are written with the developer once C1 has merged. The Go tests above cover the same rows meanwhile.

## 8. Stubs in this commit

Compile-only, no behaviour: `Recipe.Courses/WholeMeal`; `recipefile.PromptCourse` and the new `AgentPrompt` signature (ignores the list, callers pass `nil`); `Existing.Courses`, `CourseRef`, `CourseDecision`, `CourseMatch`, `Decisions.Courses`, `Plan.Courses`, `NewCourse`, `Commit.NewCourses/UnarchiveCourses`, `RecipeCommit.NewCourseKeys`, the `Action*`, `Course*` and `Problem*` constants; `store.Result.CoursesCreated/CoursesUnarchived` and the `confirm` JSON; `service.CourseSource` and `Deps.Courses`. The schema file, the example and every function body are the developer's.

## 9. Open points for the Reviewer

- `use` of an archived Course is `ErrStale` (a User cannot reach it from the UI, which lists active Courses only); an `unarchive` is the way back.
- `add` creates the Course with the first spelling of the file; E2 may let the Admin rename it before confirming only through the Courses page afterwards.
- The plan keeps Course rows of Recipes that are kept, not of skipped ones, so skipping a Recipe drops its Course questions.
