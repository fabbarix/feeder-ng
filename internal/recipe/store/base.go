package store

// Base recipes in the Recipe store (ADR 0015, docs/dev/design/base-recipes.md §3, §10, §12): the kind change, the
// Base recipe Ingredient lifecycle (creating, taking over, renaming, releasing), linking a line, the bulk link, the
// need tree and the composed cooking timeline. Every write runs in one transaction; a refused write changes nothing.

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"time"

	ingredient "github.com/fabbarix/feeder-ng/internal/ingredient"
	ingstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	"github.com/fabbarix/feeder-ng/internal/units"
)

var errNeedsIngredients = errors.New("base recipes need the Ingredient store (WithIngredients)")

// WithIngredients wires the Ingredient store the Base recipe lifecycle uses (create, take over, rename, release,
// merge): the Store never writes `ingredients` itself. The ingredient store should have been built with
// ingstore.WithBaseRecipes(NewBaseRecipePort(db)), so its delete and merge guards see this Store's Base recipes.
func (s *Store) WithIngredients(is *ingstore.Store) *Store {
	s.ings = is
	return s
}

// NewBaseRecipePort is the ingredient store's port (ingstore.BaseRecipes) over the Recipe tables: which Base recipe an
// Ingredient belongs to, and the cycle a merge into a Base recipe's Ingredient would make (baserecipe.FindCycle).
func NewBaseRecipePort(d *sql.DB) ingstore.BaseRecipes { return basePort{d} }

type basePort struct{ db *sql.DB }

func (basePort) BaseRecipeOf(ctx context.Context, q ingstore.Querier, ingredientID int64) (*ingstore.BaseRecipeRef, error) {
	var ref ingstore.BaseRecipeRef
	var archived int64
	err := q.QueryRowContext(ctx, `SELECT id, name, archived FROM recipes WHERE base_ingredient_id = ?`, ingredientID).
		Scan(&ref.ID, &ref.Name, &archived)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	ref.Archived = archived == 1
	return &ref, nil
}

func (basePort) MergeCycle(ctx context.Context, q ingstore.Querier, sourceID, targetID int64) ([]string, error) {
	return mergeCycle(ctx, q, sourceID, targetID)
}

// mergeCycle is the cycle merging source into the Base recipe's Ingredient target would make: the Recipes with lines on
// source start calling that Base recipe. nil when target is no Base recipe's Ingredient or no cycle results.
func mergeCycle(ctx context.Context, q Querier, sourceID, targetID int64) ([]string, error) {
	var base int64
	err := q.QueryRowContext(ctx, `SELECT id FROM recipes WHERE base_ingredient_id = ?`, targetID).Scan(&base)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	cat, err := loadCatalog(ctx, q)
	if err != nil {
		return nil, err
	}
	edges := cat.graph()
	users, err := recipesWithLinesOn(ctx, q, sourceID)
	if err != nil {
		return nil, err
	}
	for _, x := range users {
		edges[x] = append(edges[x], base)
		if path := baserecipe.FindCycle(edges, cat.names, x); path != nil {
			return path, nil
		}
	}
	return nil, nil
}

// ---- Catalog: the stored Recipes as baserecipe.Catalog, loaded in one read ----

type catalog struct {
	recipes  map[int64]baserecipe.Recipe
	names    map[int64]string
	archived map[int64]bool
	lineIDs  map[int64][]int64 // recipe id -> its line ids, by line index
	baseOf   map[int64]int64   // Ingredient id -> the Base recipe whose Ingredient it is
	ings     map[int64]units.Ingredient
}

// Recipe implements baserecipe.Catalog.
func (c *catalog) Recipe(id int64) (baserecipe.Recipe, bool) {
	r, ok := c.recipes[id]
	return r, ok
}

// BaseOf implements baserecipe.Catalog.
func (c *catalog) BaseOf(ingredientID int64) (int64, bool) {
	b, ok := c.baseOf[ingredientID]
	return b, ok
}

// Units implements baserecipe.Catalog.
func (c *catalog) Units(ingredientID int64) (units.Ingredient, bool) {
	u, ok := c.ings[ingredientID]
	return u, ok
}

// calls returns the Base recipes the lines of Recipe id call for.
func (c *catalog) calls(id int64) []int64 {
	var out []int64
	for _, l := range c.recipes[id].Lines {
		if b, ok := c.baseOf[l.IngredientID]; ok {
			out = append(out, b)
		}
	}
	return out
}

// graph is the "calls for" graph: Recipe id to the Base recipes its lines call for (for FindCycle and the candidates).
func (c *catalog) graph() map[int64][]int64 {
	out := map[int64][]int64{}
	for id := range c.recipes {
		if calls := c.calls(id); len(calls) > 0 {
			out[id] = calls
		}
	}
	return out
}

// loadCatalog reads every Recipe, its lines, Steps and uses, and every Ingredient with its Unit Conversions.
func loadCatalog(ctx context.Context, q Querier) (*catalog, error) {
	c := &catalog{
		recipes: map[int64]baserecipe.Recipe{}, names: map[int64]string{}, archived: map[int64]bool{},
		lineIDs: map[int64][]int64{}, baseOf: map[int64]int64{}, ings: map[int64]units.Ingredient{},
	}
	if err := c.loadRecipes(ctx, q); err != nil {
		return nil, err
	}
	if err := c.loadLines(ctx, q); err != nil {
		return nil, err
	}
	if err := c.loadSteps(ctx, q); err != nil {
		return nil, err
	}
	if err := c.loadIngredients(ctx, q); err != nil {
		return nil, err
	}
	return c, nil
}

func (c *catalog) loadRecipes(ctx context.Context, q Querier) error {
	rows, err := q.QueryContext(ctx, `SELECT id, name, archived, base_ingredient_id, yield, yield_unit FROM recipes`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id, archived int64
		var name string
		var base sql.NullInt64
		var yield float64
		var yieldUnit sql.NullString
		if err := rows.Scan(&id, &name, &archived, &base, &yield, &yieldUnit); err != nil {
			return err
		}
		r := baserecipe.Recipe{ID: id, Name: name}
		if base.Valid {
			r.Base = &baserecipe.Yield{IngredientID: base.Int64, Quantity: yield, Unit: yieldUnit.String}
			c.baseOf[base.Int64] = id
		}
		c.recipes[id] = r
		c.names[id] = name
		c.archived[id] = archived == 1
	}
	return rows.Err()
}

func (c *catalog) loadLines(ctx context.Context, q Querier) error {
	rows, err := q.QueryContext(ctx, `SELECT id, recipe_id, ingredient_id, quantity, unit, optional, needed_at_step
	        FROM recipe_lines ORDER BY recipe_id, position`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id, recipeID, ing, optional int64
		var qty float64
		var unit string
		var needed sql.NullInt64
		if err := rows.Scan(&id, &recipeID, &ing, &qty, &unit, &optional, &needed); err != nil {
			return err
		}
		r, ok := c.recipes[recipeID]
		if !ok {
			continue
		}
		l := baserecipe.Line{IngredientID: ing, Quantity: qty, Unit: unit, Optional: optional == 1}
		if needed.Valid {
			n := int(needed.Int64)
			l.NeededAtStep = &n
		}
		r.Lines = append(r.Lines, l)
		c.recipes[recipeID] = r
		c.lineIDs[recipeID] = append(c.lineIDs[recipeID], id)
	}
	return rows.Err()
}

func (c *catalog) loadSteps(ctx context.Context, q Querier) error {
	rows, err := q.QueryContext(ctx, `SELECT recipe_id, text, kind, duration_minutes, lead_time_minutes, after_json
	        FROM recipe_steps ORDER BY recipe_id, position`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var recipeID int64
		var st baserecipe.Step
		var kind, after string
		if err := rows.Scan(&recipeID, &st.Text, &kind, &st.DurationMinutes, &st.LeadTimeMinutes, &after); err != nil {
			return err
		}
		st.Kind = schedule.Kind(kind)
		if err := json.Unmarshal([]byte(after), &st.After); err != nil {
			return err
		}
		r, ok := c.recipes[recipeID]
		if !ok {
			continue
		}
		r.Steps = append(r.Steps, st)
		c.recipes[recipeID] = r
	}
	if err := rows.Err(); err != nil {
		return err
	}
	uses, err := q.QueryContext(ctx, `SELECT recipe_id, step_position, ingredient_id, quantity, unit
	        FROM recipe_step_uses ORDER BY recipe_id, step_position, position`)
	if err != nil {
		return err
	}
	defer uses.Close()
	for uses.Next() {
		var recipeID int64
		var pos int
		var u schedule.Use
		if err := uses.Scan(&recipeID, &pos, &u.IngredientID, &u.Quantity, &u.Unit); err != nil {
			return err
		}
		r, ok := c.recipes[recipeID]
		if !ok || pos < 0 || pos >= len(r.Steps) {
			continue
		}
		r.Steps[pos].Uses = append(r.Steps[pos].Uses, u)
		c.recipes[recipeID] = r
	}
	return uses.Err()
}

func (c *catalog) loadIngredients(ctx context.Context, q Querier) error {
	rows, err := q.QueryContext(ctx, `SELECT id, name, base_unit FROM ingredients`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var name, base string
		if err := rows.Scan(&id, &name, &base); err != nil {
			return err
		}
		c.ings[id] = units.Ingredient{Name: name, Base: units.Base(base)}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	cs, err := q.QueryContext(ctx, `SELECT ingredient_id, unit, to_base FROM ingredient_conversions ORDER BY ingredient_id, unit`)
	if err != nil {
		return err
	}
	defer cs.Close()
	for cs.Next() {
		var id int64
		var conv units.Conversion
		if err := cs.Scan(&id, &conv.Unit, &conv.ToBase); err != nil {
			return err
		}
		if u, ok := c.ings[id]; ok {
			u.Conversions = append(u.Conversions, conv)
			c.ings[id] = u
		}
	}
	return cs.Err()
}

// ---- Reads used by the kind change, the link and the views ----

// recipesWithLinesOn lists the Recipes (archived included) with a line on the Ingredient, by id.
func recipesWithLinesOn(ctx context.Context, q Querier, ingredientID int64) ([]int64, error) {
	rows, err := q.QueryContext(ctx, `SELECT DISTINCT recipe_id FROM recipe_lines WHERE ingredient_id = ? ORDER BY recipe_id`, ingredientID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// usedBy lists the Recipes (archived included) with a line calling for the Base recipe's Ingredient, by name.
func usedBy(ctx context.Context, q Querier, ingredientID int64) ([]recipe.Ref, error) {
	rows, err := q.QueryContext(ctx, `SELECT r.id, r.name, r.archived FROM recipes r
	        WHERE EXISTS (SELECT 1 FROM recipe_lines rl WHERE rl.recipe_id = r.id AND rl.ingredient_id = ?)
	        ORDER BY lower(r.name), r.id`, ingredientID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []recipe.Ref{}
	for rows.Next() {
		var ref recipe.Ref
		var archived int64
		if err := rows.Scan(&ref.ID, &ref.Name, &archived); err != nil {
			return nil, err
		}
		ref.Archived = archived == 1
		out = append(out, ref)
	}
	return out, rows.Err()
}

// baseIngredientOf is the Ingredient of the Base recipe id (sql.ErrNoRows when it is no Base recipe).
func baseIngredientOf(ctx context.Context, q Querier, recipeID int64) (int64, error) {
	var ing int64
	err := q.QueryRowContext(ctx, `SELECT base_ingredient_id FROM recipes WHERE id = ? AND base_ingredient_id IS NOT NULL`, recipeID).Scan(&ing)
	return ing, err
}

// isBaseIngredient reports whether a Base recipe's Ingredient is the id.
func isBaseIngredient(ctx context.Context, q Querier, ingredientID int64) (bool, error) {
	var n int
	err := q.QueryRowContext(ctx, `SELECT count(*) FROM recipes WHERE base_ingredient_id = ?`, ingredientID).Scan(&n)
	return n > 0, err
}

// nameHolders lists what holds a Base recipe's name (§3.2): plain Ingredients with the name (a Ready Meal's ones
// marked), and the other Base recipes with it. The Base recipe selfID is left out.
func nameHolders(ctx context.Context, q Querier, name string, selfID int64) ([]recipe.NameHolder, error) {
	key := units.NormalizeName(name)
	rows, err := q.QueryContext(ctx, `SELECT id, name FROM ingredients WHERE name_key = ?`, key)
	if err != nil {
		return nil, err
	}
	var out []recipe.NameHolder
	for rows.Next() {
		var h recipe.NameHolder
		if err := rows.Scan(&h.IngredientID, &h.Name); err != nil {
			rows.Close()
			return nil, err
		}
		h.Kind = recipe.HolderPlain
		out = append(out, h)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	for i := range out {
		var ready int
		if err := q.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM recipe_lines rl JOIN recipes r ON r.id = rl.recipe_id
		        WHERE r.ready_meal = 1 AND rl.ingredient_id = ?)`, out[i].IngredientID).Scan(&ready); err != nil {
			return nil, err
		}
		if ready == 1 {
			out[i].Kind = recipe.HolderReadyMeal
		}
	}
	bases, err := q.QueryContext(ctx, `SELECT id, name, base_ingredient_id FROM recipes WHERE base_ingredient_id IS NOT NULL AND id != ?`, selfID)
	if err != nil {
		return nil, err
	}
	defer bases.Close()
	for bases.Next() {
		var id, ing int64
		var rname string
		if err := bases.Scan(&id, &rname, &ing); err != nil {
			return nil, err
		}
		if units.NormalizeName(rname) == key {
			out = append(out, recipe.NameHolder{IngredientID: ing, Name: rname, Kind: recipe.HolderBaseRecipe})
		}
	}
	return out, bases.Err()
}

// plainHolder is the plain Ingredient (other than id) with the normalised name key, zero when none.
func plainHolder(ctx context.Context, q Querier, key string, id int64) (recipe.IngredientRef, error) {
	var ref recipe.IngredientRef
	err := q.QueryRowContext(ctx, `SELECT id, name FROM ingredients WHERE name_key = ? AND id != ?`, key, id).Scan(&ref.ID, &ref.Name)
	if errors.Is(err, sql.ErrNoRows) {
		return recipe.IngredientRef{}, nil
	}
	return ref, err
}

// ---- Expansion, the cooking timeline and the views ----

// NeedTree is baserecipe.Expand over the stored Recipes: the need tree of one Batch of the Recipe, in Base Units.
// baserecipe.ErrNotFound; a cycle (data written before a check) is baserecipe.ErrCycle.
func (s *Store) NeedTree(ctx context.Context, id int64) ([]baserecipe.Need, error) {
	cat, err := loadCatalog(ctx, s.db)
	if err != nil {
		return nil, err
	}
	return baserecipe.Expand(cat, id)
}

// Cook is baserecipe.ComposeSteps over the stored Recipes: the Recipe's Steps with its Base recipes' Steps in them,
// each carrying its Origin. made nil = nothing in Stock.
func (s *Store) Cook(ctx context.Context, id int64, made func(baserecipe.Path) float64) (baserecipe.Composed, error) {
	cat, err := loadCatalog(ctx, s.db)
	if err != nil {
		return baserecipe.Composed{}, err
	}
	return baserecipe.ComposeSteps(cat, id, made)
}

// withinOf collects the Ingredients inside the Base recipes of a need tree (Recipe.Within): a plain node is inside when
// the path of Base recipes above it is not empty, so a Recipe's own lines are not "within" it.
func withinOf(cat *catalog, nodes []baserecipe.Need, path []string, out *[]recipe.Within) {
	for _, n := range nodes {
		if n.BaseRecipeID != 0 && len(n.Made) > 0 {
			withinOf(cat, n.Made, append(append([]string(nil), path...), cat.names[n.BaseRecipeID]), out)
			continue
		}
		if len(path) == 0 {
			continue
		}
		u, _ := cat.Units(n.IngredientID)
		*out = append(*out, recipe.Within{IngredientID: n.IngredientID, Name: u.Name, Path: append([]string(nil), path...)})
	}
}

// ---- Writes: the Base recipe Ingredient ----

// writeYield keeps the Ingredient's `batch` Unit Conversion (the Yield in Base Units) and `portion` (1 piece) in step
// with the Yield (§3.2).
func (s *Store) writeYield(ctx context.Context, tx *sql.Tx, ingredientID int64, quantity float64, unit string) error {
	batch, ok := recipe.YieldInBase(quantity, unit)
	if !ok {
		return &recipe.ValidationError{Field: "yieldUnit", Code: recipe.CodeYieldUnitInvalid, Message: "the yield's unit has no Base Unit"}
	}
	if _, err := s.ings.SetConversionTx(ctx, tx, ingredientID, units.Conversion{Unit: "batch", ToBase: batch}); err != nil {
		return err
	}
	if units.NormalizeUnit(unit) == "portion" {
		_, err := s.ings.SetConversionTx(ctx, tx, ingredientID, units.Conversion{Unit: "portion", ToBase: 1})
		return err
	}
	return s.ings.RemoveConversionTx(ctx, tx, ingredientID, "portion")
}

// refusedName is the validation error of a name another Base recipe or a Ready Meal holds (§3.2).
func refusedName(code string) error {
	msg := "A Base recipe already uses that name"
	if code == recipe.CodeReadyMealNameTaken {
		msg = "A Ready Meal already uses that name"
	}
	return &recipe.ValidationError{Field: "name", Code: code, Message: msg}
}

// takeOverAsk is the ask of §3.2 for the plain Ingredient: the Recipes it is on and its Stock.
func takeOverAsk(ctx context.Context, q Querier, plain ingredient.Ingredient, convertible bool) error {
	recipes, err := usedBy(ctx, q, plain.ID)
	if err != nil {
		return err
	}
	var lots int
	if err := q.QueryRowContext(ctx, `SELECT count(*) FROM stock_lots WHERE ingredient_id = ?`, plain.ID).Scan(&lots); err != nil {
		return err
	}
	return &recipe.TakeOverError{
		Ingredient:  recipe.IngredientRef{ID: plain.ID, Name: plain.Name},
		Recipes:     recipes,
		StockLots:   lots,
		Convertible: convertible,
	}
}

// claimBase gives the Base recipe recipeID its Ingredient (§3.2): its own (created, or renamed and re-based when own is
// set), or the plain Ingredient taken over. The name is decided first: another Base recipe or a Ready Meal refuses it,
// a plain Ingredient is asked about (in.TakeOver nil = the ask, a *recipe.TakeOverError). It writes the Base recipe's
// link (base_ingredient_id) and the batch conversion, and returns the Ingredient's id.
func (s *Store) claimBase(ctx context.Context, tx *sql.Tx, recipeID, own int64, in recipe.Input, keepName bool) (int64, error) {
	if s.ings == nil {
		return 0, errNeedsIngredients
	}
	base, ok := recipe.YieldBase(in.YieldUnit)
	if !ok {
		return 0, &recipe.ValidationError{Field: "yieldUnit", Code: recipe.CodeYieldUnitInvalid, Message: "a Base recipe's yield needs a unit"}
	}
	var dec recipe.NameDecision
	if keepName && own != 0 {
		// The name did not change: no name is asked about again (the ask is for a new name, §3.2).
		dec = recipe.NameDecision{Action: recipe.NameOwn}
	} else {
		holders, err := nameHolders(ctx, tx, in.Name, recipeID)
		if err != nil {
			return 0, err
		}
		dec = recipe.DecideBaseRecipeName(in.Name, holders)
	}
	var err error
	var ing int64
	switch dec.Action {
	case recipe.NameRefuse:
		return 0, refusedName(dec.Code)
	case recipe.NameOwn:
		ing, err = s.ownIngredient(ctx, tx, recipeID, own, in.Name, base)
	default: // NameAsk
		var plain ingredient.Ingredient
		plain, err = s.ings.GetTx(ctx, tx, dec.TakeOver.IngredientID)
		if err != nil {
			return 0, err
		}
		convertible := plain.Base == base
		switch {
		case in.TakeOver == nil:
			return 0, takeOverAsk(ctx, tx, plain, convertible)
		case !*in.TakeOver:
			ing, err = s.ownIngredient(ctx, tx, recipeID, own, in.Name, base)
		case !convertible:
			return 0, &recipe.ValidationError{Field: "takeOver", Code: recipe.CodeTakeOverUnit,
				Message: "the Yield's unit does not convert to that Ingredient's Base Unit: keep it apart instead"}
		default:
			ing, err = s.adopt(ctx, tx, recipeID, own, plain.ID, in.Name)
		}
	}
	if err != nil {
		return 0, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE recipes SET base_ingredient_id = ? WHERE id = ?`, ing, recipeID); err != nil {
		return 0, err
	}
	if err := s.writeYield(ctx, tx, ing, in.Yield, in.YieldUnit); err != nil {
		return 0, err
	}
	return ing, nil
}

// ownIngredient creates the Base recipe's own Ingredient, or renames and re-bases the existing one.
func (s *Store) ownIngredient(ctx context.Context, tx *sql.Tx, recipeID, own int64, name string, base units.Base) (int64, error) {
	if own == 0 {
		ing, err := s.ings.CreateBaseRecipeTx(ctx, tx, recipeID, ingredient.Input{Name: name, Base: base})
		return ing.ID, err
	}
	if err := s.ings.RenameBaseRecipeTx(ctx, tx, own, name); err != nil {
		return 0, err
	}
	if err := s.ings.BaseUnitTx(ctx, tx, own, base); err != nil {
		if errors.Is(err, ingstore.ErrInUse) {
			return 0, recipe.ErrBaseUnitInUse
		}
		return 0, err
	}
	return own, nil
}

// adopt takes the plain Ingredient over (§3.2, Yes). On a rename the former Ingredient of the Base recipe is merged into
// it first: the Base recipe points at the plain one, so the merge's guard does not apply to the former one, and its
// Stock and lines move with it. Batch and portion are rewritten from the Yield by the caller.
func (s *Store) adopt(ctx context.Context, tx *sql.Tx, recipeID, own, plainID int64, name string) (int64, error) {
	if own != 0 && own != plainID {
		if _, err := tx.ExecContext(ctx, `UPDATE recipes SET base_ingredient_id = ? WHERE id = ?`, plainID, recipeID); err != nil {
			return 0, err
		}
		// Stock and Products move explicitly: the merge's movers are the registered ones of the running build.
		for _, q := range []string{`UPDATE stock_lots SET ingredient_id = ? WHERE ingredient_id = ?`, `UPDATE products SET ingredient_id = ? WHERE ingredient_id = ?`} {
			if _, err := tx.ExecContext(ctx, q, plainID, own); err != nil {
				return 0, err
			}
		}
		for _, k := range []string{"batch", "portion"} {
			if err := s.ings.RemoveConversionTx(ctx, tx, own, k); err != nil {
				return 0, err
			}
			if err := s.ings.RemoveConversionTx(ctx, tx, plainID, k); err != nil {
				return 0, err
			}
		}
		if err := s.ings.MergeTx(ctx, tx, own, plainID, ingredient.Resolution{}); err != nil {
			return 0, err
		}
	}
	if err := s.ings.AdoptBaseRecipeTx(ctx, tx, plainID, recipeID); err != nil {
		return 0, err
	}
	if err := s.ings.RenameBaseRecipeTx(ctx, tx, plainID, name); err != nil {
		return 0, err
	}
	return plainID, nil
}

// releaseBase gives the Base recipe's Ingredient its plain key back (to-plannable): a plain Ingredient with the name
// is a *recipe.NameTakenError. The batch and portion conversions are the Base recipe's and go.
func (s *Store) releaseBase(ctx context.Context, tx *sql.Tx, ingredientID int64) error {
	cur, err := s.ings.GetTx(ctx, tx, ingredientID)
	if err != nil {
		return err
	}
	if err := s.ings.ReleaseBaseRecipeTx(ctx, tx, ingredientID); err != nil {
		if errors.Is(err, ingstore.ErrNameTaken) {
			holder, herr := plainHolder(ctx, tx, units.NormalizeName(cur.Name), ingredientID)
			if herr != nil {
				return herr
			}
			return &recipe.NameTakenError{Ingredient: holder}
		}
		return err
	}
	for _, k := range []string{"batch", "portion"} {
		if err := s.ings.RemoveConversionTx(ctx, tx, ingredientID, k); err != nil {
			return err
		}
	}
	return nil
}

// ---- Totals, cycles ----

// refreshTotals rewrites the cached total time of every Recipe that calls for the saved Base recipe, transitively, and of
// the saved Recipe when it has Base recipe lines: the total is the composed one, as if nothing is in Stock (§4.4).
func (s *Store) refreshTotals(ctx context.Context, tx *sql.Tx, id int64) error {
	cat, err := loadCatalog(ctx, tx)
	if err != nil {
		return err
	}
	graph := cat.graph()
	set := map[int64]bool{id: true}
	queue := []int64{id}
	for len(queue) > 0 {
		x := queue[0]
		queue = queue[1:]
		for r, calls := range graph {
			if set[r] {
				continue
			}
			for _, c := range calls {
				if c == x {
					set[r] = true
					queue = append(queue, r)
					break
				}
			}
		}
	}
	ids := make([]int64, 0, len(set))
	for r := range set {
		ids = append(ids, r)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	for _, r := range ids {
		if len(graph[r]) == 0 {
			continue
		}
		composed, err := baserecipe.ComposeSteps(cat, r, nil)
		if err != nil {
			continue // a cycle: the save that made it was refused
		}
		if _, err := tx.ExecContext(ctx, `UPDATE recipes SET total_minutes = ? WHERE id = ?`, composed.TotalMinutes, r); err != nil {
			return err
		}
	}
	return nil
}

// checkCycles refuses a saved Recipe that is on a cycle of Base recipes (§3.4), naming the line that closes it.
func checkCycles(ctx context.Context, tx *sql.Tx, savedID int64) error {
	cat, err := loadCatalog(ctx, tx)
	if err != nil {
		return err
	}
	path := baserecipe.FindCycle(cat.graph(), cat.names, savedID)
	if path == nil {
		return nil
	}
	field := "lines[0]"
	for i, l := range cat.recipes[savedID].Lines {
		if b, ok := cat.baseOf[l.IngredientID]; ok && cat.names[b] == path[1] {
			field = fmt.Sprintf("lines[%d]", i)
			break
		}
	}
	return &recipe.CycleError{Field: field, Path: path}
}

// ---- The Base recipe's own kind change and the Ingredient's name ----

// ToBasePreview is the dry run of ToBase (§3.6): what the confirm names. Nothing changes. ErrNotFound;
// *recipe.ValidationError base_recipe_ready_meal for a Ready Meal and base_recipe_kind for a Base recipe.
func (s *Store) ToBasePreview(ctx context.Context, id int64) (recipe.ToBasePlan, error) {
	rec, err := getRecipe(ctx, s.db, id)
	if err != nil {
		return recipe.ToBasePlan{}, err
	}
	if rec.ReadyMeal {
		return recipe.ToBasePlan{}, &recipe.ValidationError{Field: "readyMeal", Code: recipe.CodeBaseRecipeReadyMeal, Message: "a Ready Meal cannot be a Base recipe"}
	}
	if rec.IsBase() {
		return recipe.ToBasePlan{}, &recipe.ValidationError{Field: "baseRecipe", Code: recipe.CodeBaseRecipeKind, Message: "this Recipe is already a Base recipe"}
	}
	return s.toBasePlan(ctx, s.db, id)
}

// toBasePlan is what a kind change to a Base recipe removes: the unresolved Planned Meals from today on (Pinned and
// Bought included), the Slot Rules by the Recipe, its Leftovers and its Favourites and Dislikes.
func (s *Store) toBasePlan(ctx context.Context, q Querier, id int64) (recipe.ToBasePlan, error) {
	var plan recipe.ToBasePlan
	today, err := s.householdToday(ctx, q)
	if err != nil {
		return plan, err
	}
	rows, err := q.QueryContext(ctx, `SELECT pm.id, pm.date, ms.name, c.name, pm.pinned,
	        EXISTS (SELECT 1 FROM planned_meal_bought b WHERE b.planned_meal_id = pm.id)
	        FROM planned_meals pm
	        JOIN meal_slots ms ON ms.id = pm.meal_slot_id
	        JOIN courses c ON c.id = pm.course_id
	        WHERE pm.recipe_id = ? AND pm.state = 'planned' AND pm.date >= ?
	        ORDER BY pm.date, pm.id`, id, today)
	if err != nil {
		return plan, err
	}
	for rows.Next() {
		var m recipe.PlannedMealRef
		var pinned, bought int64
		if err := rows.Scan(&m.ID, &m.Date, &m.MealSlotName, &m.CourseName, &pinned, &bought); err != nil {
			rows.Close()
			return plan, err
		}
		m.Pinned, m.Bought = pinned == 1, bought == 1
		plan.PlannedMeals = append(plan.PlannedMeals, m)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return plan, err
	}
	rules, err := q.QueryContext(ctx, `SELECT sr.id, ms.name, c.name FROM slot_rules sr
	        JOIN meal_slots ms ON ms.id = sr.meal_slot_id JOIN courses c ON c.id = sr.course_id
	        WHERE sr.recipe_id = ? ORDER BY sr.id`, id)
	if err != nil {
		return plan, err
	}
	for rules.Next() {
		var r recipe.SlotRuleRef
		if err := rules.Scan(&r.ID, &r.MealSlotName, &r.CourseName); err != nil {
			rules.Close()
			return plan, err
		}
		plan.SlotRules = append(plan.SlotRules, r)
	}
	rules.Close()
	if err := rules.Err(); err != nil {
		return plan, err
	}
	if err := q.QueryRowContext(ctx, `SELECT count(*) FROM leftovers WHERE recipe_id = ?`, id).Scan(&plan.Leftovers); err != nil {
		return plan, err
	}
	if err := q.QueryRowContext(ctx, `SELECT count(*) FROM member_recipe_preferences WHERE recipe_id = ? AND state IN ('favourite', 'dislike')`, id).
		Scan(&plan.Preferences); err != nil {
		return plan, err
	}
	return plan, nil
}

// ToBase turns a plannable Recipe into a Base recipe in one transaction (§3.6): its unresolved Planned Meals from
// today on (Pinned and Bought included) and its Slot Rules go, Favourites and Dislikes on it go, Exclusions of it
// move to its Ingredient, Courses and the plannable-only fields are cleared, Cooked and Not cooked Planned Meals,
// past ones and Leftovers stay. Its Ingredient is created, or taken over after the ask of §3.2 (in.TakeOver; nil with
// a same-name plain Ingredient is a *recipe.TakeOverError). Errors: *recipe.ValidationError (yield, yieldUnit,
// base_recipe_ready_meal, base_recipe_kind, name rules), *recipe.CycleError never (a plannable Recipe has no
// Ingredient to be called for), ErrNotFound.
func (s *Store) ToBase(ctx context.Context, id int64, in recipe.ToBaseInput) (recipe.Recipe, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return recipe.Recipe{}, err
	}
	defer tx.Rollback()
	if err := s.toBaseTx(ctx, tx, id, in); err != nil {
		return recipe.Recipe{}, err
	}
	if err := tx.Commit(); err != nil {
		return recipe.Recipe{}, err
	}
	return s.Get(ctx, id)
}

// toBaseTx is ToBase inside the caller's transaction: the ask and the refusals come before anything changes.
func (s *Store) toBaseTx(ctx context.Context, tx *sql.Tx, id int64, in recipe.ToBaseInput) error {
	var name string
	var ready int64
	var base sql.NullInt64
	err := tx.QueryRowContext(ctx, `SELECT name, ready_meal, base_ingredient_id FROM recipes WHERE id = ?`, id).Scan(&name, &ready, &base)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if ready == 1 {
		return &recipe.ValidationError{Field: "readyMeal", Code: recipe.CodeBaseRecipeReadyMeal, Message: "a Ready Meal cannot be a Base recipe"}
	}
	if base.Valid {
		return &recipe.ValidationError{Field: "baseRecipe", Code: recipe.CodeBaseRecipeKind, Message: "this Recipe is already a Base recipe"}
	}
	if !finite(in.Yield) || in.Yield <= 0 || in.Yield > recipe.MaxBaseYield {
		return &recipe.ValidationError{Field: "yield", Code: recipe.CodeYieldInvalid, Message: "the yield must be more than 0 and at most 100000"}
	}
	unit := units.NormalizeUnit(in.YieldUnit)
	if _, ok := recipe.YieldBase(unit); !ok {
		return &recipe.ValidationError{Field: "yieldUnit", Code: recipe.CodeYieldUnitInvalid, Message: "a Base recipe's yield needs a unit"}
	}
	yes := true
	ing, err := s.claimBase(ctx, tx, id, 0, recipe.Input{Name: name, Yield: in.Yield, YieldUnit: unit, BaseRecipe: &yes, TakeOver: in.TakeOver}, false)
	if err != nil {
		return err
	}
	today, err := s.householdToday(ctx, tx)
	if err != nil {
		return err
	}
	for _, q := range []string{
		`DELETE FROM planned_meal_bought WHERE planned_meal_id IN (SELECT id FROM planned_meals WHERE recipe_id = ? AND state = 'planned' AND date >= ?)`,
		`DELETE FROM planned_meals WHERE recipe_id = ? AND state = 'planned' AND date >= ?`,
	} {
		if _, err := tx.ExecContext(ctx, q, id, today); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM slot_rules WHERE recipe_id = ?`, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO member_ingredient_exclusions (member_id, ingredient_id)
	        SELECT member_id, ? FROM member_recipe_preferences WHERE recipe_id = ? AND state = 'exclusion'`, ing, id); err != nil {
		return err
	}
	for _, q := range []string{
		`DELETE FROM member_recipe_preferences WHERE recipe_id = ?`,
		`DELETE FROM recipe_courses WHERE recipe_id = ?`,
	} {
		if _, err := tx.ExecContext(ctx, q, id); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE recipes SET yield = ?, yield_unit = ?, whole_meal = 0, cooldown_days = NULL,
	        leftover_use_by_days = NULL, frozen_use_by_days = NULL, reheat_minutes = NULL, updated_at = ? WHERE id = ?`,
		in.Yield, unit, s.now(), id); err != nil {
		return err
	}
	return s.refreshTotals(ctx, tx, id)
}

// ToPlannable turns a Base recipe back into a plannable Recipe (§3.6). *recipe.InUseError while any Recipe calls for
// it; its Ingredient stays as an ordinary Ingredient with its Stock and takes the plain key of its name again
// (*recipe.NameTakenError when a plain Ingredient holds it); Yield becomes portions; CourseIDs nil = the main Course.
func (s *Store) ToPlannable(ctx context.Context, id int64, in recipe.ToPlannableInput) (recipe.Recipe, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return recipe.Recipe{}, err
	}
	defer tx.Rollback()
	if err := s.toPlannableTx(ctx, tx, id, in); err != nil {
		return recipe.Recipe{}, err
	}
	if err := tx.Commit(); err != nil {
		return recipe.Recipe{}, err
	}
	return s.Get(ctx, id)
}

func (s *Store) toPlannableTx(ctx context.Context, tx *sql.Tx, id int64, in recipe.ToPlannableInput) error {
	if s.ings == nil {
		return errNeedsIngredients
	}
	ing, err := baseIngredientOf(ctx, tx, id)
	if errors.Is(err, sql.ErrNoRows) {
		var exists int
		if qerr := tx.QueryRowContext(ctx, `SELECT count(*) FROM recipes WHERE id = ?`, id).Scan(&exists); qerr != nil {
			return qerr
		}
		if exists == 0 {
			return ErrNotFound
		}
		return &recipe.ValidationError{Field: "baseRecipe", Code: recipe.CodeBaseRecipeKind, Message: "this Recipe is not a Base recipe"}
	}
	if err != nil {
		return err
	}
	used, err := usedBy(ctx, tx, ing)
	if err != nil {
		return err
	}
	if len(used) > 0 {
		return &recipe.InUseError{UsedBy: refsOf(used)}
	}
	if !finite(in.Yield) || in.Yield <= 0 || in.Yield > recipe.MaxYield {
		return &recipe.ValidationError{Field: "yield", Code: recipe.CodeYieldInvalid, Message: "the yield must be more than 0 and at most 100"}
	}
	courses, err := coursesFor(ctx, tx, in.CourseIDs)
	if err != nil {
		return err
	}
	if err := checkCourses(ctx, tx, courses); err != nil {
		return err
	}
	if err := s.releaseBase(ctx, tx, ing); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE recipes SET base_ingredient_id = NULL, yield = ?, yield_unit = NULL, updated_at = ? WHERE id = ?`,
		in.Yield, s.now(), id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM recipe_courses WHERE recipe_id = ?`, id); err != nil {
		return err
	}
	if err := writeCourses(ctx, tx, id, courses); err != nil {
		return err
	}
	mainID, err := mainCourse(ctx, tx)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE recipes SET whole_meal = ? WHERE id = ?`, boolInt(recipe.DefaultWholeMeal(false, courses, mainID)), id); err != nil {
		return err
	}
	return s.refreshTotals(ctx, tx, id)
}

// coursesFor is the Course list a plannable Recipe gets: the given ids (deduplicated), or the main Course when nil.
func coursesFor(ctx context.Context, q Querier, ids []int64) ([]int64, error) {
	if ids != nil {
		if len(ids) == 0 {
			return nil, &recipe.ValidationError{Field: "courses", Code: recipe.CodeCoursesEmpty, Message: "a Recipe needs at least one Course"}
		}
		seen := map[int64]bool{}
		var out []int64
		for _, c := range ids {
			if !seen[c] {
				seen[c] = true
				out = append(out, c)
			}
		}
		return out, nil
	}
	main, err := mainCourse(ctx, q)
	if err != nil {
		return nil, err
	}
	return []int64{main}, nil
}

// refsOf copies Refs into the Ref slice of an error (never nil).
func refsOf(r []recipe.Ref) []recipe.Ref {
	out := []recipe.Ref{}
	return append(out, r...)
}

func finite(f float64) bool { return !math.IsNaN(f) && !math.IsInf(f, 0) }

// ---- Linking a line (§3.7) ----

// LinkLine links a plain ingredient line to a Base recipe (§3.7): the line is re-pointed to the Base recipe's
// Ingredient (quantity, unit, optional and note carry over), the old Ingredient is remembered in the line's
// linked_from_ingredient_id, Needed at starts at the default. Exactly one of req.BaseRecipeID, req.Create or
// req.ConvertRecipeID (else CodeLinkInvalid). Errors: ErrNotFound (Recipe, line, Base recipe), CodeLineNotPlain,
// *recipe.CycleError, *recipe.UnknownUnitError on the Base recipe's Ingredient, the ToBase errors for ConvertRecipeID
// (all in one transaction: a failed link leaves the plannable Recipe plannable), and the take-over ask for Create.
func (s *Store) LinkLine(ctx context.Context, recipeID, lineID int64, req recipe.LinkRequest) (recipe.Recipe, error) {
	n := 0
	if req.BaseRecipeID != 0 {
		n++
	}
	if req.Create != nil {
		n++
	}
	if req.ConvertRecipeID != 0 {
		n++
	}
	if n != 1 {
		return recipe.Recipe{}, &recipe.ValidationError{Field: "link", Code: recipe.CodeLinkInvalid,
			Message: "a link names exactly one of baseRecipeId, create or convertRecipeId"}
	}
	if s.ings == nil {
		return recipe.Recipe{}, errNeedsIngredients
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return recipe.Recipe{}, err
	}
	defer tx.Rollback()

	var before int64
	if err := tx.QueryRowContext(ctx, `SELECT ingredient_id FROM recipe_lines WHERE id = ? AND recipe_id = ?`, lineID, recipeID).Scan(&before); errors.Is(err, sql.ErrNoRows) {
		return recipe.Recipe{}, ErrNotFound
	} else if err != nil {
		return recipe.Recipe{}, err
	}
	if ok, err := isBaseIngredient(ctx, tx, before); err != nil {
		return recipe.Recipe{}, err
	} else if ok {
		return recipe.Recipe{}, &recipe.ValidationError{Field: "lineId", Code: recipe.CodeLineNotPlain, Message: "this line already calls for a Base recipe"}
	}

	var baseIng int64
	switch {
	case req.BaseRecipeID != 0:
		if baseIng, err = baseIngredientOf(ctx, tx, req.BaseRecipeID); errors.Is(err, sql.ErrNoRows) {
			return recipe.Recipe{}, ErrNotFound
		} else if err != nil {
			return recipe.Recipe{}, err
		}
	case req.Create != nil:
		if baseIng, err = s.createBaseFromLine(ctx, tx, req); err != nil {
			return recipe.Recipe{}, err
		}
	default:
		if err := s.toBaseTx(ctx, tx, req.ConvertRecipeID, recipe.ToBaseInput{Yield: req.Yield, YieldUnit: req.YieldUnit, TakeOver: req.TakeOver}); err != nil {
			return recipe.Recipe{}, err
		}
		if baseIng, err = baseIngredientOf(ctx, tx, req.ConvertRecipeID); err != nil {
			return recipe.Recipe{}, err
		}
	}

	in, err := s.recipeInput(ctx, tx, recipeID)
	if err != nil {
		return recipe.Recipe{}, err
	}
	idx, err := lineIndex(in, lineID)
	if err != nil {
		return recipe.Recipe{}, err
	}
	old := in.Lines[idx].IngredientID
	in.Lines[idx].IngredientID = baseIng
	in.Lines[idx].NeededAtStep = nil
	in.Lines[idx].LinkedFromIngredientID = old
	if err := s.saveInTx(ctx, tx, recipeID, in); err != nil {
		return recipe.Recipe{}, err
	}
	if err := tx.Commit(); err != nil {
		return recipe.Recipe{}, err
	}
	return s.Get(ctx, recipeID)
}

// createBaseFromLine creates the new empty Base recipe of a link (§3.7): named and given the Yield of the request.
func (s *Store) createBaseFromLine(ctx context.Context, tx *sql.Tx, req recipe.LinkRequest) (int64, error) {
	yes := true
	in := recipe.Input{Name: req.Create.Name, Yield: req.Create.Yield, YieldUnit: req.Create.YieldUnit, BaseRecipe: &yes, TakeOver: req.TakeOver}
	clean, err := in.Validate(func(int64) (units.Ingredient, bool) { return units.Ingredient{}, false })
	if err != nil {
		return 0, err
	}
	clean.TakeOver = req.TakeOver
	id, err := s.CreateTx(ctx, tx, clean)
	if err != nil {
		return 0, err
	}
	return baseIngredientOf(ctx, tx, id)
}

// UnlinkLine is Use as a plain Ingredient: the line is re-pointed to ingredientID, or to the remembered Ingredient when
// ingredientID is 0; quantity and unit carry over, Needed at and the memory are cleared. CodeLineNotBase;
// CodeIngredientRequired when ingredientID is 0 and nothing is remembered (take-over lines, or the Ingredient was
// deleted); ErrNotFound.
func (s *Store) UnlinkLine(ctx context.Context, recipeID, lineID, ingredientID int64) (recipe.Recipe, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return recipe.Recipe{}, err
	}
	defer tx.Rollback()
	if err := s.unlinkTx(ctx, tx, recipeID, lineID, ingredientID, "lineId"); err != nil {
		return recipe.Recipe{}, err
	}
	if err := tx.Commit(); err != nil {
		return recipe.Recipe{}, err
	}
	return s.Get(ctx, recipeID)
}

// unlinkTx re-points one Base recipe line to a plain Ingredient (see UnlinkLine). field names the offending request
// field of a refusal ("lineId" for one line, "lineIds" for a bulk undo).
func (s *Store) unlinkTx(ctx context.Context, tx *sql.Tx, recipeID, lineID, ingredientID int64, field string) error {
	in, err := s.recipeInput(ctx, tx, recipeID)
	if err != nil {
		return err
	}
	idx, err := lineIndex(in, lineID)
	if err != nil {
		return err
	}
	line := in.Lines[idx]
	ok, err := isBaseIngredient(ctx, tx, line.IngredientID)
	if err != nil {
		return err
	}
	if !ok {
		return &recipe.ValidationError{Field: field, Code: recipe.CodeLineNotBase, Message: "this line does not call for a Base recipe"}
	}
	target := ingredientID
	if target == 0 {
		target = line.LinkedFromIngredientID
	}
	if target == 0 {
		return &recipe.ValidationError{Field: "ingredientId", Code: recipe.CodeIngredientRequired,
			Message: "name the plain Ingredient to use: nothing is remembered for this line"}
	}
	in.Lines[idx].IngredientID = target
	in.Lines[idx].NeededAtStep = nil
	in.Lines[idx].LinkedFromIngredientID = 0
	return s.saveInTx(ctx, tx, recipeID, in)
}

// lineIndex finds the line of the Input by its id; ErrNotFound when the Recipe has no such line.
func lineIndex(in recipe.Input, lineID int64) (int, error) {
	for i, l := range in.Lines {
		if l.ID == lineID {
			return i, nil
		}
	}
	return 0, ErrNotFound
}

// saveInTx validates the Input of a stored Recipe (its kind unchanged) against the Ingredients inside tx and writes it.
func (s *Store) saveInTx(ctx context.Context, tx *sql.Tx, recipeID int64, in recipe.Input) error {
	clean, err := s.validateTx(ctx, tx, in)
	if err != nil {
		return err
	}
	clean.TakeOver = nil
	if _, err := s.ReplaceTx(ctx, tx, recipeID, clean); err != nil {
		return err
	}
	return nil
}

// recipeInput is the stored Recipe as the Input that saves it again (lines keep their ids and memory).
func (s *Store) recipeInput(ctx context.Context, tx *sql.Tx, id int64) (recipe.Input, error) {
	rec, err := getRecipe(ctx, tx, id)
	if err != nil {
		return recipe.Input{}, err
	}
	in := recipe.Input{
		Name: rec.Name, Description: rec.Description, Yield: rec.Yield, YieldUnit: rec.YieldUnit, ReadyMeal: rec.ReadyMeal,
		Tags: rec.Tags, CooldownDays: rec.CooldownDays, LeftoverUseByDays: rec.LeftoverUseByDays,
		FrozenUseByDays: rec.FrozenUseByDays, ReheatMinutes: rec.ReheatMinutes, Source: rec.Source, Image: rec.Image,
		BaseRecipe: boolPtrOf(rec.IsBase()),
	}
	if !rec.IsBase() {
		in.CourseIDs = rec.CourseIDs
		if rec.WholeMeal != nil {
			w := *rec.WholeMeal
			in.WholeMeal = &w
		}
	}
	for _, l := range rec.Lines {
		in.Lines = append(in.Lines, recipe.Line{ID: l.ID, IngredientID: l.IngredientID, Quantity: l.Quantity, Unit: l.Unit,
			Optional: l.Optional, Note: l.Note, NeededAtStep: l.NeededAtStep, LinkedFromIngredientID: l.LinkedFromIngredientID})
	}
	for _, st := range rec.Steps {
		in.Steps = append(in.Steps, recipe.Step{Text: st.Text, Kind: st.Kind, DurationMinutes: st.DurationMinutes,
			LeadTimeMinutes: st.LeadTimeMinutes, After: st.After, Uses: st.Uses, Image: st.Image})
	}
	return in, nil
}

func boolPtrOf(b bool) *bool { return &b }

// validateTx is recipe.Input.Validate with the Ingredients read inside tx (an Ingredient made earlier in the same
// transaction counts).
func (s *Store) validateTx(ctx context.Context, tx *sql.Tx, in recipe.Input) (recipe.Input, error) {
	var ids []int64
	for _, l := range in.Lines {
		ids = append(ids, l.IngredientID)
	}
	for _, st := range in.Steps {
		for _, u := range st.Uses {
			ids = append(ids, u.IngredientID)
		}
	}
	found := map[int64]units.Ingredient{}
	for _, id := range ids {
		if _, ok := found[id]; ok {
			continue
		}
		ing, ok, err := ingredientUnits(ctx, tx, id)
		if err != nil {
			return recipe.Input{}, err
		}
		if ok {
			found[id] = ing
		}
	}
	clean, err := in.Validate(func(id int64) (units.Ingredient, bool) {
		ing, ok := found[id]
		return ing, ok
	})
	if err != nil {
		return recipe.Input{}, err
	}
	clean.TakeOver = in.TakeOver
	return clean, nil
}

// ingredientUnits reads one Ingredient with its Unit Conversions inside q.
func ingredientUnits(ctx context.Context, q Querier, id int64) (units.Ingredient, bool, error) {
	var ing units.Ingredient
	var base string
	err := q.QueryRowContext(ctx, `SELECT name, base_unit FROM ingredients WHERE id = ?`, id).Scan(&ing.Name, &base)
	if errors.Is(err, sql.ErrNoRows) {
		return units.Ingredient{}, false, nil
	}
	if err != nil {
		return units.Ingredient{}, false, err
	}
	ing.Base = units.Base(base)
	rows, err := q.QueryContext(ctx, `SELECT unit, to_base FROM ingredient_conversions WHERE ingredient_id = ? ORDER BY unit`, id)
	if err != nil {
		return units.Ingredient{}, false, err
	}
	defer rows.Close()
	for rows.Next() {
		var c units.Conversion
		if err := rows.Scan(&c.Unit, &c.ToBase); err != nil {
			return units.Ingredient{}, false, err
		}
		ing.Conversions = append(ing.Conversions, c)
	}
	return ing, true, rows.Err()
}

// ---- The bulk link (§3.8) ----

// LinkCandidates lists the plain lines, on other Recipes (archived included), of an Ingredient whose name has the
// Base recipe's key (baserecipe.LinkCandidates), ordered by Recipe name then line position. Linkable false carries
// the Reason. ErrNotFound; CodeLineNotBase never; a plannable Recipe id is ErrNotFound.
func (s *Store) LinkCandidates(ctx context.Context, baseID int64) ([]recipe.LinkCandidate, error) {
	return linkCandidates(ctx, s.db, baseID)
}

func linkCandidates(ctx context.Context, q Querier, baseID int64) ([]recipe.LinkCandidate, error) {
	ing, err := baseIngredientOf(ctx, q, baseID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	cat, err := loadCatalog(ctx, q)
	if err != nil {
		return nil, err
	}
	var lines []baserecipe.CandidateLine
	ids := map[[2]int64]recipe.LinkCandidate{}
	for _, r := range cat.recipes {
		if r.ID == baseID {
			continue
		}
		for i, l := range r.Lines {
			if _, isBase := cat.baseOf[l.IngredientID]; isBase {
				continue
			}
			u, _ := cat.Units(l.IngredientID)
			lines = append(lines, baserecipe.CandidateLine{RecipeID: r.ID, RecipeName: cat.names[r.ID], Archived: cat.archived[r.ID],
				LineIndex: i, IngredientName: u.Name, Quantity: l.Quantity, Unit: l.Unit})
			ids[[2]int64{r.ID, int64(i)}] = recipe.LinkCandidate{LineID: cat.lineIDs[r.ID][i], RecipeID: r.ID,
				RecipeName: cat.names[r.ID], Archived: cat.archived[r.ID], IngredientID: l.IngredientID, IngredientName: u.Name,
				Quantity: l.Quantity, Unit: l.Unit}
		}
	}
	base, _ := cat.Units(ing)
	found := baserecipe.LinkCandidates(cat.names[baseID], baseID, lines, cat.graph(), base)
	out := make([]recipe.LinkCandidate, 0, len(found))
	for _, c := range found {
		rc := ids[[2]int64{c.RecipeID, int64(c.LineIndex)}]
		rc.Linkable = c.Linkable
		rc.Reason = c.Reason
		out = append(out, rc)
	}
	return out, nil
}

// Link re-points the ticked candidate lines to the Base recipe's Ingredient (§3.8), all or nothing in one
// transaction, cycle-checked as a whole. A line that is not a linkable candidate is a *recipe.ValidationError
// (field "lineIds", CodeNotACandidate) and nothing is linked. The result's MergeOffer lists the plain Ingredients the
// link left on no Recipe line (with their Stock Lots and Products).
func (s *Store) Link(ctx context.Context, baseID int64, lineIDs []int64) (recipe.LinkResult, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return recipe.LinkResult{}, err
	}
	defer tx.Rollback()
	if len(lineIDs) == 0 {
		return recipe.LinkResult{}, &recipe.ValidationError{Field: "lineIds", Code: recipe.CodeNotACandidate, Message: "tick at least one line"}
	}
	cands, err := linkCandidates(ctx, tx, baseID)
	if err != nil {
		return recipe.LinkResult{}, err
	}
	byID := map[int64]recipe.LinkCandidate{}
	for _, c := range cands {
		byID[c.LineID] = c
	}
	ing, err := baseIngredientOf(ctx, tx, baseID)
	if err != nil {
		return recipe.LinkResult{}, err
	}
	var old []int64
	seen := map[int64]bool{}
	for _, id := range lineIDs {
		c, ok := byID[id]
		if !ok || !c.Linkable {
			return recipe.LinkResult{}, &recipe.ValidationError{Field: "lineIds", Code: recipe.CodeNotACandidate,
				Message: "a line is not a link candidate of this Base recipe"}
		}
		if !seen[c.IngredientID] {
			seen[c.IngredientID] = true
			old = append(old, c.IngredientID)
		}
		in, err := s.recipeInput(ctx, tx, c.RecipeID)
		if err != nil {
			return recipe.LinkResult{}, err
		}
		idx, err := lineIndex(in, id)
		if err != nil {
			return recipe.LinkResult{}, err
		}
		in.Lines[idx].IngredientID = ing
		in.Lines[idx].NeededAtStep = nil
		in.Lines[idx].LinkedFromIngredientID = c.IngredientID
		if err := s.saveInTx(ctx, tx, c.RecipeID, in); err != nil {
			return recipe.LinkResult{}, err
		}
	}
	offers := []recipe.MergeOffer{}
	for _, id := range old {
		var uses int
		if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM recipe_lines WHERE ingredient_id = ?`, id).Scan(&uses); err != nil {
			return recipe.LinkResult{}, err
		}
		if uses > 0 {
			continue
		}
		o := recipe.MergeOffer{IngredientID: id}
		u, _, err := ingredientUnits(ctx, tx, id)
		if err != nil {
			return recipe.LinkResult{}, err
		}
		o.Name = u.Name
		if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM stock_lots WHERE ingredient_id = ?`, id).Scan(&o.StockLots); err != nil {
			return recipe.LinkResult{}, err
		}
		if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM products WHERE ingredient_id = ?`, id).Scan(&o.Products); err != nil {
			return recipe.LinkResult{}, err
		}
		offers = append(offers, o)
	}
	if err := tx.Commit(); err != nil {
		return recipe.LinkResult{}, err
	}
	return recipe.LinkResult{Linked: append([]int64(nil), lineIDs...), MergeOffer: offers}, nil
}

// Unlink reverses a bulk link (the Toast's Undo): each line goes back to its remembered Ingredient, all or nothing
// (CodeLineNotBase for a line that does not call for this Base recipe).
func (s *Store) Unlink(ctx context.Context, baseID int64, lineIDs []int64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, id := range lineIDs {
		var recipeID, ing int64
		var linked sql.NullInt64
		err := tx.QueryRowContext(ctx, `SELECT recipe_id, ingredient_id, linked_from_ingredient_id FROM recipe_lines WHERE id = ?`, id).
			Scan(&recipeID, &ing, &linked)
		if errors.Is(err, sql.ErrNoRows) {
			return &recipe.ValidationError{Field: "lineIds", Code: recipe.CodeLineNotBase, Message: "this line does not call for that Base recipe"}
		}
		if err != nil {
			return err
		}
		own, err := baseIngredientOf(ctx, tx, baseID)
		if err != nil {
			return err
		}
		if ing != own {
			return &recipe.ValidationError{Field: "lineIds", Code: recipe.CodeLineNotBase, Message: "this line does not call for that Base recipe"}
		}
		if err := s.unlinkTx(ctx, tx, recipeID, id, linked.Int64, "lineIds"); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// getRecipe loads a Recipe with its Tags, lines, Steps and timing. A Base recipe carries its kind, Yield unit, the
// Recipes that call for it (usedBy) and the Ingredients inside it (within); a Recipe with Base recipe lines has its
// total time composed, and each such line its effective Needed at (§10).
func getRecipe(ctx context.Context, q Querier, id int64) (recipe.Recipe, error) {
	var r recipe.Recipe
	var ready, archived int64
	var cool, useBy, frozenUseBy, reheat sql.NullInt64
	var created, updated string
	var whole int64
	var base sql.NullInt64
	var yieldUnit sql.NullString
	err := q.QueryRowContext(ctx, `SELECT name, description, yield, ready_meal, cooldown_days, leftover_use_by_days, frozen_use_by_days,
	        reheat_minutes, source_url, source_attribution, image, archived, whole_meal, created_at, updated_at, base_ingredient_id, yield_unit
	        FROM recipes WHERE id = ?`, id).
		Scan(&r.Name, &r.Description, &r.Yield, &ready, &cool, &useBy, &frozenUseBy, &reheat, &r.Source.URL, &r.Source.Attribution, &r.Image,
			&archived, &whole, &created, &updated, &base, &yieldUnit)
	if errors.Is(err, sql.ErrNoRows) {
		return recipe.Recipe{}, ErrNotFound
	}
	if err != nil {
		return recipe.Recipe{}, err
	}
	r.ID = id
	r.ReadyMeal = ready == 1
	r.Archived = archived == 1
	isBase := base.Valid
	r.BaseRecipe = boolPtrOf(isBase)
	r.YieldUnit = yieldUnit.String
	r.BaseIngredientID = base.Int64
	wholeMeal := whole == 1
	r.WholeMeal = &wholeMeal
	if cool.Valid {
		r.CooldownDays = intPtr(int(cool.Int64))
	}
	if useBy.Valid {
		r.LeftoverUseByDays = intPtr(int(useBy.Int64))
	}
	if frozenUseBy.Valid {
		r.FrozenUseByDays = intPtr(int(frozenUseBy.Int64))
	}
	if reheat.Valid {
		r.ReheatMinutes = intPtr(int(reheat.Int64))
	}
	if r.CreatedAt, err = time.Parse(time.RFC3339, created); err != nil {
		return recipe.Recipe{}, err
	}
	if r.UpdatedAt, err = time.Parse(time.RFC3339, updated); err != nil {
		return recipe.Recipe{}, err
	}
	if r.Tags, err = loadTags(ctx, q, id); err != nil {
		return recipe.Recipe{}, err
	}
	if r.Courses, err = loadCourses(ctx, q, id); err != nil {
		return recipe.Recipe{}, err
	}
	r.CourseIDs = courseIDs(r.Courses)
	if r.Lines, err = loadLines(ctx, q, id); err != nil {
		return recipe.Recipe{}, err
	}
	if r.Steps, err = loadSteps(ctx, q, id); err != nil {
		return recipe.Recipe{}, err
	}
	if r.Timing, err = recipe.TimingOf(r.Steps); err != nil {
		return recipe.Recipe{}, err
	}
	r.UsedBy = []recipe.Ref{}
	r.Within = []recipe.Within{}
	if isBase {
		if r.UsedBy, err = usedBy(ctx, q, base.Int64); err != nil {
			return recipe.Recipe{}, err
		}
	}
	hasBase := false
	for _, l := range r.Lines {
		hasBase = hasBase || l.Base != nil
	}
	if !isBase && !hasBase {
		return r, nil
	}
	cat, err := loadCatalog(ctx, q)
	if err != nil {
		return recipe.Recipe{}, err
	}
	if hasBase {
		if composed, cerr := baserecipe.ComposeSteps(cat, id, nil); cerr == nil {
			r.Timing.TotalMinutes = composed.TotalMinutes
		}
		for i := range r.Lines {
			if b := r.Lines[i].Base; b != nil {
				r.Lines[i].NeededAt = max(0, baserecipe.NeededAt(cat.recipes[id], i, b.Name))
			}
		}
	}
	if tree, terr := baserecipe.Expand(cat, id); terr == nil {
		withinOf(cat, tree, nil, &r.Within)
	}
	return r, nil
}

// loadLines reads a Recipe's lines in order, with the Base recipe each calls for (and whether it is empty, §4.6), its
// stored Needed at override and the plain Ingredient it was linked from.
func loadLines(ctx context.Context, q Querier, id int64) ([]recipe.Line, error) {
	rows, err := q.QueryContext(ctx, `SELECT rl.id, rl.ingredient_id, i.name, rl.quantity, rl.unit, rl.optional, rl.note,
	        rl.needed_at_step, rl.linked_from_ingredient_id, b.id, b.name, b.archived,
	        (SELECT count(*) FROM recipe_lines bl WHERE bl.recipe_id = b.id)
	        FROM recipe_lines rl JOIN ingredients i ON i.id = rl.ingredient_id
	        LEFT JOIN recipes b ON b.base_ingredient_id = rl.ingredient_id
	        WHERE rl.recipe_id = ? ORDER BY rl.position`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []recipe.Line
	for rows.Next() {
		var l recipe.Line
		var optional, bCount int64
		var needed, linked, bID, bArchived sql.NullInt64
		var bName sql.NullString
		if err := rows.Scan(&l.ID, &l.IngredientID, &l.Ingredient, &l.Quantity, &l.Unit, &optional, &l.Note,
			&needed, &linked, &bID, &bName, &bArchived, &bCount); err != nil {
			return nil, err
		}
		l.Optional = optional == 1
		if needed.Valid {
			n := int(needed.Int64)
			l.NeededAtStep = &n
		}
		l.LinkedFromIngredientID = linked.Int64
		if bID.Valid {
			l.Base = &recipe.BaseRef{ID: bID.Int64, Name: bName.String, Archived: bArchived.Int64 == 1, Empty: bCount == 0}
		}
		out = append(out, l)
	}
	return out, rows.Err()
}
