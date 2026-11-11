package db_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// Migration 1410 (docs/dev/design/crs-plan.md 1.5, team G1): the stored Advance Step reminder keys gain the
// Course, '<date>/<slot>/<step>' becoming '<date>/<slot>/<course>/<step>', so nothing sent before the upgrade is
// sent again by the code that writes the new keys. Start cooking and Confirm Cooked keys and every other type
// are not touched.

func TestMigration1410RewritesAdvanceStepKeysOnly(t *testing.T) {
	d, _ := openTemp(t)
	ctx := context.Background()
	if err := db.Migrate(ctx, d, upTo(t, "1410_")); err != nil {
		t.Fatal(err)
	}
	// The main Course is not id 1 here: the migration must read the flag, never a literal id.
	mustExec(t, d, `UPDATE courses SET is_main = 0 WHERE is_main = 1`)
	mustExec(t, d, `UPDATE courses SET is_main = 1 WHERE name = 'Dessert'`)
	var main int
	if err := d.QueryRow(`SELECT id FROM courses WHERE is_main = 1`).Scan(&main); err != nil || main == 1 {
		t.Fatalf("main Course = %d, %v; want a main Course other than id 1", main, err)
	}
	mustExec(t, d, `INSERT INTO users(id,email,display_name,is_admin,created_at) VALUES (1,'a@x.test','A',1,?)`, mts)
	mustExec(t, d, `INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,created_at) VALUES
		(1,1,'https://push.test/1','k','a',?),(2,1,'https://push.test/2','k','a',?)`, mts, mts)
	before := []string{
		"advanceStep:2026-11-12/4/17@2026-11-12T16:30:00Z",
		"advanceStep:2026-11-12/12/345@2026-11-12T16:30:00Z", // two-digit slot, three-digit step
		"advanceStep:2026-11-12/4/0@2026-11-12T15:00:00Z",
		"startCooking:2026-11-12/4@2026-11-12T17:00:00Z",
		"confirmCooked:2026-11-11/4@2026-11-11T21:00:00Z",
		"leftoverUseBy:5@2026-11-14T09:00:00Z",
		"stockSpoil:9@2026-11-14T09:00:00Z",
		"accessRequest:3@2026-11-10T08:00:00Z",
		"timerFinished:7@2026-11-10T08:00:00Z",
	}
	for _, k := range before {
		for sub := 1; sub <= 2; sub++ {
			mustExec(t, d, `INSERT INTO push_sent(subscription_id,key,sent_at) VALUES (?,?,?)`, sub, k, mts)
		}
	}

	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	want := []string{
		fmt.Sprintf("advanceStep:2026-11-12/4/%d/17@2026-11-12T16:30:00Z", main),
		fmt.Sprintf("advanceStep:2026-11-12/12/%d/345@2026-11-12T16:30:00Z", main),
		fmt.Sprintf("advanceStep:2026-11-12/4/%d/0@2026-11-12T15:00:00Z", main),
		"startCooking:2026-11-12/4@2026-11-12T17:00:00Z",
		"confirmCooked:2026-11-11/4@2026-11-11T21:00:00Z",
		"leftoverUseBy:5@2026-11-14T09:00:00Z",
		"stockSpoil:9@2026-11-14T09:00:00Z",
		"accessRequest:3@2026-11-10T08:00:00Z",
		"timerFinished:7@2026-11-10T08:00:00Z",
	}
	for sub := 1; sub <= 2; sub++ {
		for _, k := range want {
			if got := count(t, d, `SELECT count(*) FROM push_sent WHERE subscription_id=? AND key=?`, sub, k); got != 1 {
				t.Errorf("subscription %d: key %q present %d times, want once", sub, k, got)
			}
		}
	}
	if got := count(t, d, `SELECT count(*) FROM push_sent`); got != 2*len(before) {
		t.Errorf("push_sent has %d rows, want %d: a rewrite must neither add nor drop rows", got, 2*len(before))
	}
	if got := count(t, d, `SELECT count(*) FROM push_sent WHERE key GLOB 'advanceStep:*' AND sent_at <> ?`, mts); got != 0 {
		t.Errorf("sent_at must be kept")
	}

	// A second run is a no-op: no key is rewritten twice.
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatalf("second migrate: %v", err)
	}
	if got := count(t, d, `SELECT count(*) FROM push_sent WHERE key = ?`, want[0]); got != 2 {
		t.Errorf("after a second MigrateEmbedded the rewritten key is on %d rows, want 2", got)
	}
	if got := count(t, d, `SELECT count(*) FROM push_sent WHERE key GLOB 'advanceStep:*/*/*/*/*@*'`); got != 0 {
		t.Errorf("a key has two Course parts after a second run")
	}
}

func TestMigration1410OnADatabaseWithoutSentRemindersIsHarmless(t *testing.T) {
	d, _ := openTemp(t)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	if got := count(t, d, `SELECT count(*) FROM push_sent`); got != 0 {
		t.Errorf("push_sent has %d rows on a fresh database", got)
	}
}
