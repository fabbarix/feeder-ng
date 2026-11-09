package bdd

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"strconv"
	"strings"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func init() {
	RegisterSteps("ingredients", ingredientSteps)
	// Stands in for recipe lines, products, stock lots ... of later teams.
	store.RegisterMover(bddIngredientRefs{})
}

const bddRefsTable = "bdd_ingredient_refs"

// bddIngredientRefs is a ReferenceMover over a table the steps create on demand.
// It tolerates the table's absence because the mover is registered for the whole test binary.
type bddIngredientRefs struct{}

func (bddIngredientRefs) Name() string { return "bdd test references" }

func (bddIngredientRefs) exists(ctx context.Context, q store.Querier) bool {
	var n int
	err := q.QueryRowContext(ctx, `SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?`, bddRefsTable).Scan(&n)
	return err == nil && n > 0
}

func (m bddIngredientRefs) Count(ctx context.Context, q store.Querier, id int64) (int, error) {
	if !m.exists(ctx, q) {
		return 0, nil
	}
	var n int
	err := q.QueryRowContext(ctx, `SELECT count(*) FROM `+bddRefsTable+` WHERE ingredient_id=?`, id).Scan(&n)
	return n, err
}

func (m bddIngredientRefs) Move(ctx context.Context, tx *sql.Tx, from, to int64) error {
	if !m.exists(ctx, tx) {
		return nil
	}
	_, err := tx.ExecContext(ctx, `UPDATE `+bddRefsTable+` SET ingredient_id=? WHERE ingredient_id=?`, to, from)
	return err
}

func ingredientSteps(sc *godog.ScenarioContext, w *World) {
	idOf := func(name string) (int64, error) {
		id, ok := w.Vars["ingredient:"+name].(int64)
		if !ok {
			return 0, fmt.Errorf("no Ingredient %q was set up by this scenario", name)
		}
		return id, nil
	}
	path := func(name, suffix string) (string, error) {
		id, err := idOf(name)
		if err != nil {
			return "", err
		}
		return "/api/ingredients/" + strconv.FormatInt(id, 10) + suffix, nil
	}
	send := func(method, name, suffix string, body any) error {
		p, err := path(name, suffix)
		if err != nil {
			return err
		}
		w.Last = w.Client.Do(method, p, body)
		return nil
	}

	create := func(row map[string]string) error {
		body := map[string]any{"name": row["name"], "baseUnit": row["baseUnit"]}
		if d := row["shelfLifeDays"]; d != "" {
			n, _ := strconv.Atoi(d)
			body["shelfLifeDays"] = n
		}
		var cs []map[string]any
		for _, pair := range strings.Split(row["conversions"], ";") {
			if pair = strings.TrimSpace(pair); pair == "" {
				continue
			}
			unit, v, _ := strings.Cut(pair, "=")
			f, err := strconv.ParseFloat(v, 64)
			if err != nil {
				return fmt.Errorf("bad conversion %q", pair)
			}
			cs = append(cs, map[string]any{"unit": unit, "toBase": f})
		}
		body["conversions"] = cs
		env := w.Ensure()
		r := env.LoginAdmin(w.TB).Post("/api/ingredients", body)
		if r.Status != 201 {
			return fmt.Errorf("creating %q: status %d: %s", row["name"], r.Status, r.Body)
		}
		var out struct{ ID int64 }
		if err := r.JSON(&out); err != nil {
			return err
		}
		w.Vars["ingredient:"+row["name"]] = out.ID
		return nil
	}

	sc.Step(`^the Household has the Ingredient "([^"]*)" with Base Unit (g|ml|piece)$`, func(name, base string) error {
		return create(map[string]string{"name": name, "baseUnit": base})
	})
	sc.Step(`^the Household has these Ingredients:$`, func(t *godog.Table) error {
		head := t.Rows[0].Cells
		for _, r := range t.Rows[1:] {
			row := map[string]string{}
			for i, c := range r.Cells {
				row[head[i].Value] = c.Value
			}
			if err := create(row); err != nil {
				return err
			}
		}
		return nil
	})
	sc.Step(`^the Ingredient "([^"]*)" is referenced (\d+) times? by other features$`, func(name string, want int) error {
		id, err := idOf(name)
		if err != nil {
			return err
		}
		env := w.Ensure()
		if _, err := env.DB.Exec(`CREATE TABLE IF NOT EXISTS ` + bddRefsTable + ` (id INTEGER PRIMARY KEY, ingredient_id INTEGER NOT NULL REFERENCES ingredients(id))`); err != nil {
			return err
		}
		var have int
		if err := env.DB.QueryRow(`SELECT count(*) FROM `+bddRefsTable+` WHERE ingredient_id=?`, id).Scan(&have); err != nil {
			return err
		}
		for i := have; i < want; i++ {
			if _, err := env.DB.Exec(`INSERT INTO `+bddRefsTable+`(ingredient_id) VALUES (?)`, id); err != nil {
				return err
			}
		}
		return nil
	})
	sc.Step(`^the Ingredient "([^"]*)" has (\d+) references? from other features$`, func(name string, want int) error {
		id, err := idOf(name)
		if err != nil {
			return err
		}
		var have int
		if err := w.Ensure().DB.QueryRow(`SELECT count(*) FROM `+bddRefsTable+` WHERE ingredient_id=?`, id).Scan(&have); err != nil {
			return err
		}
		if have != want {
			return fmt.Errorf("Ingredient %q has %d references, want %d", name, have, want)
		}
		return nil
	})

	sc.Step(`^I (GET|DELETE) the Ingredient "([^"]*)"$`, func(method, name string) error { return send(method, name, "", nil) })
	sc.Step(`^I (PATCH|PUT) the Ingredient "([^"]*)" with JSON:$`, func(method, name string, doc *godog.DocString) error {
		return send(method, name, "", []byte(doc.Content))
	})
	sc.Step(`^I PUT the conversion "([^"]*)" of the Ingredient "([^"]*)" with JSON:$`, func(unit, name string, doc *godog.DocString) error {
		return send("PUT", name, "/conversions/"+url.PathEscape(unit), []byte(doc.Content))
	})
	sc.Step(`^I DELETE the conversion "([^"]*)" of the Ingredient "([^"]*)"$`, func(unit, name string) error {
		return send("DELETE", name, "/conversions/"+url.PathEscape(unit), nil)
	})

	merge := func(source, target, resolutions string) error {
		tid, err := idOf(target)
		if err != nil {
			return err
		}
		body := `{"into": ` + strconv.FormatInt(tid, 10)
		if resolutions != "" {
			body += `, "resolutions": ` + resolutions
		}
		return send("POST", source, "/merge", []byte(body+"}"))
	}
	sc.Step(`^I merge the Ingredient "([^"]*)" into "([^"]*)"$`, func(s, t string) error { return merge(s, t, "") })
	sc.Step(`^I merge the Ingredient "([^"]*)" into "([^"]*)" with resolutions:$`, func(s, t string, doc *godog.DocString) error {
		return merge(s, t, doc.Content)
	})
	sc.Step(`^I preview merging the Ingredient "([^"]*)" into "([^"]*)"$`, func(s, t string) error {
		tid, err := idOf(t)
		if err != nil {
			return err
		}
		return send("GET", s, "/merge-preview?into="+strconv.FormatInt(tid, 10), nil)
	})
	sc.Step(`^I search Ingredients for "([^"]*)"$`, func(q string) { w.Last = w.Client.Get("/api/ingredients/search?q=" + url.QueryEscape(q)) })

	sc.Step(`^the Ingredient "([^"]*)" (still exists|no longer exists)$`, func(name, which string) error {
		p, err := path(name, "")
		if err != nil {
			return err
		}
		status := w.Client.Get(p).Status
		if which == "still exists" && status != 200 || which == "no longer exists" && status != 404 {
			return fmt.Errorf("GET %s = %d, but the Ingredient %s", p, status, which)
		}
		return nil
	})

	sc.Step(`^the Ingredient response conversions are:$`, func(t *godog.Table) error {
		var got struct {
			Conversions []struct {
				Unit   string  `json:"unit"`
				ToBase float64 `json:"toBase"`
			} `json:"conversions"`
		}
		if err := w.Last.JSON(&got); err != nil {
			return err
		}
		rows := t.Rows[1:]
		if len(got.Conversions) != len(rows) {
			return fmt.Errorf("conversions = %+v, want %d rows", got.Conversions, len(rows))
		}
		for i, r := range rows {
			want, _ := strconv.ParseFloat(r.Cells[1].Value, 64)
			if got.Conversions[i].Unit != r.Cells[0].Value || got.Conversions[i].ToBase != want {
				return fmt.Errorf("conversion %d = %+v, want %s=%s", i, got.Conversions[i], r.Cells[0].Value, r.Cells[1].Value)
			}
		}
		return nil
	})
	sc.Step(`^the Ingredient response has no Shelf Life$`, func() error {
		var got map[string]any
		if err := w.Last.JSON(&got); err != nil {
			return err
		}
		if v, ok := got["shelfLifeDays"]; !ok || v != nil {
			return fmt.Errorf("shelfLifeDays = %v (present %v), want null", v, ok)
		}
		return nil
	})
	sc.Step(`^the Ingredient list names are "([^"]*)"$`, func(want string) error {
		var got []struct{ Name string }
		if err := w.Last.JSON(&got); err != nil {
			return err
		}
		var names []string
		for _, i := range got {
			names = append(names, i.Name)
		}
		if g := strings.Join(names, ", "); g != want {
			return fmt.Errorf("names = %q, want %q", g, want)
		}
		return nil
	})
	sc.Step(`^the merge conflicts are:$`, func(t *godog.Table) error {
		var got struct {
			Conflicts []struct {
				Kind   string  `json:"kind"`
				Unit   string  `json:"unit"`
				Source float64 `json:"source"`
				Target float64 `json:"target"`
			} `json:"conflicts"`
		}
		if err := w.Last.JSON(&got); err != nil {
			return err
		}
		rows := t.Rows[1:]
		if len(got.Conflicts) != len(rows) {
			return fmt.Errorf("conflicts = %+v, want %d", got.Conflicts, len(rows))
		}
		for i, r := range rows {
			s, _ := strconv.ParseFloat(r.Cells[2].Value, 64)
			tg, _ := strconv.ParseFloat(r.Cells[3].Value, 64)
			c := got.Conflicts[i]
			if c.Kind != r.Cells[0].Value || c.Unit != r.Cells[1].Value || c.Source != s || c.Target != tg {
				return fmt.Errorf("conflict %d = %+v, want %v", i, c, r.Cells)
			}
		}
		return nil
	})

	search := func() (exact string, hasExact bool, sugg []string, err error) {
		var got struct {
			Exact       *struct{ Name string } `json:"exact"`
			Suggestions []struct {
				Ingredient struct{ Name string } `json:"ingredient"`
				Score      float64               `json:"score"`
			} `json:"suggestions"`
		}
		if err = w.Last.JSON(&got); err != nil {
			return
		}
		if got.Exact != nil {
			exact, hasExact = got.Exact.Name, true
		}
		for _, s := range got.Suggestions {
			sugg = append(sugg, s.Ingredient.Name)
		}
		return
	}
	sc.Step(`^the search exact match is "([^"]*)"$`, func(want string) error {
		g, ok, _, err := search()
		if err != nil || !ok || g != want {
			return fmt.Errorf("exact = %q (%v), %v; want %q", g, ok, err, want)
		}
		return nil
	})
	sc.Step(`^the search has no exact match$`, func() error {
		g, ok, _, err := search()
		if err != nil || ok {
			return fmt.Errorf("exact = %q, %v; want none", g, err)
		}
		return nil
	})
	sc.Step(`^the search has no suggestions$`, func() error {
		_, _, s, err := search()
		if err != nil || len(s) != 0 {
			return fmt.Errorf("suggestions = %v, %v; want none", s, err)
		}
		return nil
	})
	sc.Step(`^the search has (\d+) suggestions?$`, func(n int) error {
		_, _, s, err := search()
		if err != nil || len(s) != n {
			return fmt.Errorf("suggestions = %v, %v; want %d", s, err, n)
		}
		return nil
	})
	sc.Step(`^the first search suggestion is "([^"]*)"$`, func(want string) error {
		_, _, s, err := search()
		if err != nil || len(s) == 0 || s[0] != want {
			return fmt.Errorf("suggestions = %v, %v; want first %q", s, err, want)
		}
		return nil
	})
	_ = testkit.AdminEmail
}
