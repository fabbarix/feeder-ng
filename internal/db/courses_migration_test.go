package db_test

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/course"
	"github.com/fabbarix/feeder-ng/internal/db"
)

// Migration 1400 (docs/dev/design/crs-plan.md §1.1 and §1.4, team A): Courses, the Course in the keys of
// Planned Meals, Couldn't plan reasons, Slot Rules and Leftovers, optional Courses, Course Attendance
// opt-outs, `relaxed`, and the cook scopes. Ids are kept; the AUTOINCREMENT counter of planned_meals is carried over.

const mts = "2026-11-01T00:00:00Z"

// seedPre1400 fills a database migrated up to (not including) 1400. It deletes the Planned Meal with the
// highest id, so sqlite_sequence for planned_meals (26) is above max(id) (25).
func seedPre1400(t *testing.T, d *sql.DB) {
	t.Helper()
	mustExec(t, d, `INSERT INTO members(id,name,colour,portion_factor,created_at) VALUES (3,'Anna','#fff',1,?),(5,'Sam','#fff',0.5,?)`, mts, mts)
	mustExec(t, d, `INSERT INTO meal_slots(id,weekday,name,time) VALUES (4,1,'Dinner','19:00'),(6,2,'Lunch','12:30')`)
	mustExec(t, d, `INSERT INTO meal_slot_attendees(slot_id,member_id) VALUES (4,3),(4,5),(6,3)`)
	// Three Recipes: 11 normal, 12 archived, 13 a Ready Meal.
	mustExec(t, d, `INSERT INTO recipes(id,name,yield,ready_meal,archived,created_at,updated_at) VALUES
		(11,'Soup',4,0,0,?,?),(12,'Pasta',4,0,1,?,?),(13,'Lasagne pack',2,1,0,?,?)`, mts, mts, mts, mts, mts, mts)
	// Leftover 1 came from the Cooked Planned Meal 22's slot.
	mustExec(t, d, `INSERT INTO leftovers(id,recipe_id,from_date,from_meal_slot_id,portions,cooked_on,use_by,status,created_at)
		VALUES (1,13,'2026-11-11',4,2,'2026-11-11','2026-11-14','available',?)`, mts)
	mustExec(t, d, `INSERT INTO planned_meals(id,date,meal_slot_id,recipe_id,batches,portions,state,pinned,why_json,resolved_at,created_at,updated_at) VALUES
		(21,'2026-11-10',4,11,1,4,'planned',1,'[{"code":"favourite"}]',NULL,?,?),
		(22,'2026-11-11',4,13,1,4,'cooked',0,'[]','2026-11-11T20:00:00Z',?,?),
		(23,'2026-11-11',6,12,1,2,'skipped',0,'[]','2026-11-11T13:00:00Z',?,?)`, mts, mts, mts, mts, mts, mts)
	// 24 is served from the actual Leftover 1 (and its planned source); 25 only from a planned source.
	mustExec(t, d, `INSERT INTO planned_meals(id,date,meal_slot_id,recipe_id,batches,portions,from_leftover_id,from_date,from_meal_slot_id,created_at,updated_at) VALUES
		(24,'2026-11-12',4,13,0,2,1,'2026-11-11',4,?,?),
		(25,'2026-11-12',6,11,0,2,NULL,'2026-11-10',4,?,?)`, mts, mts, mts, mts)
	mustExec(t, d, `INSERT INTO planned_meals(id,date,meal_slot_id,recipe_id,batches,portions,created_at,updated_at) VALUES (26,'2026-11-13',6,11,1,2,?,?)`, mts, mts)
	mustExec(t, d, `DELETE FROM planned_meals WHERE id = 26`)
	mustExec(t, d, `INSERT INTO plan_unfilled(date,meal_slot_id,reason,slot_rule_claimed,eliminated_json) VALUES ('2026-11-14',4,'no_candidates',1,'{"considered":3,"coolDown":2}')`)
	mustExec(t, d, `INSERT INTO slot_rules(id,meal_slot_id,recipe_id,tag) VALUES (31,4,11,NULL),(32,6,NULL,'fish')`)
	mustExec(t, d, `INSERT INTO cook_timers(id,scope,step,label,duration_seconds,state,started_at,ends_at) VALUES
		(41,'meal:2026-11-10/4',2,'Simmer',600,'running',?,?),(42,'recipe:11',1,'Boil',300,'running',?,?),(43,NULL,NULL,'Eggs',180,'running',?,?)`,
		mts, mts, mts, mts, mts, mts)
	mustExec(t, d, `INSERT INTO advance_step_marks(scope,step,done_at) VALUES ('meal:2026-11-10/4',0,?),('recipe:11',0,?)`, mts, mts)
	mustExec(t, d, `INSERT INTO users(id,email,display_name,is_admin,created_at) VALUES (1,'a@x.test','A',1,?)`, mts)
	mustExec(t, d, `INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,created_at) VALUES (1,1,'https://push.test/1','k','a',?)`, mts)
	mustExec(t, d, `INSERT INTO push_sent(subscription_id,key,sent_at) VALUES
		(1,'advanceStep:2026-11-12/4/17@2026-11-12T16:30:00Z',?),(1,'startCooking:2026-11-12/4@2026-11-12T17:00:00Z',?),(1,'confirmCooked:2026-11-11/4@2026-11-11T21:00:00Z',?)`, mts, mts, mts)
}

// rows returns every row of a query as one "|"-joined string.
func rows(t *testing.T, d *sql.DB, q string, args ...any) []string {
	t.Helper()
	r, err := d.Query(q, args...)
	if err != nil {
		t.Fatalf("%s: %v", q, err)
	}
	defer r.Close()
	cols, _ := r.Columns()
	var out []string
	for r.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := r.Scan(ptrs...); err != nil {
			t.Fatal(err)
		}
		parts := make([]string, len(cols))
		for i, v := range vals {
			parts[i] = fmt.Sprint(v)
		}
		out = append(out, strings.Join(parts, "|"))
	}
	if err := r.Err(); err != nil {
		t.Fatal(err)
	}
	return out
}

func equalRows(a, b []string) bool { return strings.Join(a, "\n") == strings.Join(b, "\n") }

func courseID(t *testing.T, d *sql.DB, key string) int64 {
	t.Helper()
	var id int64
	if err := d.QueryRow(`SELECT id FROM courses WHERE name_key = ?`, key).Scan(&id); err != nil {
		t.Fatalf("course %q: %v", key, err)
	}
	return id
}

func mainCourse(t *testing.T, d *sql.DB) int64 {
	t.Helper()
	var id int64
	if err := d.QueryRow(`SELECT id FROM courses WHERE is_main = 1`).Scan(&id); err != nil {
		t.Fatalf("main course: %v", err)
	}
	return id
}

func seqOf(t *testing.T, d *sql.DB, table string) (seq int64, ok bool) {
	t.Helper()
	err := d.QueryRow(`SELECT seq FROM sqlite_sequence WHERE name = ?`, table).Scan(&seq)
	if err == sql.ErrNoRows {
		return 0, false
	}
	if err != nil {
		t.Fatal(err)
	}
	return seq, true
}

// hasIndexStartingWith reports whether table has an index (explicit or from a constraint) whose first column is col.
func hasIndexStartingWith(t *testing.T, d *sql.DB, table, col string) bool {
	t.Helper()
	for _, name := range rows(t, d, `SELECT name FROM pragma_index_list(?)`, table) {
		var first string
		if err := d.QueryRow(`SELECT name FROM pragma_index_info(?) WHERE seqno = 0`, name).Scan(&first); err == nil && first == col {
			return true
		}
	}
	return false
}

func indexNames(t *testing.T, d *sql.DB) []string {
	t.Helper()
	return rows(t, d, `SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex%' ORDER BY name`)
}

type upgraded struct {
	d                 *sql.DB
	before            map[string][]string // table -> rows before 1400
	seqBefore         int64
	indexesBefore     []string
	main, side, other int64
}

// upgrade seeds a pre-1400 database, notes what 1400 must keep, and migrates.
func upgrade(t *testing.T) upgraded {
	t.Helper()
	d, _ := openTemp(t)
	ctx := context.Background()
	if err := db.Migrate(ctx, d, upTo(t, "1400_")); err != nil {
		t.Fatal(err)
	}
	seedPre1400(t, d)
	u := upgraded{d: d, before: map[string][]string{}}
	u.before["planned_meals"] = rows(t, d, `SELECT id,date,meal_slot_id,recipe_id,batches,portions,state,pinned,from_leftover_id,from_date,from_meal_slot_id,why_json,resolved_at,created_at,updated_at FROM planned_meals ORDER BY id`)
	u.before["leftovers"] = rows(t, d, `SELECT id,recipe_id,from_date,from_meal_slot_id,portions,cooked_on,use_by,status,discarded_on,created_at FROM leftovers ORDER BY id`)
	u.before["plan_unfilled"] = rows(t, d, `SELECT date,meal_slot_id,reason,slot_rule_claimed,eliminated_json FROM plan_unfilled ORDER BY date,meal_slot_id`)
	u.before["slot_rules"] = rows(t, d, `SELECT id,meal_slot_id,recipe_id,tag FROM slot_rules ORDER BY id`)
	u.before["recipes"] = rows(t, d, `SELECT id,name,yield,ready_meal,archived FROM recipes ORDER BY id`)
	u.before["meal_slots"] = rows(t, d, `SELECT id,weekday,name,time FROM meal_slots ORDER BY id`)
	u.before["push_sent"] = rows(t, d, `SELECT subscription_id,key,sent_at FROM push_sent ORDER BY key`)
	u.before["recipe_timer"] = rows(t, d, `SELECT id,scope,step,label FROM cook_timers WHERE scope IS NULL OR scope LIKE 'recipe:%' ORDER BY id`)
	var ok bool
	if u.seqBefore, ok = seqOf(t, d, "planned_meals"); !ok || u.seqBefore <= 25 {
		t.Fatalf("seed: planned_meals counter = %d (present %v), want 26, above max(id) 25", u.seqBefore, ok)
	}
	u.indexesBefore = indexNames(t, d)
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	u.main, u.side, u.other = mainCourse(t, d), courseID(t, d, "side"), courseID(t, d, "dessert")
	return u
}

func TestMigration1400SeedsFourCoursesInOrderWithOneMain(t *testing.T) {
	u := upgrade(t)
	got := rows(t, u.d, `SELECT name,name_key,position,is_main,archived FROM courses ORDER BY position`)
	want := []string{"Main|main|0|1|0", "Side|side|1|0|0", "Starter|starter|2|0|0", "Dessert|dessert|3|0|0"}
	if !equalRows(got, want) {
		t.Fatalf("courses = %v, want %v", got, want)
	}
	for _, name := range []string{"Main", "Side", "Starter", "Dessert"} {
		var key string
		u.d.QueryRow(`SELECT name_key FROM courses WHERE name = ?`, name).Scan(&key)
		if key != course.NameKey(name) {
			t.Errorf("name_key of %s = %q, want course.NameKey = %q", name, key, course.NameKey(name))
		}
	}
	// The constraints: one main, a main is never archived, name_key is unique.
	for q, why := range map[string]string{
		`INSERT INTO courses(name,name_key,position,is_main,created_at) VALUES ('Other','other',9,1,'t')`:            "a second main Course",
		`INSERT INTO courses(name,name_key,position,is_main,archived,created_at) VALUES ('Other','other',9,0,2,'t')`: "archived outside 0/1",
		`UPDATE courses SET archived = 1 WHERE is_main = 1`:                                                          "an archived main Course",
		`INSERT INTO courses(name,name_key,position,created_at) VALUES ('SIDE','side',9,'t')`:                        "a repeated name_key",
		`INSERT INTO courses(name,name_key,position,is_main,created_at) VALUES ('Other','other',9,2,'t')`:            "is_main outside 0/1",
	} {
		if _, err := u.d.Exec(q); err == nil {
			t.Errorf("%s was accepted", why)
		}
	}
}

func TestMigration1400GivesEveryRecipeAndMealSlotTheMainCourseAndMarksReadyMealsWhole(t *testing.T) {
	u := upgrade(t)
	main := fmt.Sprint(u.main)
	if got := rows(t, u.d, `SELECT recipe_id,course_id FROM recipe_courses ORDER BY recipe_id`); !equalRows(got, []string{"11|" + main, "12|" + main, "13|" + main}) {
		t.Errorf("recipe_courses = %v (every Recipe, the archived one included, gets exactly the main Course)", got)
	}
	if got := rows(t, u.d, `SELECT meal_slot_id,course_id,position,optional FROM meal_slot_courses ORDER BY meal_slot_id`); !equalRows(got, []string{"4|" + main + "|0|0", "6|" + main + "|0|0"}) {
		t.Errorf("meal_slot_courses = %v (main Course, position 0, required)", got)
	}
	if got := rows(t, u.d, `SELECT id,whole_meal FROM recipes ORDER BY id`); !equalRows(got, []string{"11|0", "12|0", "13|1"}) {
		t.Errorf("whole_meal = %v, want only the Ready Meal (13) to be a Whole meal", got)
	}
	if _, err := u.d.Exec(`UPDATE recipes SET whole_meal = 2 WHERE id = 11`); err == nil {
		t.Error("whole_meal outside 0/1 was accepted")
	}
	for table, want := range map[string][]string{"recipes": u.before["recipes"], "meal_slots": u.before["meal_slots"]} {
		cols := map[string]string{"recipes": "id,name,yield,ready_meal,archived", "meal_slots": "id,weekday,name,time"}[table]
		if got := rows(t, u.d, `SELECT `+cols+` FROM `+table+` ORDER BY id`); !equalRows(got, want) {
			t.Errorf("%s changed: %v, want %v", table, got, want)
		}
	}
}

func TestMigration1400KeepsIdsAndFieldsAndPutsEveryRowInTheMainCourse(t *testing.T) {
	u := upgrade(t)
	main := fmt.Sprint(u.main)
	if got := rows(t, u.d, `SELECT id,date,meal_slot_id,recipe_id,batches,portions,state,pinned,from_leftover_id,from_date,from_meal_slot_id,why_json,resolved_at,created_at,updated_at FROM planned_meals ORDER BY id`); !equalRows(got, u.before["planned_meals"]) {
		t.Errorf("planned_meals fields changed:\n got %v\nwant %v", got, u.before["planned_meals"])
	}
	if got := rows(t, u.d, `SELECT id,course_id,relaxed,from_course_id FROM planned_meals ORDER BY id`); !equalRows(got, []string{
		"21|" + main + "|0|<nil>", "22|" + main + "|0|<nil>", "23|" + main + "|0|<nil>", "24|" + main + "|0|" + main, "25|" + main + "|0|" + main}) {
		t.Errorf("course_id/relaxed/from_course_id = %v (from_course_id is set exactly where from_date is)", got)
	}
	if got := rows(t, u.d, `SELECT id,recipe_id,from_date,from_meal_slot_id,portions,cooked_on,use_by,status,discarded_on,created_at FROM leftovers ORDER BY id`); !equalRows(got, u.before["leftovers"]) {
		t.Errorf("leftovers fields changed: %v", got)
	}
	if got := rows(t, u.d, `SELECT id,from_course_id FROM leftovers`); !equalRows(got, []string{"1|" + main}) {
		t.Errorf("leftovers.from_course_id = %v, want the main Course", got)
	}
	if got := rows(t, u.d, `SELECT date,meal_slot_id,reason,slot_rule_claimed,eliminated_json FROM plan_unfilled`); !equalRows(got, u.before["plan_unfilled"]) {
		t.Errorf("plan_unfilled fields changed: %v", got)
	}
	if got := rows(t, u.d, `SELECT course_id FROM plan_unfilled`); !equalRows(got, []string{main}) {
		t.Errorf("plan_unfilled.course_id = %v", got)
	}
	if got := rows(t, u.d, `SELECT id,meal_slot_id,recipe_id,tag FROM slot_rules ORDER BY id`); !equalRows(got, u.before["slot_rules"]) {
		t.Errorf("slot_rules fields changed: %v", got)
	}
	if got := rows(t, u.d, `SELECT id,course_id FROM slot_rules ORDER BY id`); !equalRows(got, []string{"31|" + main, "32|" + main}) {
		t.Errorf("slot_rules.course_id = %v", got)
	}
}

func TestMigration1400KeysByDateSlotAndCourseAndChecksTheRelatedColumns(t *testing.T) {
	u := upgrade(t)
	d := u.d
	// A second Course on the same slot and date can be planned; the same Course twice cannot.
	mustExec(t, d, `INSERT INTO planned_meals(date,meal_slot_id,course_id,recipe_id,batches,portions,created_at,updated_at) VALUES ('2026-11-10',4,?,12,1,2,?,?)`, u.side, mts, mts)
	if _, err := d.Exec(`INSERT INTO planned_meals(date,meal_slot_id,course_id,recipe_id,created_at,updated_at) VALUES ('2026-11-10',4,?,12,?,?)`, u.side, mts, mts); err == nil {
		t.Error("a second Planned Meal in the same (date, Meal Slot, Course) was accepted")
	}
	if _, err := d.Exec(`INSERT INTO planned_meals(date,meal_slot_id,course_id,recipe_id,created_at,updated_at) VALUES ('2026-11-10',4,999,12,?,?)`, mts, mts); err == nil {
		t.Error("a Planned Meal in an unknown Course was accepted")
	}
	// from_date, from_meal_slot_id and from_course_id are all set or all null.
	for _, q := range []string{
		`INSERT INTO planned_meals(date,meal_slot_id,course_id,recipe_id,from_date,from_meal_slot_id,created_at,updated_at) VALUES ('2026-11-20',4,%d,11,'2026-11-10',4,'t','t')`,
		`INSERT INTO planned_meals(date,meal_slot_id,course_id,recipe_id,from_course_id,created_at,updated_at) VALUES ('2026-11-20',4,%d,11,%d,'t','t')`,
	} {
		if _, err := d.Exec(fmt.Sprintf(q, u.main, u.main)); err == nil {
			t.Errorf("a half-set source was accepted: %s", q)
		}
	}
	mustExec(t, d, `INSERT INTO planned_meals(date,meal_slot_id,course_id,recipe_id,from_date,from_meal_slot_id,from_course_id,created_at,updated_at) VALUES ('2026-11-20',4,?,11,'2026-11-10',4,?,?,?)`, u.main, u.side, mts, mts)
	if _, err := d.Exec(`INSERT INTO planned_meals(date,meal_slot_id,course_id,recipe_id,relaxed,created_at,updated_at) VALUES ('2026-11-21',4,?,11,2,?,?)`, u.main, mts, mts); err == nil {
		t.Error("relaxed outside 0/1 was accepted")
	}
	mustExec(t, d, `INSERT INTO planned_meals(date,meal_slot_id,course_id,recipe_id,relaxed,created_at,updated_at) VALUES ('2026-11-21',4,?,11,1,?,?)`, u.main, mts, mts)
	// Couldn't plan reasons key on the Course too, and know the new reason.
	mustExec(t, d, `INSERT INTO plan_unfilled(date,meal_slot_id,course_id,reason) VALUES ('2026-11-14',4,?,'no_course_recipes')`, u.side)
	if _, err := d.Exec(`INSERT INTO plan_unfilled(date,meal_slot_id,course_id,reason) VALUES ('2026-11-14',4,?,'no_candidates')`, u.main); err == nil {
		t.Error("a second reason for the same cell was accepted")
	}
	if _, err := d.Exec(`INSERT INTO plan_unfilled(date,meal_slot_id,course_id,reason) VALUES ('2026-11-15',4,?,'whatever')`, u.main); err == nil {
		t.Error("an unknown reason was accepted")
	}
	// Slot Rules: one rule can exist in two Courses of a slot (the store rejects a repeat within one Course, since
	// a NULL tag defeats the UNIQUE index, as it did before).
	mustExec(t, d, `INSERT INTO slot_rules(meal_slot_id,course_id,recipe_id) VALUES (4,?,11)`, u.side)
	if _, err := d.Exec(`INSERT INTO slot_rules(meal_slot_id,course_id,recipe_id) VALUES (4,999,11)`); err == nil {
		t.Error("a Slot Rule on an unknown Course was accepted")
	}
}

func TestMigration1400RewritesPlannedMealScopesOnly(t *testing.T) {
	u := upgrade(t)
	main := fmt.Sprint(u.main)
	if got := rows(t, u.d, `SELECT id,scope,step FROM cook_timers WHERE id = 41`); !equalRows(got, []string{"41|meal:2026-11-10/4/" + main + "|2"}) {
		t.Errorf("Planned Meal timer scope = %v, want meal:2026-11-10/4/%s", got, main)
	}
	if got := rows(t, u.d, `SELECT scope,step FROM advance_step_marks ORDER BY scope`); !equalRows(got, []string{"meal:2026-11-10/4/" + main + "|0", "recipe:11|0"}) {
		t.Errorf("advance_step_marks = %v", got)
	}
	if got := rows(t, u.d, `SELECT id,scope,step,label FROM cook_timers WHERE scope IS NULL OR scope LIKE 'recipe:%' ORDER BY id`); !equalRows(got, u.before["recipe_timer"]) {
		t.Errorf("Recipe scoped and free timers changed: %v, want %v", got, u.before["recipe_timer"])
	}
	// The (scope, step) uniqueness still holds on the new scope.
	if _, err := u.d.Exec(`INSERT INTO cook_timers(scope,step,label,duration_seconds,state,started_at,ends_at) VALUES (?,2,'again',60,'running','t','t')`, "meal:2026-11-10/4/"+main); err == nil {
		t.Error("a second timer for the same (scope, Step) was accepted")
	}
	// push_sent is 1410's job, and upgrade() runs 1410 too: the only change is the Advance Step key gaining the main
	// Course; the Start cooking and Confirm Cooked keys, and every sent_at, are untouched.
	wantSent := make([]string, len(u.before["push_sent"]))
	for i, r := range u.before["push_sent"] {
		wantSent[i] = strings.Replace(r, "advanceStep:2026-11-12/4/17@", "advanceStep:2026-11-12/4/"+main+"/17@", 1)
	}
	if got := rows(t, u.d, `SELECT subscription_id,key,sent_at FROM push_sent ORDER BY key`); !equalRows(got, wantSent) {
		t.Errorf("push_sent = %v, want %v (only the Advance Step key gains the main Course)", got, wantSent)
	}
}

func TestMigration1400ForeignKeysIndexesAndSchema(t *testing.T) {
	u := upgrade(t)
	d := u.d
	if got := rows(t, d, `PRAGMA foreign_key_check`); len(got) != 0 {
		t.Errorf("foreign_key_check reports %v", got)
	}
	if count(t, d, `PRAGMA foreign_keys`) != 1 {
		t.Error("foreign_keys must be back ON")
	}
	after := map[string]bool{}
	for _, n := range indexNames(t, d) {
		after[n] = true
	}
	for _, n := range u.indexesBefore {
		if !after[n] {
			t.Errorf("index %s existed before 1400 and is gone after the rebuilds", n)
		}
	}
	for _, n := range []string{"courses_one_main", "planned_meals_course"} {
		if !after[n] {
			t.Errorf("index %s missing", n)
		}
	}
	for _, tc := range [][2]string{
		{"recipe_courses", "course_id"}, {"meal_slot_course_opt_outs", "course_id"},
		{"course_attendance_overrides", "course_id"}, {"planned_meals", "course_id"},
	} {
		if !hasIndexStartingWith(t, d, tc[0], tc[1]) {
			t.Errorf("%s has no index starting with %s", tc[0], tc[1])
		}
	}
	for _, table := range []string{"planned_meals"} {
		var ddl string
		d.QueryRow(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`, table).Scan(&ddl)
		if !strings.Contains(strings.ToUpper(ddl), "AUTOINCREMENT") {
			t.Errorf("%s lost AUTOINCREMENT", table)
		}
	}
	for _, name := range []string{"courses", "recipe_courses", "meal_slot_courses", "meal_slot_course_opt_outs", "course_attendance_overrides", "course_attendance_override_opt_outs"} {
		if count(t, d, `SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?`, name) != 1 {
			t.Errorf("table %s missing", name)
		}
	}
	if count(t, d, `SELECT count(*) FROM sqlite_master WHERE type='table' AND name LIKE '%\_new' ESCAPE '\'`) != 0 {
		t.Error("a *_new rebuild table is left behind")
	}
	// A migration can be recorded exactly once, and the recorded name is the one start-up checks.
	if count(t, d, `SELECT count(*) FROM schema_migrations WHERE name = ?`, db.Migration1400) != 1 {
		t.Errorf("schema_migrations does not record %s", db.Migration1400)
	}
}

func TestMigration1400FreshDatabaseHasTheSameSchemaAsTheUpgradedOne(t *testing.T) {
	u := upgrade(t)
	fresh, _ := openTemp(t)
	if err := db.MigrateEmbedded(context.Background(), fresh); err != nil {
		t.Fatal(err)
	}
	q := `SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name`
	if got, want := rows(t, fresh, q), rows(t, u.d, q); !equalRows(got, want) {
		t.Errorf("the fresh schema differs from the upgraded one:\nfresh    %v\nupgraded %v", got, want)
	}
	if count(t, fresh, `SELECT count(*) FROM courses`) != 4 || count(t, fresh, `SELECT count(*) FROM courses WHERE is_main = 1`) != 1 {
		t.Error("a fresh database must seed the four Courses with one main")
	}
	for _, table := range []string{"recipe_courses", "meal_slot_courses", "planned_meals", "leftovers", "slot_rules", "plan_unfilled"} {
		if n := count(t, fresh, `SELECT count(*) FROM `+table); n != 0 {
			t.Errorf("fresh %s has %d rows", table, n)
		}
	}
	// planned_meals has a counter of 0 (migration 1100 already leaves that row; 1400 carries it over unchanged) and no rebuild leftover.
	if seq, ok := seqOf(t, fresh, "planned_meals"); ok && seq != 0 {
		t.Errorf("a fresh database has a planned_meals counter of %d before its first insert, want 0 or no row", seq)
	}
	if _, ok := seqOf(t, fresh, "planned_meals_new"); ok {
		t.Error("a sqlite_sequence row for planned_meals_new is left behind")
	}
}

func TestMigration1400IsIdempotent(t *testing.T) {
	u := upgrade(t)
	before := rows(t, u.d, `SELECT id,name,name_key,position,is_main,archived FROM courses ORDER BY id`)
	pm := rows(t, u.d, `SELECT id,course_id FROM planned_meals ORDER BY id`)
	if err := db.MigrateEmbedded(context.Background(), u.d); err != nil {
		t.Fatalf("second migrate: %v", err)
	}
	if got := rows(t, u.d, `SELECT id,name,name_key,position,is_main,archived FROM courses ORDER BY id`); !equalRows(got, before) {
		t.Errorf("a second migrate changed the Courses: %v", got)
	}
	if got := rows(t, u.d, `SELECT id,course_id FROM planned_meals ORDER BY id`); !equalRows(got, pm) {
		t.Errorf("a second migrate changed the Planned Meals: %v", got)
	}
	if n := count(t, u.d, `SELECT count(*) FROM schema_migrations WHERE name = ?`, db.Migration1400); n != 1 {
		t.Errorf("%d schema_migrations rows for 1400", n)
	}
}

func TestMigration1400CarriesTheAutoincrementCounterOfPlannedMeals(t *testing.T) {
	u := upgrade(t)
	if seq, ok := seqOf(t, u.d, "planned_meals"); !ok || seq != u.seqBefore {
		t.Fatalf("sqlite_sequence for planned_meals = %d (present %v), want the counter noted before (%d), not max(id) = 25", seq, ok, u.seqBefore)
	}
	if _, ok := seqOf(t, u.d, "planned_meals_new"); ok {
		t.Error("a sqlite_sequence row for planned_meals_new is left behind")
	}
	res, err := u.d.Exec(`INSERT INTO planned_meals(date,meal_slot_id,course_id,recipe_id,created_at,updated_at) VALUES ('2026-11-30',4,?,11,?,?)`, u.main, mts, mts)
	if err != nil {
		t.Fatal(err)
	}
	if id, _ := res.LastInsertId(); id <= u.seqBefore {
		t.Errorf("the next Planned Meal got id %d, want above the removed %d (a deleted id must not be handed out again)", id, u.seqBefore)
	}
}

func TestMigration1400StartsWithNoOptionalCoursesAndNoOptOuts(t *testing.T) {
	u := upgrade(t)
	if n := count(t, u.d, `SELECT count(*) FROM meal_slot_courses WHERE optional <> 0`); n != 0 {
		t.Errorf("%d optional Meal Slot Courses after the upgrade", n)
	}
	if n := count(t, u.d, `SELECT count(*) FROM planned_meals WHERE relaxed <> 0`); n != 0 {
		t.Errorf("%d relaxed Planned Meals after the upgrade", n)
	}
	for _, table := range []string{"meal_slot_course_opt_outs", "course_attendance_overrides", "course_attendance_override_opt_outs"} {
		if n := count(t, u.d, `SELECT count(*) FROM `+table); n != 0 {
			t.Errorf("%s has %d rows after the upgrade, want none (nobody opts out)", table, n)
		}
	}
	if _, err := u.d.Exec(`UPDATE meal_slot_courses SET optional = 2 WHERE meal_slot_id = 4`); err == nil {
		t.Error("optional outside 0/1 was accepted")
	}
	if _, err := u.d.Exec(`INSERT INTO meal_slot_courses(meal_slot_id,course_id,position) VALUES (4,?,0)`, u.side); err == nil {
		t.Error("two Courses at the same position of a Meal Slot were accepted")
	}
}

// The three opt-out tables hang off meal_slots, courses and members only (never off meal_slot_courses), so
// the household store can delete and reinsert a slot's Courses without wiping its opt-outs.
func TestMigration1400OptOutTablesCascadeFromSlotsCoursesAndMembersButNotFromMealSlotCourses(t *testing.T) {
	u := upgrade(t)
	d := u.d
	mustExec(t, d, `INSERT INTO meal_slot_courses(meal_slot_id,course_id,position) VALUES (4,?,1)`, u.side)
	counts := func() (usual, ov, ovOut int) {
		return count(t, d, `SELECT count(*) FROM meal_slot_course_opt_outs`), count(t, d, `SELECT count(*) FROM course_attendance_overrides`),
			count(t, d, `SELECT count(*) FROM course_attendance_override_opt_outs`)
	}
	seed := func(slot int64, course int64, member int64, date string) {
		mustExec(t, d, `INSERT INTO meal_slot_course_opt_outs(meal_slot_id,course_id,member_id) VALUES (?,?,?)`, slot, course, member)
		mustExec(t, d, `INSERT INTO course_attendance_overrides(slot_id,date,course_id) VALUES (?,?,?)`, slot, date, course)
		mustExec(t, d, `INSERT INTO course_attendance_override_opt_outs(slot_id,date,course_id,member_id) VALUES (?,?,?,?)`, slot, date, course, member)
	}
	check := func(what string, u1, o1, oo1 int) {
		t.Helper()
		if a, b, c := counts(); a != u1 || b != o1 || c != oo1 {
			t.Errorf("%s: usual/overrides/override opt-outs = %d/%d/%d, want %d/%d/%d", what, a, b, c, u1, o1, oo1)
		}
	}

	seed(4, u.side, 3, "2026-11-10")
	check("seeded", 1, 1, 1)
	// 1. Deleting (and reinserting) the meal_slot_courses row does not touch any opt-out.
	mustExec(t, d, `DELETE FROM meal_slot_courses WHERE meal_slot_id = 4 AND course_id = ?`, u.side)
	check("meal_slot_courses row deleted", 1, 1, 1)
	// 2. An override row takes its own opt-outs with it.
	mustExec(t, d, `DELETE FROM course_attendance_overrides WHERE slot_id = 4 AND course_id = ?`, u.side)
	check("override deleted", 1, 0, 0)
	// 3. Deleting a Member removes their opt-outs, usual and per date.
	mustExec(t, d, `INSERT INTO course_attendance_overrides(slot_id,date,course_id) VALUES (4,'2026-11-10',?)`, u.side)
	mustExec(t, d, `INSERT INTO course_attendance_override_opt_outs(slot_id,date,course_id,member_id) VALUES (4,'2026-11-10',?,5)`, u.side)
	mustExec(t, d, `INSERT INTO meal_slot_course_opt_outs(meal_slot_id,course_id,member_id) VALUES (4,?,5)`, u.side)
	check("Sam added", 2, 1, 1)
	mustExec(t, d, `DELETE FROM members WHERE id = 5`)
	check("Member deleted", 1, 1, 0)
	// 4. Deleting a Course (one nothing else refers to) removes its opt-outs and date overrides.
	seed(6, u.other, 3, "2026-11-11")
	check("Dessert seeded", 2, 2, 1)
	mustExec(t, d, `DELETE FROM courses WHERE id = ?`, u.other)
	check("Course deleted", 1, 1, 0)
	// 5. Deleting a Meal Slot removes everything of its.
	mustExec(t, d, `DELETE FROM meal_slots WHERE id = 4`)
	check("Meal Slot deleted", 0, 0, 0)
	// A row for a Course or Meal Slot that does not exist is refused; an override opt-out needs its override row.
	if _, err := d.Exec(`INSERT INTO meal_slot_course_opt_outs(meal_slot_id,course_id,member_id) VALUES (6,999,3)`); err == nil {
		t.Error("an opt-out for an unknown Course was accepted")
	}
	if _, err := d.Exec(`INSERT INTO course_attendance_override_opt_outs(slot_id,date,course_id,member_id) VALUES (6,'2026-11-12',?,3)`, u.side); err == nil {
		t.Error("an override opt-out without its override row was accepted")
	}
}

func TestMigration1400FailureRollsBackAndNamesTheFile(t *testing.T) {
	// A Planned Meal that points at a Meal Slot that no longer exists would break the rebuilds' foreign_key_check: the
	// runner must roll back and say which file failed. (Foreign keys are off while seeding it, as an old bug could have left it.)
	d, _ := openTemp(t)
	ctx := context.Background()
	if err := db.Migrate(ctx, d, upTo(t, "1400_")); err != nil {
		t.Fatal(err)
	}
	seedPre1400(t, d)
	c, err := d.Conn(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := c.ExecContext(ctx, `PRAGMA foreign_keys=OFF`); err != nil {
		t.Fatal(err)
	}
	if _, err := c.ExecContext(ctx, `UPDATE planned_meals SET recipe_id = 999 WHERE id = 21`); err != nil {
		t.Fatal(err)
	}
	c.ExecContext(ctx, `PRAGMA foreign_keys=ON`)
	c.Close()
	err = db.MigrateEmbedded(ctx, d)
	if err == nil || !strings.Contains(err.Error(), db.Migration1400) {
		t.Fatalf("err = %v, want a failure naming %s", err, db.Migration1400)
	}
	if count(t, d, `SELECT count(*) FROM sqlite_master WHERE type='table' AND name='courses'`) != 0 {
		t.Error("the failed migration was not rolled back (courses exists)")
	}
	if got := rows(t, d, `SELECT id FROM planned_meals ORDER BY id`); len(got) != 5 {
		t.Errorf("planned_meals after the failure = %v, want the 5 original rows", got)
	}
}
