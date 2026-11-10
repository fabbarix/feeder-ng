package db_test

import (
	"context"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// R6 (2026-11-10): the per-User secondary colour is gone, so migration 1120 drops the column and
// keeps every other preference.
func TestDropSecondaryKeepsPreferences(t *testing.T) {
	d, _ := openTemp(t)
	ctx := context.Background()
	if err := db.Migrate(ctx, d, upTo(t, "1120_")); err != nil {
		t.Fatal(err)
	}
	const ts = "2026-01-01T00:00:00Z"
	mustExec(t, d, `INSERT INTO users(id,email,display_name,created_at) VALUES (2,'anna@example.test','Anna',?)`, ts)
	mustExec(t, d, `INSERT INTO user_preferences(user_id,scheme,accent,secondary,units) VALUES (2,'dark','#3366cc','#ffb4a2','imperial')`)
	if got := count(t, d, `SELECT count(*) FROM pragma_table_info('user_preferences') WHERE name='secondary'`); got != 1 {
		t.Fatalf("precondition: secondary column present = %d", got)
	}

	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatalf("drop secondary: %v", err)
	}
	if got := count(t, d, `SELECT count(*) FROM pragma_table_info('user_preferences') WHERE name='secondary'`); got != 0 {
		t.Errorf("secondary column still present after migration")
	}
	if got := count(t, d, `SELECT count(*) FROM user_preferences WHERE user_id=2 AND scheme='dark' AND accent='#3366cc' AND units='imperial'`); got != 1 {
		t.Errorf("other preferences were not kept")
	}
}
