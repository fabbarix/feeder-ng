// Package store is the SQL repository for Recipes, Tags and Member
// preferences. Quantities are stored as typed (quantity + unit); validation uses
// internal/recipe with Ingredients supplied by an IngredientSource.
package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/imaging"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// Errors.
var (
	ErrNotFound       = errors.New("recipe not found")
	ErrAlreadyPlanned = errors.New("recipe was planned; archive it instead")
	ErrNoMember       = errors.New("user has no linked member") // MemberForUser
	ErrUnknownMember  = errors.New("member not found")
)

// CodeImageUnknown is the validation reason for an image id that was never uploaded.
const CodeImageUnknown = "image_unknown"

// IngredientSource gives the store the Ingredients (with Unit Conversions) a
// Recipe refers to. The httpapi module adapts the ingredient store (T2).
type IngredientSource interface {
	// Units returns the Ingredient; ok=false when there is none with that id.
	Units(ctx context.Context, id int64) (ing units.Ingredient, ok bool, err error)
}

// Images is the photo storage a Store checks references against and cleans up
// (internal/imaging.Store implements it).
type Images interface {
	Exists(id string) bool
	Delete(id string) error
}

// ReadyMealIngredients lets the Store derive a Ready Meal's single line when the
// request carries none (recipe.NeedsReadyMealIngredient): it lists the existing
// Ingredients and creates the missing one inside the Recipe's transaction.
type ReadyMealIngredients interface {
	Candidates(ctx context.Context) ([]recipe.ReadyMealCandidate, error)
	// CreatePieceTx creates the Ingredient name (Base Unit piece, no Shelf Life) in tx and returns its id.
	CreatePieceTx(ctx context.Context, tx *sql.Tx, name string) (int64, error)
}

// Store is the Recipe repository.
type Store struct {
	ready   ReadyMealIngredients
	db      *sql.DB
	clk     clock.Clock
	src     IngredientSource
	planned *PlannedCheckers
	images  Images
}

// New returns a Store. Without WithImages, image references are not checked.
func New(d *sql.DB, clk clock.Clock, src IngredientSource) *Store {
	return &Store{db: d, clk: clk, src: src, planned: DefaultPlannedCheckers}
}

// WithImages makes the Store check image ids on save and remove photos that
// no Recipe or Step refers to any more.
func (s *Store) WithImages(im Images) *Store {
	s.images = im
	return s
}

// WithReadyMeal enables the Ready Meal rule: a Ready Meal saved without a line gets
// 1 piece of the Ingredient named like the Recipe, created in the same transaction.
func (s *Store) WithReadyMeal(r ReadyMealIngredients) *Store {
	s.ready = r
	return s
}

// pendingIngredient is the placeholder id a to-be-created Ready Meal Ingredient has while validating.
const pendingIngredient int64 = -1

// prepare derives the Ready Meal line when needed (create: name of the Ingredient to create in
// the transaction, empty otherwise), then validates.
func (s *Store) prepare(ctx context.Context, in recipe.Input) (clean recipe.Input, create string, err error) {
	if s.ready == nil || !recipe.NeedsReadyMealIngredient(in) {
		clean, err = s.validate(ctx, in, nil)
		return clean, "", err
	}
	cands, err := s.ready.Candidates(ctx)
	if err != nil {
		return recipe.Input{}, "", err
	}
	choice := recipe.ChooseReadyMealIngredient(in.Name, cands)
	switch {
	case choice.Conflict:
		return recipe.Input{}, "", &recipe.ValidationError{Field: "lines", Code: recipe.CodeReadyMealUnit,
			Message: "an Ingredient with the Recipe's name already exists but is not counted in pieces; name the pack Ingredient in the line"}
	case choice.Create != "":
		in.Lines = []recipe.Line{choice.Line}
		in.Lines[0].IngredientID = pendingIngredient
		clean, err = s.validate(ctx, in, map[int64]units.Ingredient{
			pendingIngredient: {Name: choice.Create, Base: units.Piece},
		})
		return clean, choice.Create, err
	case choice.ReuseID != 0:
		in.Lines = []recipe.Line{choice.Line}
	}
	clean, err = s.validate(ctx, in, nil)
	return clean, "", err
}

// createReadyMealIngredient creates the pending Ingredient and points the derived line at it.
func (s *Store) createReadyMealIngredient(ctx context.Context, tx *sql.Tx, clean *recipe.Input, name string) error {
	if name == "" {
		return nil
	}
	id, err := s.ready.CreatePieceTx(ctx, tx, name)
	if err != nil {
		return err
	}
	clean.Lines = append([]recipe.Line(nil), clean.Lines...)
	clean.Lines[0].IngredientID = id
	return nil
}

// Create validates (recipe.Input.Validate, with the Ingredients of the lines and
// Step uses looked up via the IngredientSource) and stores a new Recipe with
// its Tags (created on use). Returns the stored Recipe with Timing filled in.
// Errors: *recipe.ValidationError, *recipe.UnknownUnitError.
func (s *Store) Create(ctx context.Context, in recipe.Input) (recipe.Recipe, error) {
	clean, create, err := s.prepare(ctx, in)
	if err != nil {
		return recipe.Recipe{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return recipe.Recipe{}, err
	}
	defer tx.Rollback()
	if err := s.createReadyMealIngredient(ctx, tx, &clean, create); err != nil {
		return recipe.Recipe{}, err
	}
	id, err := s.CreateTx(ctx, tx, clean)
	if err != nil {
		return recipe.Recipe{}, err
	}
	if err := tx.Commit(); err != nil {
		return recipe.Recipe{}, err
	}
	return s.Get(ctx, id)
}

// CreateTx inserts a Recipe whose Input is already validated (recipe.Input.Validate
// with the Ingredients it uses) inside the caller's transaction. It checks no
// image ids and commits nothing. Returns the new id.
func (s *Store) CreateTx(ctx context.Context, tx *sql.Tx, clean recipe.Input) (int64, error) {
	timing, err := recipe.TimingOf(clean.Steps)
	if err != nil {
		return 0, err
	}
	now := s.now()
	res, err := tx.ExecContext(ctx, `INSERT INTO recipes (name, description, yield, ready_meal, cooldown_days, leftover_use_by_days,
	        reheat_minutes, source_url, source_attribution, image, archived, total_minutes, advance_minutes, created_at, updated_at)
	        VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?,?)`,
		clean.Name, clean.Description, clean.Yield, boolInt(clean.ReadyMeal), nullInt(clean.CooldownDays), nullInt(clean.LeftoverUseByDays),
		nullInt(clean.ReheatMinutes), clean.Source.URL, clean.Source.Attribution, clean.Image, timing.TotalMinutes, timing.AdvanceMinutes, now, now)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, err
	}
	if err := writeContent(ctx, tx, id, clean); err != nil {
		return 0, err
	}
	return id, nil
}

// Get returns the Recipe; ErrNotFound.
func (s *Store) Get(ctx context.Context, id int64) (recipe.Recipe, error) {
	return getRecipe(ctx, s.db, id)
}

// Update replaces every field, line and Step (PUT semantics), keeping id,
// archived flag and created_at. Same errors as Create, plus ErrNotFound.
func (s *Store) Update(ctx context.Context, id int64, in recipe.Input) (recipe.Recipe, error) {
	clean, create, err := s.prepare(ctx, in)
	if err != nil {
		return recipe.Recipe{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return recipe.Recipe{}, err
	}
	defer tx.Rollback()
	if err := s.createReadyMealIngredient(ctx, tx, &clean, create); err != nil {
		return recipe.Recipe{}, err
	}
	before, err := s.ReplaceTx(ctx, tx, id, clean)
	if err != nil {
		return recipe.Recipe{}, err
	}
	if err := tx.Commit(); err != nil {
		return recipe.Recipe{}, err
	}
	s.dropUnreferenced(ctx, before)
	return s.Get(ctx, id)
}

// ReplaceTx overwrites the Recipe id (keeping its archived flag and created_at)
// with an already validated Input, inside the caller's transaction. ErrNotFound
// when there is no such Recipe. It returns the image ids the Recipe referred to
// before; the caller removes those no longer referenced (DropUnreferenced) after
// the commit.
func (s *Store) ReplaceTx(ctx context.Context, tx *sql.Tx, id int64, clean recipe.Input) ([]string, error) {
	timing, err := recipe.TimingOf(clean.Steps)
	if err != nil {
		return nil, err
	}
	if err := exists(ctx, tx, `SELECT 1 FROM recipes WHERE id = ?`, id, ErrNotFound); err != nil {
		return nil, err
	}
	before, err := recipeImages(ctx, tx, id)
	if err != nil {
		return nil, err
	}
	for _, q := range []string{
		`DELETE FROM recipe_step_uses WHERE recipe_id = ?`,
		`DELETE FROM recipe_steps WHERE recipe_id = ?`,
		`DELETE FROM recipe_lines WHERE recipe_id = ?`,
		`DELETE FROM recipe_tags WHERE recipe_id = ?`,
	} {
		if _, err := tx.ExecContext(ctx, q, id); err != nil {
			return nil, err
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE recipes SET name = ?, description = ?, yield = ?, ready_meal = ?, cooldown_days = ?,
	        leftover_use_by_days = ?, reheat_minutes = ?, source_url = ?, source_attribution = ?, image = ?, total_minutes = ?, advance_minutes = ?,
	        updated_at = ? WHERE id = ?`,
		clean.Name, clean.Description, clean.Yield, boolInt(clean.ReadyMeal), nullInt(clean.CooldownDays), nullInt(clean.LeftoverUseByDays),
		nullInt(clean.ReheatMinutes), clean.Source.URL, clean.Source.Attribution, clean.Image, timing.TotalMinutes, timing.AdvanceMinutes, s.now(), id); err != nil {
		return nil, err
	}
	if err := writeContent(ctx, tx, id, clean); err != nil {
		return nil, err
	}
	return before, nil
}

// DropUnreferenced removes the stored photos in ids that no Recipe or Step uses
// any more (best-effort, see dropUnreferenced).
func (s *Store) DropUnreferenced(ctx context.Context, ids []string) {
	s.dropUnreferenced(ctx, ids)
}

// ListFilter selects Recipes. Archived: "" or "no" = active only, "yes" = archived only, "all".
type ListFilter struct {
	Archived string
	Tag      string // TagKey match; "" = any
	Query    string // case-insensitive substring of the name; "" = any
}

// List returns Summaries ordered by name (case-insensitive), then id.
func (s *Store) List(ctx context.Context, f ListFilter) ([]recipe.Summary, error) {
	var where []string
	var args []any
	switch f.Archived {
	case "yes":
		where = append(where, "r.archived = 1")
	case "all":
	default:
		where = append(where, "r.archived = 0")
	}
	if f.Tag != "" {
		where = append(where, `EXISTS (SELECT 1 FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id
		        WHERE rt.recipe_id = r.id AND t.key = ?)`)
		args = append(args, recipe.TagKey(f.Tag))
	}
	q := `SELECT r.id, r.name, r.yield, r.ready_meal, r.image, r.archived, r.total_minutes, r.advance_minutes, r.reheat_minutes FROM recipes r`
	if len(where) > 0 {
		q += " WHERE " + strings.Join(where, " AND ")
	}
	q += " ORDER BY lower(r.name), r.id"
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	needle := strings.ToLower(strings.TrimSpace(f.Query))
	out := []recipe.Summary{}
	for rows.Next() {
		var sum recipe.Summary
		var ready, archived int64
		var reheat sql.NullInt64
		if err := rows.Scan(&sum.ID, &sum.Name, &sum.Yield, &ready, &sum.Image, &archived, &sum.TotalMinutes, &sum.AdvanceMinutes, &reheat); err != nil {
			return nil, err
		}
		sum.ReheatMinutes = int(reheat.Int64)
		if needle != "" && !strings.Contains(strings.ToLower(sum.Name), needle) {
			continue
		}
		sum.ReadyMeal = ready == 1
		sum.Archived = archived == 1
		sum.Tags = []string{}
		out = append(out, sum)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return out, nil
	}
	tags, err := s.allRecipeTags(ctx)
	if err != nil {
		return nil, err
	}
	for i := range out {
		if t, ok := tags[out[i].ID]; ok {
			out[i].Tags = t
		}
	}
	return out, nil
}

func (s *Store) allRecipeTags(ctx context.Context) (map[int64][]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT rt.recipe_id, t.name FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id
	        ORDER BY rt.recipe_id, rt.position`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64][]string{}
	for rows.Next() {
		var id int64
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		out[id] = append(out[id], name)
	}
	return out, rows.Err()
}

// SetArchived archives or restores a Recipe (idempotent). Archived Recipes keep
// their history and preferences.
func (s *Store) SetArchived(ctx context.Context, id int64, archived bool) (recipe.Recipe, error) {
	res, err := s.db.ExecContext(ctx, `UPDATE recipes SET archived = ? WHERE id = ?`, boolInt(archived), id)
	if err != nil {
		return recipe.Recipe{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return recipe.Recipe{}, ErrNotFound
	}
	return s.Get(ctx, id)
}

// Delete hard-deletes a Recipe, its lines, Steps and preferences. It asks every
// registered PlannedChecker first and returns ErrAlreadyPlanned if any says the
// Recipe was ever planned. ErrNotFound.
func (s *Store) Delete(ctx context.Context, id int64) error {
	if err := exists(ctx, s.db, `SELECT 1 FROM recipes WHERE id = ?`, id, ErrNotFound); err != nil {
		return err
	}
	planned, err := s.planned.WasPlanned(ctx, s.db, id)
	if err != nil {
		return err
	}
	if planned {
		return ErrAlreadyPlanned
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	before, err := recipeImages(ctx, tx, id)
	if err != nil {
		return err
	}
	// Lines, Steps, uses, Tag links and preferences go with the Recipe (ON DELETE CASCADE).
	if _, err := tx.ExecContext(ctx, `DELETE FROM recipes WHERE id = ?`, id); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.dropUnreferenced(ctx, before)
	return nil
}

// TagCount is a Tag and the number of (active and archived) Recipes using it.
type TagCount struct {
	Name    string
	Recipes int
}

// Tags returns every Tag ordered by name; Tags stay when no Recipe uses them.
func (s *Store) Tags(ctx context.Context) ([]TagCount, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT t.name, (SELECT count(*) FROM recipe_tags rt WHERE rt.tag_id = t.id)
	        FROM tags t ORDER BY lower(t.name), t.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TagCount{}
	for rows.Next() {
		var c TagCount
		if err := rows.Scan(&c.Name, &c.Recipes); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// Preferences are one Member's Favourites, Dislikes and Exclusions.
type Preferences struct {
	Recipes             map[int64]recipe.State // only non-none
	ExcludedIngredients []int64                // ascending
}

// SetRecipeState sets the Member's single state for the Recipe; StateNone clears.
// ErrNotFound (recipe), ErrUnknownMember.
func (s *Store) SetRecipeState(ctx context.Context, memberID, recipeID int64, st recipe.State) error {
	if err := exists(ctx, s.db, `SELECT 1 FROM members WHERE id = ?`, memberID, ErrUnknownMember); err != nil {
		return err
	}
	if err := exists(ctx, s.db, `SELECT 1 FROM recipes WHERE id = ?`, recipeID, ErrNotFound); err != nil {
		return err
	}
	switch st {
	case recipe.StateNone:
		_, err := s.db.ExecContext(ctx, `DELETE FROM member_recipe_preferences WHERE member_id = ? AND recipe_id = ?`, memberID, recipeID)
		return err
	case recipe.StateFavourite, recipe.StateDislike, recipe.StateExclusion:
		_, err := s.db.ExecContext(ctx, `INSERT INTO member_recipe_preferences (member_id, recipe_id, state) VALUES (?,?,?)
		        ON CONFLICT (member_id, recipe_id) DO UPDATE SET state = excluded.state`, memberID, recipeID, string(st))
		return err
	}
	return fmt.Errorf("unknown preference state %q", st)
}

// SetIngredientExclusion adds or removes the Member's Exclusion of an Ingredient
// (idempotent). ErrUnknownMember; an unknown Ingredient is ErrNotFound.
func (s *Store) SetIngredientExclusion(ctx context.Context, memberID, ingredientID int64, excluded bool) error {
	if err := exists(ctx, s.db, `SELECT 1 FROM members WHERE id = ?`, memberID, ErrUnknownMember); err != nil {
		return err
	}
	if err := exists(ctx, s.db, `SELECT 1 FROM ingredients WHERE id = ?`, ingredientID, ErrNotFound); err != nil {
		return err
	}
	if excluded {
		_, err := s.db.ExecContext(ctx, `INSERT OR IGNORE INTO member_ingredient_exclusions (member_id, ingredient_id) VALUES (?,?)`,
			memberID, ingredientID)
		return err
	}
	_, err := s.db.ExecContext(ctx, `DELETE FROM member_ingredient_exclusions WHERE member_id = ? AND ingredient_id = ?`,
		memberID, ingredientID)
	return err
}

// Preferences returns the Member's preferences; ErrUnknownMember.
func (s *Store) Preferences(ctx context.Context, memberID int64) (Preferences, error) {
	if err := exists(ctx, s.db, `SELECT 1 FROM members WHERE id = ?`, memberID, ErrUnknownMember); err != nil {
		return Preferences{}, err
	}
	out := Preferences{Recipes: map[int64]recipe.State{}, ExcludedIngredients: []int64{}}
	rows, err := s.db.QueryContext(ctx, `SELECT recipe_id, state FROM member_recipe_preferences WHERE member_id = ? ORDER BY recipe_id`, memberID)
	if err != nil {
		return Preferences{}, err
	}
	for rows.Next() {
		var id int64
		var st string
		if err := rows.Scan(&id, &st); err != nil {
			rows.Close()
			return Preferences{}, err
		}
		out.Recipes[id] = recipe.State(st)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return Preferences{}, err
	}
	ex, err := s.db.QueryContext(ctx, `SELECT ingredient_id FROM member_ingredient_exclusions WHERE member_id = ? ORDER BY ingredient_id`, memberID)
	if err != nil {
		return Preferences{}, err
	}
	defer ex.Close()
	for ex.Next() {
		var id int64
		if err := ex.Scan(&id); err != nil {
			return Preferences{}, err
		}
		out.ExcludedIngredients = append(out.ExcludedIngredients, id)
	}
	return out, ex.Err()
}

// MemberForUser returns the id of the Member linked to the User (members.user_id);
// ErrNoMember when none is linked.
func (s *Store) MemberForUser(ctx context.Context, userID int64) (int64, error) {
	var id int64
	err := s.db.QueryRowContext(ctx, `SELECT id FROM members WHERE user_id = ?`, userID).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrNoMember
	}
	return id, err
}

// validate looks up the Ingredients a Recipe uses, then runs recipe validation and
// the image checks.
func (s *Store) validate(ctx context.Context, in recipe.Input, preset map[int64]units.Ingredient) (recipe.Input, error) {
	found := map[int64]units.Ingredient{}
	for id, ing := range preset {
		found[id] = ing
	}
	var ids []int64
	for _, l := range in.Lines {
		ids = append(ids, l.IngredientID)
	}
	for _, st := range in.Steps {
		for _, u := range st.Uses {
			ids = append(ids, u.IngredientID)
		}
	}
	for _, id := range ids {
		if _, seen := found[id]; seen {
			continue
		}
		ing, ok, err := s.src.Units(ctx, id)
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
	if err := s.checkImages(clean); err != nil {
		return recipe.Input{}, err
	}
	return clean, nil
}

func (s *Store) checkImages(in recipe.Input) error {
	if s.images == nil {
		return nil
	}
	if in.Image != "" && !s.imageExists(in.Image) {
		return &recipe.ValidationError{Field: "image", Code: CodeImageUnknown, Message: "that image has not been uploaded"}
	}
	for i, st := range in.Steps {
		if st.Image != "" && !s.imageExists(st.Image) {
			return &recipe.ValidationError{Field: fmt.Sprintf("steps[%d].image", i), Code: CodeImageUnknown, Message: "that image has not been uploaded"}
		}
	}
	return nil
}

func (s *Store) imageExists(id string) bool {
	return imaging.ValidID(id) && s.images.Exists(id)
}

// dropUnreferenced removes the photos in ids that no Recipe or Step uses any
// more. Best-effort: a failed file removal leaves an orphan, never a broken Recipe.
func (s *Store) dropUnreferenced(ctx context.Context, ids []string) {
	if s.images == nil {
		return
	}
	for _, id := range ids {
		var n int
		err := s.db.QueryRowContext(ctx, `SELECT (SELECT count(*) FROM recipes WHERE image = ?) + (SELECT count(*) FROM recipe_steps WHERE image = ?)`,
			id, id).Scan(&n)
		if err == nil && n == 0 {
			_ = s.images.Delete(id)
		}
	}
}

func (s *Store) now() string { return s.clk.Now().UTC().Format(time.RFC3339) }

// writeContent stores Tags, lines, Steps and their uses for the Recipe id.
func writeContent(ctx context.Context, tx *sql.Tx, id int64, in recipe.Input) error {
	for pos, name := range in.Tags {
		tagID, err := upsertTag(ctx, tx, name)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO recipe_tags (recipe_id, tag_id, position) VALUES (?,?,?)`, id, tagID, pos); err != nil {
			return err
		}
	}
	for pos, l := range in.Lines {
		if _, err := tx.ExecContext(ctx, `INSERT INTO recipe_lines (recipe_id, position, ingredient_id, quantity, unit, optional, note)
		        VALUES (?,?,?,?,?,?,?)`, id, pos, l.IngredientID, l.Quantity, l.Unit, boolInt(l.Optional), l.Note); err != nil {
			return err
		}
	}
	for pos, st := range in.Steps {
		after := st.After
		if after == nil {
			after = []int{}
		}
		raw, err := json.Marshal(after)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO recipe_steps (recipe_id, position, text, kind, duration_minutes, lead_time_minutes, after_json, image)
		        VALUES (?,?,?,?,?,?,?,?)`, id, pos, st.Text, string(st.Kind), st.DurationMinutes, st.LeadTimeMinutes, string(raw), st.Image); err != nil {
			return err
		}
		for upos, u := range st.Uses {
			if _, err := tx.ExecContext(ctx, `INSERT INTO recipe_step_uses (recipe_id, step_position, position, ingredient_id, quantity, unit)
			        VALUES (?,?,?,?,?,?)`, id, pos, upos, u.IngredientID, u.Quantity, u.Unit); err != nil {
				return err
			}
		}
	}
	return nil
}

// upsertTag returns the Tag's id, creating it on first use. The first spelling is kept.
func upsertTag(ctx context.Context, tx *sql.Tx, name string) (int64, error) {
	key := recipe.TagKey(name)
	if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO tags (key, name) VALUES (?,?)`, key, name); err != nil {
		return 0, err
	}
	var id int64
	err := tx.QueryRowContext(ctx, `SELECT id FROM tags WHERE key = ?`, key).Scan(&id)
	return id, err
}

// getRecipe loads a Recipe with its Tags, lines, Steps and timing.
func getRecipe(ctx context.Context, q Querier, id int64) (recipe.Recipe, error) {
	var r recipe.Recipe
	var ready, archived int64
	var cool, useBy, reheat sql.NullInt64
	var created, updated string
	err := q.QueryRowContext(ctx, `SELECT name, description, yield, ready_meal, cooldown_days, leftover_use_by_days,
	        reheat_minutes, source_url, source_attribution, image, archived, created_at, updated_at FROM recipes WHERE id = ?`, id).
		Scan(&r.Name, &r.Description, &r.Yield, &ready, &cool, &useBy, &reheat, &r.Source.URL, &r.Source.Attribution, &r.Image,
			&archived, &created, &updated)
	if errors.Is(err, sql.ErrNoRows) {
		return recipe.Recipe{}, ErrNotFound
	}
	if err != nil {
		return recipe.Recipe{}, err
	}
	r.ID = id
	r.ReadyMeal = ready == 1
	r.Archived = archived == 1
	if cool.Valid {
		r.CooldownDays = intPtr(int(cool.Int64))
	}
	if useBy.Valid {
		r.LeftoverUseByDays = intPtr(int(useBy.Int64))
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
	if r.Lines, err = loadLines(ctx, q, id); err != nil {
		return recipe.Recipe{}, err
	}
	if r.Steps, err = loadSteps(ctx, q, id); err != nil {
		return recipe.Recipe{}, err
	}
	if r.Timing, err = recipe.TimingOf(r.Steps); err != nil {
		return recipe.Recipe{}, err
	}
	return r, nil
}

func loadTags(ctx context.Context, q Querier, id int64) ([]string, error) {
	rows, err := q.QueryContext(ctx, `SELECT t.name FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id
	        WHERE rt.recipe_id = ? ORDER BY rt.position`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		out = append(out, name)
	}
	return out, rows.Err()
}

func loadLines(ctx context.Context, q Querier, id int64) ([]recipe.Line, error) {
	rows, err := q.QueryContext(ctx, `SELECT rl.ingredient_id, i.name, rl.quantity, rl.unit, rl.optional, rl.note
	        FROM recipe_lines rl JOIN ingredients i ON i.id = rl.ingredient_id
	        WHERE rl.recipe_id = ? ORDER BY rl.position`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []recipe.Line
	for rows.Next() {
		var l recipe.Line
		var optional int64
		if err := rows.Scan(&l.IngredientID, &l.Ingredient, &l.Quantity, &l.Unit, &optional, &l.Note); err != nil {
			return nil, err
		}
		l.Optional = optional == 1
		out = append(out, l)
	}
	return out, rows.Err()
}

func loadSteps(ctx context.Context, q Querier, id int64) ([]recipe.Step, error) {
	rows, err := q.QueryContext(ctx, `SELECT text, kind, duration_minutes, lead_time_minutes, after_json, image
	        FROM recipe_steps WHERE recipe_id = ? ORDER BY position`, id)
	if err != nil {
		return nil, err
	}
	var out []recipe.Step
	for rows.Next() {
		var st recipe.Step
		var kind, after string
		if err := rows.Scan(&st.Text, &kind, &st.DurationMinutes, &st.LeadTimeMinutes, &after, &st.Image); err != nil {
			rows.Close()
			return nil, err
		}
		st.Kind = schedule.Kind(kind)
		if err := json.Unmarshal([]byte(after), &st.After); err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, st)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	uses, err := q.QueryContext(ctx, `SELECT step_position, ingredient_id, quantity, unit FROM recipe_step_uses
	        WHERE recipe_id = ? ORDER BY step_position, position`, id)
	if err != nil {
		return nil, err
	}
	defer uses.Close()
	for uses.Next() {
		var pos int
		var u recipe.Use
		if err := uses.Scan(&pos, &u.IngredientID, &u.Quantity, &u.Unit); err != nil {
			return nil, err
		}
		if pos < 0 || pos >= len(out) {
			return nil, fmt.Errorf("recipe %d: use of missing step %d", id, pos)
		}
		out[pos].Uses = append(out[pos].Uses, u)
	}
	return out, uses.Err()
}

// recipeImages lists the photo ids a Recipe and its Steps refer to.
func recipeImages(ctx context.Context, q Querier, id int64) ([]string, error) {
	rows, err := q.QueryContext(ctx, `SELECT image FROM recipes WHERE id = ? AND image != ''
	        UNION SELECT image FROM recipe_steps WHERE recipe_id = ? AND image != ''`, id, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var img string
		if err := rows.Scan(&img); err != nil {
			return nil, err
		}
		out = append(out, img)
	}
	return out, rows.Err()
}

// exists returns notFound when the query finds no row.
func exists(ctx context.Context, q Querier, query string, id int64, notFound error) error {
	var one int
	err := q.QueryRowContext(ctx, query, id).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return notFound
	}
	return err
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func nullInt(p *int) any {
	if p == nil {
		return nil
	}
	return *p
}

func intPtr(n int) *int { return &n }
