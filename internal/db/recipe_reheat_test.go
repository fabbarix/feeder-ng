package db_test

import (
	"context"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// R12 (2026-11-10): migration 1220 adds the optional per-Recipe reheat time and keeps every existing Recipe
// (their reheat time is NULL, so Reheat keeps using its formula for them).
func TestRecipeReheatMinutesColumn(t *testing.T) {
	d, _ := openTemp(t)
	ctx := context.Background()
	if err := db.Migrate(ctx, d, upTo(t, "1220_")); err != nil {
		t.Fatal(err)
	}
	if got := count(t, d, `SELECT count(*) FROM pragma_table_info('recipes') WHERE name='reheat_minutes'`); got != 0 {
		t.Fatalf("precondition: reheat_minutes present = %d", got)
	}
	mustExec(t, d, `INSERT INTO recipes(id,name,yield,created_at,updated_at) VALUES (7,'Old curry',4,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`)

	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if got := count(t, d, `SELECT count(*) FROM pragma_table_info('recipes') WHERE name='reheat_minutes'`); got != 1 {
		t.Fatalf("recipes.reheat_minutes missing after migration 1220")
	}
	if got := count(t, d, `SELECT count(*) FROM recipes WHERE id=7 AND name='Old curry' AND reheat_minutes IS NULL`); got != 1 {
		t.Errorf("the existing Recipe must be kept with a NULL reheat time")
	}
	mustExec(t, d, `UPDATE recipes SET reheat_minutes=5 WHERE id=7`)
	if got := count(t, d, `SELECT reheat_minutes FROM recipes WHERE id=7`); got != 5 {
		t.Errorf("reheat_minutes = %d, want 5", got)
	}
}
