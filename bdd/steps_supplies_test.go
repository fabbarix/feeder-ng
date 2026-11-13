package bdd

import (
	"fmt"
	"strings"

	"github.com/cucumber/godog"
)

// Step definitions for bdd/features/supplies/supplies_migration.feature (H8): migration 1550 and what it leaves.
// Every phrase names the migration, the table or "the way beta.6 wrote it", so none collides with another set.

func init() { RegisterSteps("supplies-migration", suppliesMigrationSteps) }

func suppliesMigrationSteps(sc *godog.ScenarioContext, w *World) {
	sc.Step(`^the migration "([^"]*)" is recorded$`, func(name string) error {
		var n int
		if err := w.Ensure().DB.QueryRow(`SELECT count(*) FROM schema_migrations WHERE name = ?`, name).Scan(&n); err != nil || n != 1 {
			return fmt.Errorf("migration %s recorded %d times (%v)", name, n, err)
		}
		return nil
	})
	sc.Step(`^the Ingredients table has the columns "([^"]*)" and "([^"]*)"$`, func(a, b string) error {
		rows, err := w.Ensure().DB.Query(`SELECT name FROM pragma_table_info('ingredients')`)
		if err != nil {
			return err
		}
		defer rows.Close()
		have := map[string]bool{}
		for rows.Next() {
			var n string
			_ = rows.Scan(&n)
			have[n] = true
		}
		if !have[a] || !have[b] {
			return fmt.Errorf("ingredients has %v, want %s and %s", have, a, b)
		}
		return nil
	})
	// A row as beta.6 wrote it: no kind and no Restock level in the INSERT, so the migration's defaults fill them.
	sc.Step(`^an Ingredient "([^"]*)" was written the way beta.6 wrote it, with a Product and (\d+) g in Stock$`, func(name string, grams int) error {
		db := w.Ensure().DB
		now := w.Env.Clock.Now().UTC().Format("2006-01-02T15:04:05Z")
		res, err := db.Exec(`INSERT INTO ingredients (name, name_key, base_unit, shelf_life_days, created_at, updated_at)
			VALUES (?, ?, 'g', NULL, ?, ?)`, name, strings.ToLower(name), now, now)
		if err != nil {
			return err
		}
		iid, _ := res.LastInsertId()
		w.Vars["h8:ingredient:"+name] = iid
		w.Vars["ingredient:"+name] = iid
		c := w.Client
		if c == nil || c == w.Env.Anonymous() {
			c = w.Env.LoginAdmin(w.TB)
		}
		r := c.Post("/api/products", map[string]any{"name": "Flour 1 kg", "ingredientId": iid, "packSize": 1000})
		if r.Status != 201 {
			return fmt.Errorf("product: %d %s", r.Status, r.Body)
		}
		if r := c.Post("/api/stock/lots", map[string]any{"ingredientId": iid, "quantity": grams, "purchased": "2026-11-05"}); r.Status != 201 {
			return fmt.Errorf("stock: %d %s", r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^the Product "([^"]*)" of "([^"]*)" is still in the catalogue$`, func(prod, ing string) error {
		iid, _ := w.Vars["h8:ingredient:"+ing].(int64)
		var n int
		if err := w.Env.DB.QueryRow(`SELECT count(*) FROM products WHERE name = ? AND ingredient_id = ?`, prod, iid).Scan(&n); err != nil || n != 1 {
			return fmt.Errorf("%d Products named %q (%v)", n, prod, err)
		}
		return nil
	})
	sc.Step(`^the Household holds (\d+) g of "([^"]*)" in Stock$`, func(want int, ing string) error {
		iid, _ := w.Vars["h8:ingredient:"+ing].(int64)
		var got float64
		if err := w.Env.DB.QueryRow(`SELECT COALESCE(SUM(quantity), 0) FROM stock_lots WHERE ingredient_id = ?`, iid).Scan(&got); err != nil {
			return err
		}
		if got != float64(want) {
			return fmt.Errorf("Stock of %s = %v, want %d", ing, got, want)
		}
		return nil
	})
	sc.Step(`^the backups listed do not include "([^"]*)"$`, func(name string) error {
		if strings.Contains(string(w.Last.Body), name) {
			return fmt.Errorf("the list holds %s: %s", name, w.Last.Body)
		}
		return nil
	})
}
