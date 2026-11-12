# QA-2: Settings > Notifications on the shared page; Allowlist wording

## 1. Notifications layout
`NotificationSettingsScreen` renders its own `<main class="notifications">` with `padding: 16px; max-width: 640px; margin: 0 auto`. The shell already provides the one `<main>` and the narrow (720) page container (`/settings/*` in `pageWidths.ts`), so the screen was nested, double-padded and narrower than its sibling Settings pages (QA screenshots `d-notif-*`, `notif-1280-*`).

Design:
- Root is `<ListPage header={<PageHeader title breadcrumbs />}>`, as `CoursesPage` does. The Tiles (loading, error, `NotificationSettingsView`) go in the list slot; `span="full"` is kept.
- Delete the `.notifications` root rule from `notifications.css` (no max-width, padding or margin of its own). The inner `.notifications__*` rules stay.
- No `<main>` anywhere in the screen.
- Guard: `/settings/notifications` is already in `ROUTES` (narrow) but was missing from `fail_routes` in `scripts/check-page-layout.modes`; add it so the guard fails on regressions.

## 2. "guest" on Settings > Allowlist
Finding: no copy on the Allowlist page says "guest". The `avoid: ["guest"]` hit in the QA scan comes from the seeded data (`guest.one@example.test`, `guest.two@example.test`), i.e. user content. "Guest" is only a GLOSSARY _Avoid_ word (under Attendance, Course Attendance); there is no defined term "Guest". Allowlist strings (`allowlist`, `allowlistPanel.*`, the Settings index row) use User, Admin, Sign-in requests: no conflict. No wording change is needed; the QA scan should treat seeded emails as data. A green guard test pins that the page copy has no guest, invite or join request word.

Out of scope here: "People can also ask to join" and "Who asked to join" use "join", which is not on the Access Request _Avoid_ list (it lists "join request"); left as is. Sign-in/access copy belongs to another team.

## Tests (red first)
- `notifications/components/NotificationSettingsScreen.layout.test.tsx`: no `<main>`, root is `.list-page` with the PageHeader in its header slot, Tile in the list slot, no `.notifications` root.
- `notifications/notifications.css.test.ts`: no `.notifications` rule with max-width, padding or margin.
- `notifications/guards.test.ts`: in `ROUTES` as narrow (green); fail route in the modes file (red).
- `settings/screens/AllowlistPage.glossary.test.tsx`: no avoided word in the page copy (green guard).
