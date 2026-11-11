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

	"github.com/fabbarix/feeder-ng/internal/clock"
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
}

// New returns a Store.
func New(d *sql.DB, clk clock.Clock, images *imaging.Store) *Store {
	return &Store{
		db:          d,
		clk:         clk,
		images:      images,
		ingredients: ingstore.New(d, clk),
		recipes:     recipestore.New(d, clk, nil).WithImages(imgs.NewGuarded(images, refs.New(d))),
	}
}

// Existing loads every Ingredient (with Unit Conversions) and every Recipe id
// and name (archived ones too).
func (s *Store) Existing(ctx context.Context) (recipefile.Existing, error) {
	var ex recipefile.Existing
	ings, err := s.ingredients.List(ctx)
	if err != nil {
		return ex, err
	}
	ex.Ingredients = ings
	recs, err := s.recipes.List(ctx, recipestore.ListFilter{Archived: "all"})
	if err != nil {
		return ex, err
	}
	for _, r := range recs {
		ex.Recipes = append(ex.Recipes, recipefile.RecipeRef{ID: r.ID, Name: r.Name})
	}
	return ex, nil
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
}

// AppliedRecipe is one written Recipe.
type AppliedRecipe struct {
	Index  int
	ID     int64
	Name   string
	Action string // "created" or "replaced"
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
	res, replaced, err := s.write(ctx, c, imageIDs)
	if err != nil {
		s.removeImages(imageIDs)
		return Result{}, err
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
func (s *Store) write(ctx context.Context, c recipefile.Commit, imageIDs map[string]string) (Result, []string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Result{}, nil, err
	}
	defer tx.Rollback()

	created, err := s.createIngredients(ctx, tx, c, imageIDs)
	if err != nil {
		return Result{}, nil, err
	}
	res := Result{IngredientsCreated: len(c.NewIngredients)}
	// A Unit Conversion the Ingredient gained since the review wins: it is kept,
	// the file's one is skipped and not counted.
	for _, a := range c.AddedConversions {
		added, err := s.ingredients.AddConversionTx(ctx, tx, a.IngredientID, a.Conversion)
		if err != nil {
			return Result{}, nil, staleOr(err)
		}
		if added {
			res.ConversionsAdded++
		}
	}

	names, err := recipeNames(ctx, tx)
	if err != nil {
		return Result{}, nil, err
	}
	replacing := map[int64]bool{}
	for _, rc := range c.Recipes {
		if rc.Action == recipefile.ActionReplace {
			replacing[rc.ReplaceID] = true
		}
	}

	var replaced []string
	for _, rc := range c.Recipes {
		applied, prev, err := s.writeRecipe(ctx, tx, c, rc, created, imageIDs, names, replacing)
		if err != nil {
			return Result{}, nil, err
		}
		res.Recipes = append(res.Recipes, applied)
		replaced = append(replaced, prev...)
	}
	if err := tx.Commit(); err != nil {
		return Result{}, nil, err
	}
	return res, replaced, nil
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

// createIngredients inserts the new Ingredients and returns their ids by key.
func (s *Store) createIngredients(ctx context.Context, tx *sql.Tx, c recipefile.Commit, imageIDs map[string]string) (map[string]int64, error) {
	created := map[string]int64{}
	for _, n := range c.NewIngredients {
		in := n.Input
		if n.ImagePath != "" {
			in.Image = imageIDs[n.ImagePath]
		}
		ing, err := s.ingredients.CreateTx(ctx, tx, in)
		if err != nil {
			return nil, staleOr(err)
		}
		created[n.Key] = ing.ID
	}
	return created, nil
}

// writeRecipe creates or replaces one Recipe. Its Ingredient ids come from the
// Commit's resolution, and its Input is validated again against the Ingredients
// as they are inside this transaction.
func (s *Store) writeRecipe(ctx context.Context, tx *sql.Tx, c recipefile.Commit, rc recipefile.RecipeCommit,
	created map[string]int64, imageIDs map[string]string, names nameIndex, replacing map[int64]bool) (AppliedRecipe, []string, error) {
	in := rc.Input
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
	for i := range in.Lines {
		id, err := idOf(rc.LineKeys[i])
		if err != nil {
			return AppliedRecipe{}, nil, err
		}
		in.Lines[i].IngredientID = id
	}
	for st := range in.Steps {
		for u := range in.Steps[st].Uses {
			id, err := idOf(rc.UseKeys[st][u])
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

	if rc.Action == recipefile.ActionReplace {
		prev, err := s.recipes.ReplaceTx(ctx, tx, rc.ReplaceID, clean)
		if errors.Is(err, recipestore.ErrNotFound) {
			return AppliedRecipe{}, nil, ErrStale
		}
		if err != nil {
			return AppliedRecipe{}, nil, err
		}
		return AppliedRecipe{Index: rc.Index, ID: rc.ReplaceID, Name: clean.Name, Action: "replaced"}, prev, nil
	}
	id, err := s.recipes.CreateTx(ctx, tx, clean)
	if err != nil {
		return AppliedRecipe{}, nil, err
	}
	names.add(key, id)
	return AppliedRecipe{Index: rc.Index, ID: id, Name: clean.Name, Action: "created"}, nil, nil
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
