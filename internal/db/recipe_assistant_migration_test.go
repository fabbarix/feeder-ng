package db_test

import (
	"context"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// WP-C: migration 1300_recipe_assistant.sql (design §8): a one-row settings table seeded off, with the default
// base URL and model, and a change-history table shaped like A1's access_events.
func TestRecipeAssistantMigration1300(t *testing.T) {
	d, _ := openTemp(t)
	ctx := context.Background()
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatal(err)
	}
	cols := func(table string) map[string]bool {
		rows, err := d.Query(`SELECT name FROM pragma_table_info('` + table + `')`)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		out := map[string]bool{}
		for rows.Next() {
			var n string
			_ = rows.Scan(&n)
			out[n] = true
		}
		return out
	}
	for _, c := range []string{"id", "enabled", "base_url", "model", "api_key_ciphertext", "api_key_last4", "api_key_master_id", "updated_at", "updated_by"} {
		if !cols("recipe_assistant_settings")[c] {
			t.Errorf("recipe_assistant_settings.%s missing", c)
		}
	}
	for _, c := range []string{"id", "at", "actor_user_id", "actor_email", "action", "detail"} {
		if !cols("recipe_assistant_events")[c] {
			t.Errorf("recipe_assistant_events.%s missing", c)
		}
	}
	if got := count(t, d, `SELECT count(*) FROM recipe_assistant_settings WHERE id=1 AND enabled=0 AND base_url='https://api.anthropic.com' AND model='claude-haiku-5-5' AND api_key_ciphertext IS NULL AND api_key_last4 IS NULL AND api_key_master_id IS NULL`); got != 1 {
		t.Errorf("the seed row (off, default URL and model, no key) is missing")
	}
	if _, err := d.Exec(`INSERT INTO recipe_assistant_settings(id) VALUES (2)`); err == nil {
		t.Error("the settings table must hold exactly one row (CHECK id = 1)")
	}
	mustExec(t, d, `INSERT INTO recipe_assistant_events(at,actor_user_id,actor_email,action,detail) VALUES ('2026-11-10T10:00:00Z', 99, 'gone@example.test', 'turned_on', '')`)
	if got := count(t, d, `SELECT count(*) FROM recipe_assistant_events`); got != 1 {
		t.Errorf("an event for an actor that is not a User (no foreign key) must be accepted")
	}
}

// Migrating twice is a no-op and keeps what the Admin saved.
func TestRecipeAssistantMigrationKeepsSavedSettings(t *testing.T) {
	d, _ := openTemp(t)
	ctx := context.Background()
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatal(err)
	}
	mustExec(t, d, `UPDATE recipe_assistant_settings SET enabled=1, model='claude-sonnet-5-5' WHERE id=1`)
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatal(err)
	}
	if got := count(t, d, `SELECT count(*) FROM recipe_assistant_settings WHERE enabled=1 AND model='claude-sonnet-5-5'`); got != 1 {
		t.Errorf("a second migration run must keep the saved settings")
	}
}
