package db_test

import (
	"context"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// B9-53 (TB-06, plan brief "Traps"): beta.9 keeps the first-run checklist on Today until five Recipes (decision TB 6). In beta.8 the checklist went away
// as soon as one Planned Meal existed, so a Household that has already planned must not see it again after the upgrade: the migration that adds
// setup_hidden (1575) sets it to 1 for a Household with any Planned Meal, Cooked ones included. A Household that had not planned yet was still shown
// the checklist in beta.8, so it keeps seeing it (setup_hidden 0). Red until 1575_household_b9.sql does it.

func TestUpgradeHidesTheChecklistOfAHouseholdThatAlreadyPlanned(t *testing.T) {
	d := tagsOpenAt(t, "1575_") // a beta.8 database
	mustExec(t, d, `INSERT INTO members(id,name,colour,portion_factor,created_at) VALUES (3,'Anna','#fff',1,?)`, mts)
	mustExec(t, d, `INSERT INTO recipes(id,name,yield,created_at,updated_at) VALUES (5,'Lasagne',4,?,?),(6,'Soup',4,?,?),(7,'Pasta',4,?,?)`, mts, mts, mts, mts, mts, mts)
	mustExec(t, d, `INSERT INTO meal_slots(id,weekday,name,time) VALUES (1,1,'Dinner','19:00')`)
	var course int
	if err := d.QueryRow(`SELECT id FROM courses WHERE is_main = 1`).Scan(&course); err != nil {
		t.Fatal(err)
	}
	mustExec(t, d, `INSERT INTO planned_meals(id,date,meal_slot_id,course_id,recipe_id,batches,portions,state,created_at,updated_at)
		VALUES (40,'2026-11-09',1,?,5,1,2,'planned',?,?)`, course, mts, mts)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("upgrade: %v", err)
	}
	if n := count(t, d, `SELECT count(*) FROM household_settings WHERE id = 1 AND setup_hidden = 1`); n != 1 {
		t.Errorf("a Household with a Planned Meal keeps the checklist hidden after the upgrade: %d rows with setup_hidden = 1, want 1", n)
	}
}

func TestUpgradeCountsACookedMealToo(t *testing.T) {
	d := tagsOpenAt(t, "1575_")
	mustExec(t, d, `INSERT INTO recipes(id,name,yield,created_at,updated_at) VALUES (5,'Lasagne',4,?,?)`, mts, mts)
	mustExec(t, d, `INSERT INTO meal_slots(id,weekday,name,time) VALUES (1,1,'Dinner','19:00')`)
	var course int
	if err := d.QueryRow(`SELECT id FROM courses WHERE is_main = 1`).Scan(&course); err != nil {
		t.Fatal(err)
	}
	mustExec(t, d, `INSERT INTO planned_meals(id,date,meal_slot_id,course_id,recipe_id,batches,portions,state,created_at,updated_at)
		VALUES (40,'2026-11-02',1,?,5,1,2,'cooked',?,?)`, course, mts, mts)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("upgrade: %v", err)
	}
	if n := count(t, d, `SELECT count(*) FROM household_settings WHERE id = 1 AND setup_hidden = 1`); n != 1 {
		t.Errorf("a Cooked meal means the Household has planned: setup_hidden = 1, got %d matching rows", n)
	}
}

func TestUpgradeKeepsTheChecklistForAHouseholdThatHasNotPlannedYet(t *testing.T) {
	d := tagsOpenAt(t, "1575_")
	mustExec(t, d, `INSERT INTO members(id,name,colour,portion_factor,created_at) VALUES (3,'Anna','#fff',1,?)`, mts)
	mustExec(t, d, `INSERT INTO recipes(id,name,yield,created_at,updated_at) VALUES (5,'Lasagne',4,?,?)`, mts, mts)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("upgrade: %v", err)
	}
	if n := count(t, d, `SELECT count(*) FROM household_settings WHERE id = 1 AND setup_hidden = 0`); n != 1 {
		t.Errorf("a Household that had not planned keeps the checklist (setup_hidden 0): %d rows, want 1", n)
	}
}

func TestANewHouseholdStartsWithTheChecklistShown(t *testing.T) {
	d := tagsOpenAt(t, "1575_")
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("upgrade: %v", err)
	}
	if n := count(t, d, `SELECT count(*) FROM household_settings WHERE id = 1 AND setup_hidden = 0 AND time_zone_configured = 0`); n != 1 {
		t.Errorf("an empty Household has setup_hidden 0 and an unconfirmed time zone: %d rows, want 1", n)
	}
}
