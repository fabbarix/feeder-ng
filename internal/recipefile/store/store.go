// Package store reads what Import Review matches against and writes a
// recipefile.Commit in ONE SQL transaction.
package store

import (
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"sort"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	coursestore "github.com/fabbarix/feeder-ng/internal/course/store"
	imgs "github.com/fabbarix/feeder-ng/internal/images"
	"github.com/fabbarix/feeder-ng/internal/images/refs"
	"github.com/fabbarix/feeder-ng/internal/imaging"
	"github.com/fabbarix/feeder-ng/internal/ingredient"
	ingstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	recipestore "github.com/fabbarix/feeder-ng/internal/recipe/store"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// ErrStale: something the Commit relies on changed since the review (a Recipe
// to replace or an Ingredient to use is gone, a name was taken). Nothing was written.
var ErrStale = recipefile.ErrStale

// ErrNotFound: an id asked for in Exportable does not exist.
var ErrNotFound = errors.New("recipe not found")

// Store is the Import Review repository.
type Store struct {
	db          *sql.DB
	clk         clock.Clock
	images      *imaging.Store
	ingredients *ingstore.Store
	recipes     *recipestore.Store
	courses     *coursestore.Store
	guarded     *imgs.Guarded
}

// ingredientSource gives the Recipe store the Ingredients (with Unit Conversions) its lines refer to.
type ingredientSource struct{ s *ingstore.Store }

func (g ingredientSource) Units(ctx context.Context, id int64) (units.Ingredient, bool, error) {
	ing, err := g.s.Get(ctx, id)
	if errors.Is(err, ingstore.ErrNotFound) {
		return units.Ingredient{}, false, nil
	}
	if err != nil {
		return units.Ingredient{}, false, err
	}
	return ing.Units(), true, nil
}

// New returns a Store. The Base recipe lifecycle is wired here: the Recipe store creates, takes over and names the
// Ingredients of Base recipes through the Ingredient store, which guards them with the Recipe store's port.
func New(d *sql.DB, clk clock.Clock, images *imaging.Store) *Store {
	guarded := imgs.NewGuarded(images, refs.New(d))
	ings := ingstore.New(d, clk, ingstore.WithBaseRecipes(recipestore.NewBaseRecipePort(d)))
	return &Store{
		guarded:     guarded,
		db:          d,
		clk:         clk,
		images:      images,
		ingredients: ings,
		recipes:     recipestore.New(d, clk, ingredientSource{ings}).WithImages(guarded).WithIngredients(ings),
		courses:     coursestore.New(d, clk),
	}
}

// now is the timestamp of a row written by this store.
func (s *Store) now() string { return s.clk.Now().UTC().Format(time.RFC3339) }

// Existing loads every Ingredient (with Unit Conversions), every Recipe id and name (archived ones and Base recipes
// too), which of them are Base recipes and what each plain Ingredient is used by (the take-over ask).
func (s *Store) Existing(ctx context.Context) (recipefile.Existing, error) {
	var ex recipefile.Existing
	ings, err := s.ingredients.List(ctx)
	if err != nil {
		return ex, err
	}
	ex.Ingredients = ings
	recs, err := s.recipes.List(ctx, recipestore.ListFilter{Archived: "all", Kind: "all"})
	if err != nil {
		return ex, err
	}
	for _, r := range recs {
		ex.Recipes = append(ex.Recipes, recipefile.RecipeRef{ID: r.ID, Name: r.Name, ReadyMeal: r.ReadyMeal})
	}
	ex.Courses, err = s.existingCourses(ctx)
	if err != nil {
		return ex, err
	}
	if ex.BaseRecipes, err = s.baseRecipes(ctx); err != nil {
		return ex, err
	}
	if ex.IngredientUses, err = s.ingredientUses(ctx); err != nil {
		return ex, err
	}
	return ex, nil
}

// baseRecipes lists the Base recipes and the Ingredient each owns.
func (s *Store) baseRecipes(ctx context.Context) ([]recipefile.BaseRecipeRef, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, base_ingredient_id FROM recipes WHERE base_ingredient_id IS NOT NULL ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []recipefile.BaseRecipeRef
	for rows.Next() {
		var b recipefile.BaseRecipeRef
		if err := rows.Scan(&b.RecipeID, &b.IngredientID); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

// ingredientUses says, for every Ingredient a Recipe uses (in a line or a Step), which Recipes use it and its count of
// Stock lots. Archived Recipes are included.
func (s *Store) ingredientUses(ctx context.Context) (map[int64]recipefile.IngredientUse, error) {
	out := map[int64]recipefile.IngredientUse{}
	rows, err := s.db.QueryContext(ctx, `SELECT x.ingredient_id, r.id, r.name FROM (
	        SELECT ingredient_id, recipe_id FROM recipe_lines
	        UNION
	        SELECT ingredient_id, recipe_id FROM recipe_step_uses) x
	        JOIN recipes r ON r.id = x.recipe_id
	        ORDER BY r.name COLLATE NOCASE, r.id`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var ing int64
		var ref recipefile.NamedRef
		if err := rows.Scan(&ing, &ref.ID, &ref.Name); err != nil {
			rows.Close()
			return nil, err
		}
		u := out[ing]
		u.Recipes = append(u.Recipes, ref)
		out[ing] = u
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	lots, err := s.db.QueryContext(ctx, `SELECT ingredient_id, count(*) FROM stock_lots GROUP BY ingredient_id`)
	if err != nil {
		return nil, err
	}
	defer lots.Close()
	for lots.Next() {
		var ing int64
		var n int
		if err := lots.Scan(&ing, &n); err != nil {
			return nil, err
		}
		u := out[ing]
		u.StockLots = n
		out[ing] = u
	}
	return out, lots.Err()
}

// Exportable loads the Recipes (all, or those with the given ids) and the
// definitions of every Ingredient they use. An unknown id is ErrNotFound. A nil
// ids list means every Recipe, archived ones included.
func (s *Store) Exportable(ctx context.Context, ids []int64) (recipefile.ExportInput, error) {
	in := recipefile.ExportInput{Now: s.clk.Now(), Ingredients: map[int64]ingredient.Ingredient{}, Image: s.imageDataURL}
	if ids == nil {
		sums, err := s.recipes.List(ctx, recipestore.ListFilter{Archived: "all"})
		if err != nil {
			return in, err
		}
		for _, sm := range sums {
			ids = append(ids, sm.ID)
		}
		sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	}
	for _, id := range ids {
		rec, err := s.recipes.Get(ctx, id)
		if errors.Is(err, recipestore.ErrNotFound) {
			return in, ErrNotFound
		}
		if err != nil {
			return in, err
		}
		in.Recipes = append(in.Recipes, rec)
		if err := s.loadUsed(ctx, rec, in.Ingredients); err != nil {
			return in, err
		}
	}
	return in, nil
}

// loadUsed adds the definitions of the Ingredients a Recipe uses to defs.
func (s *Store) loadUsed(ctx context.Context, rec recipe.Recipe, defs map[int64]ingredient.Ingredient) error {
	var ids []int64
	for _, l := range rec.Lines {
		ids = append(ids, l.IngredientID)
	}
	for _, st := range rec.Steps {
		for _, u := range st.Uses {
			ids = append(ids, u.IngredientID)
		}
	}
	for _, id := range ids {
		if _, ok := defs[id]; ok {
			continue
		}
		ing, err := s.ingredients.Get(ctx, id)
		if errors.Is(err, ingstore.ErrNotFound) {
			continue
		}
		if err != nil {
			return err
		}
		defs[id] = ing
	}
	return nil
}

// imageDataURL is the stored photo as a WebP data URL.
func (s *Store) imageDataURL(id string) (string, error) {
	f, err := s.images.Open(id)
	if err != nil {
		return "", err
	}
	defer f.Close()
	data, err := io.ReadAll(f)
	if err != nil {
		return "", err
	}
	return "data:image/webp;base64," + base64.StdEncoding.EncodeToString(data), nil
}

// Result says what Apply did.
type Result struct {
	Recipes            []AppliedRecipe
	IngredientsCreated int
	ConversionsAdded   int
	PicturesAdded      int // IM3: existing Ingredients that took the file's picture
	CoursesCreated     int // crs-e1: Courses added by an Admin's answer
	CoursesUnarchived  int // crs-e1: archived Courses brought back by an Admin's answer
}

// AppliedRecipe is one written Recipe. Action is "created", "replaced" or "converted" (a plannable Recipe turned into a
// Base recipe, Index -1). Base says the Recipe is a Base recipe after the import. Line is the path of the tile that
// created or converted it ("" for a Recipe of the file), and ReadNext is that tile's "Read it next".
type AppliedRecipe struct {
	Index    int
	ID       int64
	Name     string
	Action   string
	Base     bool
	Line     string
	ReadNext bool
}

// Apply writes the Commit in one transaction: new Ingredients, added
// Conversions, then Recipes (create or replace, validated again through
// recipe.Input.Validate against the just-written Ingredients). Images are saved
// to the image store before the transaction commits; on any error the
// transaction is rolled back AND the files saved so far are deleted, so
// nothing is half-imported. ErrStale when a precondition no longer holds.
// Replaced Recipes keep their id, archive flag and Member preferences.
func (s *Store) Apply(ctx context.Context, c recipefile.Commit) (Result, error) {
	imageIDs, err := s.saveImages(c.Images)
	if err != nil {
		s.removeImages(imageIDs)
		return Result{}, err
	}
	res, replaced, orphans, err := s.write(ctx, c, imageIDs)
	if err != nil {
		s.removeImages(imageIDs)
		return Result{}, err
	}
	// A picture set after the review won: the file saved for it is an orphan. Guarded refuses a file any record still uses.
	for _, id := range orphans {
		_ = s.guarded.Delete(ctx, id)
	}
	s.recipes.DropUnreferenced(ctx, replaced)
	return res, nil
}

// saveImages writes each resolved image and returns its id by JSON path.
// On failure the ids saved so far are returned for removal.
func (s *Store) saveImages(imgs map[string]imaging.Result) (map[string]string, error) {
	ids := map[string]string{}
	for path, r := range imgs {
		id, err := s.images.Save(r.WebP)
		if err != nil {
			return ids, err
		}
		ids[path] = id
	}
	return ids, nil
}

// removeImages deletes stored photos written for a failed Apply.
func (s *Store) removeImages(ids map[string]string) {
	for _, id := range ids {
		_ = s.images.Delete(id)
	}
}

// write runs the transaction. It returns the ids of photos that replaced
// Recipes used to refer to.
func (s *Store) write(ctx context.Context, c recipefile.Commit, imageIDs map[string]string) (Result, []string, []string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Result{}, nil, nil, err
	}
	defer tx.Rollback()

	// A new plain Ingredient is created right before the first Recipe that uses it. A Base recipe named like it (the holder)
	// is written before its users (orderBaseFirst), so the holder never finds the plain Ingredient and asks about it.
	created := map[string]int64{}
	pending := append([]recipefile.NewIngredient(nil), c.NewIngredients...)
	res := Result{IngredientsCreated: len(c.NewIngredients)}
	// A Unit Conversion the Ingredient gained since the review wins: it is kept,
	// the file's one is skipped and not counted.
	for _, a := range c.AddedConversions {
		added, err := s.ingredients.AddConversionTx(ctx, tx, a.IngredientID, a.Conversion)
		if err != nil {
			return Result{}, nil, nil, staleOr(err)
		}
		if added {
			res.ConversionsAdded++
		}
	}

	// IM3: an existing Ingredient without a picture adopts the file's. One that got a picture since the review keeps it.
	var orphans []string
	for _, a := range c.AddedImages {
		id := imageIDs[a.ImagePath]
		if id == "" {
			continue
		}
		r, err := tx.ExecContext(ctx, `UPDATE ingredients SET image = ? WHERE id = ? AND image = ''`, id, a.IngredientID)
		if err != nil {
			return Result{}, nil, nil, err
		}
		if n, _ := r.RowsAffected(); n == 1 {
			res.PicturesAdded++
		} else {
			orphans = append(orphans, id)
		}
	}

	newCourses, err := applyCourses(ctx, tx, c, &res, s.now())
	if err != nil {
		return Result{}, nil, nil, err
	}

	names, err := recipeNames(ctx, tx)
	if err != nil {
		return Result{}, nil, nil, err
	}
	replacing := map[int64]bool{}
	for _, rc := range c.Recipes {
		if rc.Action == recipefile.ActionReplace {
			replacing[rc.ReplaceID] = true
		}
	}

	// convert: a plannable Recipe becomes a Base recipe, with the effects of §3.6, before the Recipes that call for it.
	for _, bl := range c.BaseRecipeLines {
		if bl.Decision.Action != recipefile.BaseConvert {
			continue
		}
		in := recipe.ToBaseInput{Yield: bl.Decision.Yield, YieldUnit: bl.Decision.YieldUnit, TakeOver: bl.TakeOver}
		if err := s.recipes.ToBaseTx(ctx, tx, bl.Decision.RecipeID, in); err != nil {
			return Result{}, nil, nil, staleOr(err)
		}
		var name string
		if err := tx.QueryRowContext(ctx, `SELECT name FROM recipes WHERE id = ?`, bl.Decision.RecipeID).Scan(&name); err != nil {
			return Result{}, nil, nil, err
		}
		res.Recipes = append(res.Recipes, AppliedRecipe{Index: -1, ID: bl.Decision.RecipeID, Name: name,
			Action: "converted", Base: true, Line: bl.Path})
	}

	// Unit answers for Base recipe Ingredients are saved as soon as the Ingredient exists, before a Recipe that calls it is
	// validated. A reference not written yet waits.
	applied := map[string]int64{} // Base recipes written so far, by fileKey / lineKey
	pendingConv := append([]recipefile.BaseConversion(nil), c.BaseConversions...)
	applyConv := func() error {
		var rest []recipefile.BaseConversion
		for _, bc := range pendingConv {
			id, err := s.baseIngredient(ctx, tx, bc.Ref, applied)
			if errors.Is(err, ErrStale) {
				rest = append(rest, bc)
				continue
			}
			if err != nil {
				return err
			}
			if _, err := s.ingredients.AddConversionTx(ctx, tx, id, bc.Conversion); err != nil {
				return staleOr(err)
			}
		}
		pendingConv = rest
		return nil
	}
	if err := applyConv(); err != nil {
		return Result{}, nil, nil, err
	}
	var replaced []string
	for _, rc := range c.Recipes {
		if err := s.createUsed(ctx, tx, rc, &pending, created, imageIDs); err != nil {
			return Result{}, nil, nil, err
		}
		out, prev, err := s.writeRecipe(ctx, tx, c, rc, created, newCourses, imageIDs, names, replacing, applied)
		if err != nil {
			return Result{}, nil, nil, err
		}
		res.Recipes = append(res.Recipes, out)
		if err := applyConv(); err != nil {
			return Result{}, nil, nil, err
		}
		if rc.Action != recipefile.ActionReplace && rc.Input.IsBase() && (rc.BaseShelfLifeDays != nil || rc.BaseImage != "") {
			// The file's definition of the Base recipe's Ingredient: its Shelf Life and picture. A taken-over Ingredient keeps
			// what it has: the Shelf Life and the picture are filled only when it has none. A picture not used is an orphan.
			if rc.BaseShelfLifeDays != nil {
				// AND kind='food' is the safety net (ADR 0017): a Supply never gets a Shelf Life, even if its kind changed after the review.
				if _, err := tx.ExecContext(ctx, `UPDATE ingredients SET shelf_life_days = COALESCE(shelf_life_days, ?)
				        WHERE id = (SELECT base_ingredient_id FROM recipes WHERE id = ?) AND kind = 'food'`, *rc.BaseShelfLifeDays, out.ID); err != nil {
					return Result{}, nil, nil, err
				}
			}
			if img := imageIDs[rc.BaseImage]; img != "" {
				r, err := tx.ExecContext(ctx, `UPDATE ingredients SET image = ?
				        WHERE id = (SELECT base_ingredient_id FROM recipes WHERE id = ?) AND image = ''`, img, out.ID)
				if err != nil {
					return Result{}, nil, nil, err
				}
				if n, _ := r.RowsAffected(); n == 1 {
					if rc.TakeOver != nil && *rc.TakeOver {
						res.PicturesAdded++ // an existing Ingredient took the file's picture
					}
				} else {
					orphans = append(orphans, img)
				}
			}
		}
		replaced = append(replaced, prev...)
	}
	if err := s.createPending(ctx, tx, &pending, created, imageIDs); err != nil {
		return Result{}, nil, nil, err
	}
	if len(pendingConv) > 0 {
		return Result{}, nil, nil, ErrStale // a conversion for a Base recipe the import did not write
	}
	if err := tx.Commit(); err != nil {
		return Result{}, nil, nil, err
	}
	return res, replaced, orphans, nil
}

// nameIndex maps units.NormalizeName of Recipe names to the ids that have them.
type nameIndex map[string][]int64

// recipeNames reads every Recipe name inside tx (archived ones too).
func recipeNames(ctx context.Context, tx *sql.Tx) (nameIndex, error) {
	rows, err := tx.QueryContext(ctx, `SELECT id, name FROM recipes`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	idx := nameIndex{}
	for rows.Next() {
		var id int64
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		idx.add(units.NormalizeName(name), id)
	}
	return idx, rows.Err()
}

func (ni nameIndex) add(key string, id int64) { ni[key] = append(ni[key], id) }

// taken reports whether a Recipe other than the ones being replaced has the key.
func (ni nameIndex) taken(key string, replacing map[int64]bool) bool {
	for _, id := range ni[key] {
		if !replacing[id] {
			return true
		}
	}
	return false
}

// createIngredient inserts one new Ingredient and records its id by key.
func (s *Store) createIngredient(ctx context.Context, tx *sql.Tx, n recipefile.NewIngredient, imageIDs map[string]string, created map[string]int64) error {
	in := n.Input
	if n.ImagePath != "" {
		in.Image = imageIDs[n.ImagePath]
	}
	ing, err := s.ingredients.CreateTx(ctx, tx, in)
	if err != nil {
		return staleOr(err)
	}
	created[n.Key] = ing.ID
	return nil
}

// createUsed creates the held-back Ingredients that rc calls for (a plain line or Step use), just before rc is written.
func (s *Store) createUsed(ctx context.Context, tx *sql.Tx, rc recipefile.RecipeCommit, pending *[]recipefile.NewIngredient,
	created map[string]int64, imageIDs map[string]string) error {
	used := map[string]bool{}
	for k, key := range rc.LineKeys {
		if k < len(rc.LineBases) && rc.LineBases[k].Kind != "" {
			continue
		}
		used[key] = true
	}
	for st, keys := range rc.UseKeys {
		for u, key := range keys {
			if st < len(rc.UseBases) && u < len(rc.UseBases[st]) && rc.UseBases[st][u].Kind != "" {
				continue
			}
			used[key] = true
		}
	}
	var rest []recipefile.NewIngredient
	for _, n := range *pending {
		if !used[n.Key] {
			rest = append(rest, n)
			continue
		}
		if err := s.createIngredient(ctx, tx, n, imageIDs, created); err != nil {
			return err
		}
	}
	*pending = rest
	return nil
}

// createPending creates the Ingredients still held back and empties the list.
func (s *Store) createPending(ctx context.Context, tx *sql.Tx, pending *[]recipefile.NewIngredient, created map[string]int64, imageIDs map[string]string) error {
	for _, n := range *pending {
		if err := s.createIngredient(ctx, tx, n, imageIDs, created); err != nil {
			return err
		}
	}
	*pending = nil
	return nil
}

// fileKey and lineKey name a Base recipe written by this import in the applied map.
func fileKey(i int) string    { return fmt.Sprintf("file:%d", i) }
func lineKey(p string) string { return "line:" + p }

// baseIngredient is the Ingredient of the Base recipe a line calls for: a stored one, or one this import wrote.
func (s *Store) baseIngredient(ctx context.Context, tx *sql.Tx, ref recipefile.BaseRef, applied map[string]int64) (int64, error) {
	var id int64
	switch ref.Kind {
	case recipefile.BaseRefRecipe:
		id = ref.ID
	case recipefile.BaseRefFile:
		id = applied[fileKey(ref.Index)]
	case recipefile.BaseRefLine:
		id = applied[lineKey(ref.Line)]
	default:
		return 0, ErrStale
	}
	if id == 0 {
		return 0, ErrStale
	}
	var ing sql.NullInt64
	err := tx.QueryRowContext(ctx, `SELECT base_ingredient_id FROM recipes WHERE id = ?`, id).Scan(&ing)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && !ing.Valid) {
		return 0, ErrStale
	}
	if err != nil {
		return 0, err
	}
	return ing.Int64, nil
}

// writeRecipe creates or replaces one Recipe. Its Ingredient ids come from the
// Commit's resolution, and its Input is validated again against the Ingredients
// as they are inside this transaction.
func (s *Store) writeRecipe(ctx context.Context, tx *sql.Tx, c recipefile.Commit, rc recipefile.RecipeCommit,
	created, newCourses map[string]int64, imageIDs map[string]string, names nameIndex, replacing map[int64]bool, applied map[string]int64) (AppliedRecipe, []string, error) {
	in := rc.Input
	courseIDs, err := courseIDsFor(rc, newCourses)
	if err != nil {
		return AppliedRecipe{}, nil, err
	}
	if courseIDs != nil {
		if err := requireActive(ctx, tx, courseIDs); err != nil {
			return AppliedRecipe{}, nil, err
		}
	}
	in.CourseIDs = courseIDs
	idOf := func(key string) (int64, error) {
		r, ok := c.Resolved[key]
		if !ok {
			return 0, ErrStale
		}
		if r.ID != 0 {
			return r.ID, nil
		}
		id, ok := created[key]
		if !ok {
			return 0, ErrStale
		}
		return id, nil
	}
	// A Base recipe line calls for the Base recipe's Ingredient; a plain one for the Ingredient its name resolved to.
	lineID := func(ref recipefile.BaseRef, key string) (int64, error) {
		if ref.Kind != "" {
			return s.baseIngredient(ctx, tx, ref, applied)
		}
		return idOf(key)
	}
	for i := range in.Lines {
		var ref recipefile.BaseRef
		if i < len(rc.LineBases) {
			ref = rc.LineBases[i]
		}
		id, err := lineID(ref, rc.LineKeys[i])
		if err != nil {
			return AppliedRecipe{}, nil, err
		}
		in.Lines[i].IngredientID = id
	}
	for st := range in.Steps {
		for u := range in.Steps[st].Uses {
			var ref recipefile.BaseRef
			if st < len(rc.UseBases) && u < len(rc.UseBases[st]) {
				ref = rc.UseBases[st][u]
			}
			id, err := lineID(ref, rc.UseKeys[st][u])
			if err != nil {
				return AppliedRecipe{}, nil, err
			}
			in.Steps[st].Uses[u].IngredientID = id
		}
		if p := rc.StepImagePaths[st]; p != "" {
			in.Steps[st].Image = imageIDs[p]
		}
	}
	if rc.ImagePath != "" {
		in.Image = imageIDs[rc.ImagePath]
	}

	lookup, err := s.unitsOf(ctx, tx, in)
	if err != nil {
		return AppliedRecipe{}, nil, err
	}
	clean, err := in.Validate(func(id int64) (units.Ingredient, bool) {
		u, ok := lookup[id]
		return u, ok
	})
	if err != nil {
		return AppliedRecipe{}, nil, fmt.Errorf("%w: recipe %q no longer validates: %v", ErrStale, in.Name, err)
	}
	key := units.NormalizeName(clean.Name)
	if rc.Action != recipefile.ActionReplace && names.taken(key, replacing) {
		return AppliedRecipe{}, nil, ErrStale // the name was taken since the review
	}
	clean.TakeOver = rc.TakeOver // the answer of the take-over ask (P7); Validate does not carry it

	var out AppliedRecipe
	var prev []string
	if rc.Action == recipefile.ActionReplace {
		prev, err = s.recipes.ReplaceTx(ctx, tx, rc.ReplaceID, clean)
		if errors.Is(err, recipestore.ErrNotFound) {
			return AppliedRecipe{}, nil, ErrStale
		}
		if err != nil {
			return AppliedRecipe{}, nil, err
		}
		out = AppliedRecipe{Index: rc.Index, ID: rc.ReplaceID, Name: clean.Name, Action: "replaced",
			Base: rc.Input.IsBase(), Line: rc.Line, ReadNext: rc.ReadNext}
	} else {
		id, err := s.recipes.CreateTx(ctx, tx, clean)
		if err != nil {
			return AppliedRecipe{}, nil, err
		}
		names.add(key, id)
		out = AppliedRecipe{Index: rc.Index, ID: id, Name: clean.Name, Action: "created",
			Base: rc.Input.IsBase(), Line: rc.Line, ReadNext: rc.ReadNext}
	}
	if rc.Index >= 0 {
		applied[fileKey(rc.Index)] = out.ID
	} else {
		applied[lineKey(rc.Line)] = out.ID
	}
	return out, prev, nil
}

// unitsOf loads, inside tx, every Ingredient the Input uses.
func (s *Store) unitsOf(ctx context.Context, tx *sql.Tx, in recipe.Input) (map[int64]units.Ingredient, error) {
	out := map[int64]units.Ingredient{}
	need := func(id int64) error {
		if _, ok := out[id]; ok {
			return nil
		}
		ing, err := s.ingredients.GetTx(ctx, tx, id)
		if errors.Is(err, ingstore.ErrNotFound) {
			return ErrStale
		}
		if err != nil {
			return err
		}
		out[id] = ing.Units()
		return nil
	}
	for _, l := range in.Lines {
		if err := need(l.IngredientID); err != nil {
			return nil, err
		}
	}
	for _, st := range in.Steps {
		for _, u := range st.Uses {
			if err := need(u.IngredientID); err != nil {
				return nil, err
			}
		}
	}
	return out, nil
}

// staleOr maps a name clash to ErrStale and returns other errors unchanged.
func staleOr(err error) error {
	if errors.Is(err, ingstore.ErrNameTaken) || errors.Is(err, ingstore.ErrNotFound) {
		return ErrStale
	}
	return err
}
