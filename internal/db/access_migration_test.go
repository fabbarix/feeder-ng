package db_test

import (
	"context"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// A1: migration 1200 rebuilds push_subscription_types to widen its CHECK. Rows that exist before the upgrade (users
// who opted in to notifications) must survive it, and the new type must now be accepted.
func TestAccessMigrationKeepsExistingPushSubscriptionTypes(t *testing.T) {
	d, _ := openTemp(t)
	ctx := context.Background()
	if err := db.Migrate(ctx, d, upTo(t, "1200_")); err != nil {
		t.Fatal(err)
	}
	mustExec(t, d, `INSERT INTO users(id,email,display_name,is_admin,created_at) VALUES (1,'a@x.org','A',1,'2026-10-05T08:00:00Z')`)
	mustExec(t, d, `INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,created_at) VALUES (5,1,'https://push.example/1','k','a','2026-10-05T08:00:00Z')`)
	mustExec(t, d, `INSERT INTO push_subscription_types(subscription_id,type) VALUES (5,'advanceStep'),(5,'timerFinished'),(5,'stockSpoil')`)
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if got := count(t, d, `SELECT count(*) FROM push_subscription_types WHERE subscription_id = 5`); got != 3 {
		t.Fatalf("%d push_subscription_types rows survived, want 3", got)
	}
	if got := count(t, d, `SELECT count(*) FROM push_subscription_types WHERE subscription_id = 5 AND type IN ('advanceStep','timerFinished','stockSpoil')`); got != 3 {
		t.Fatalf("the surviving rows changed")
	}
	mustExec(t, d, `INSERT INTO push_subscription_types(subscription_id,type) VALUES (5,'accessRequest')`)
	// The rebuilt child table still cascades with its subscription.
	mustExec(t, d, `PRAGMA foreign_keys = ON`)
	mustExec(t, d, `DELETE FROM push_subscriptions WHERE id = 5`)
	if got := count(t, d, `SELECT count(*) FROM push_subscription_types`); got != 0 {
		t.Fatalf("%d rows left after the subscription was deleted, want the cascade to remove them", got)
	}
}
