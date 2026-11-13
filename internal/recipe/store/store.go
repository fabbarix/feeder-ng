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
	ingstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	tagstore "github.com/fabbarix/feeder-ng/internal/tag/store"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// Errors.
var (
	ErrNotFound       = errors.New("recipe not found")
	ErrAlreadyPlanned = errors.New("recipe was planned; archive it instead")
	ErrNoMember       = errors.New("user has no linked member") // MemberForUser
	ErrUnknownMember  = errors.New("member not found")
	// ErrReadyMealNameTaken: the Ready Meal's Ingredient name was taken between the lookup and the insert.
	ErrReadyMealNameTaken = errors.New("an Ingredient with the Recipe's name was created meanwhile")
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
	Delete(ctx context.Context, id string) error
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
	ings    *ingstore.Store // Base recipe lifecycle (base.go); nil = Base recipes cannot be made
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
func (s *Store) prepare(ctx context.Context, in recipe.Input, id int64) (clean recipe.Input, create string, err error) {
	// The placeholder only ever stands for the derived line; a Step use of it is just an unknown Ingredient.
	for i, st := range in.Steps {
		for j, u := range st.Uses {
			if u.IngredientID == pendingIngredient {
				return recipe.Input{}, "", &recipe.ValidationError{Field: fmt.Sprintf("steps[%d].uses[%d].ingredientId", i, j),
					Code: recipe.CodeUnknownIngr, Message: "that Ingredient does not exist"}
			}
		}
	}
	if in, err = s.resolveKind(ctx, in, id); err != nil {
		return recipe.Input{}, "", err
	}
	if in, err = s.mapBaseLines(ctx, in); err != nil {
		return recipe.Input{}, "", err
	}
	if err := s.checkNeededAt(ctx, in); err != nil {
		return recipe.Input{}, "", err
	}
	if s.ready == nil || !recipe.NeedsReadyMealIngredient(in) {
		clean, err = s.validate(ctx, in, nil)
		if err != nil {
			return recipe.Input{}, "", err
		}
		return clean, "", s.checkReadyMealName(ctx, clean, id)
	}
	cands, err := s.ready.Candidates(ctx)
	if err != nil {
		return recipe.Input{}, "", err
	}
	if err := s.markBaseCandidates(ctx, cands); err != nil {
		return recipe.Input{}, "", err
	}
	choice := recipe.ChooseReadyMealIngredient(in.Name, cands)
	switch {
	case choice.BaseRecipeTaken:
		return recipe.Input{}, "", refusedName(recipe.CodeBaseRecipeNameTaken)
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
	if err != nil {
		return recipe.Input{}, "", err
	}
	return clean, "", s.checkReadyMealName(ctx, clean, id)
}

// resolveKind settles the Base recipe kind of a save: an absent kind keeps the stored one (a create has none, id 0);
// the other kind is refused, because the kind changes only by to-base and to-plannable (base_recipe_kind).
func (s *Store) resolveKind(ctx context.Context, in recipe.Input, id int64) (recipe.Input, error) {
	if id == 0 {
		return in, nil
	}
	var base sql.NullInt64
	err := s.db.QueryRowContext(ctx, `SELECT base_ingredient_id FROM recipes WHERE id = ?`, id).Scan(&base)
	if errors.Is(err, sql.ErrNoRows) {
		return recipe.Input{}, ErrNotFound
	}
	if err != nil {
		return recipe.Input{}, err
	}
	if in.BaseRecipe == nil {
		in.BaseRecipe = boolPtrOf(base.Valid)
		return in, nil
	}
	if *in.BaseRecipe != base.Valid {
		return recipe.Input{}, &recipe.ValidationError{Field: "baseRecipe", Code: recipe.CodeBaseRecipeKind,
			Message: "a save cannot change the kind: use to-base or to-plannable"}
	}
	return in, nil
}

// mapBaseLines points each line that names a Base recipe (baseRecipeId) at that Base recipe's Ingredient.
func (s *Store) mapBaseLines(ctx context.Context, in recipe.Input) (recipe.Input, error) {
	lines := append([]recipe.Line(nil), in.Lines...)
	for i := range lines {
		if lines[i].BaseRecipeID == 0 {
			continue
		}
		ing, err := baseIngredientOf(ctx, s.db, lines[i].BaseRecipeID)
		if errors.Is(err, sql.ErrNoRows) {
			return recipe.Input{}, &recipe.ValidationError{Field: fmt.Sprintf("lines[%d].baseRecipeId", i),
				Code: recipe.CodeUnknownIngr, Message: "that Base recipe does not exist"}
		}
		if err != nil {
			return recipe.Input{}, err
		}
		lines[i].IngredientID = ing
		lines[i].BaseRecipeID = 0
	}
	in.Lines = lines
	return in, nil
}

// checkNeededAt refuses a Needed at on a line that is not a Base recipe line (§3.3).
func (s *Store) checkNeededAt(ctx context.Context, in recipe.Input) error {
	for i, l := range in.Lines {
		if l.NeededAtStep == nil {
			continue
		}
		ok, err := isBaseIngredient(ctx, s.db, l.IngredientID)
		if err != nil {
			return err
		}
		if !ok {
			return &recipe.ValidationError{Field: fmt.Sprintf("lines[%d].neededAtStep", i), Code: recipe.CodeNeededAtStepInvalid,
				Message: "Needed at is set on a Base recipe line only"}
		}
	}
	return nil
}

// markBaseCandidates tells the Ready Meal rule which Ingredients belong to a Base recipe (it never reuses them).
func (s *Store) markBaseCandidates(ctx context.Context, cands []recipe.ReadyMealCandidate) error {
	rows, err := s.db.QueryContext(ctx, `SELECT base_ingredient_id FROM recipes WHERE base_ingredient_id IS NOT NULL`)
	if err != nil {
		return err
	}
	defer rows.Close()
	bases := map[int64]bool{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return err
		}
		bases[id] = true
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for i := range cands {
		cands[i].BaseRecipe = bases[cands[i].ID]
	}
	return nil
}

// checkReadyMealName refuses a Ready Meal named like a Base recipe (§3.2, the reverse case).
func (s *Store) checkReadyMealName(ctx context.Context, clean recipe.Input, selfID int64) error {
	if !clean.ReadyMeal {
		return nil
	}
	rows, err := s.db.QueryContext(ctx, `SELECT name FROM recipes WHERE base_ingredient_id IS NOT NULL AND id != ?`, selfID)
	if err != nil {
		return err
	}
	defer rows.Close()
	key := units.NormalizeName(clean.Name)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return err
		}
		if units.NormalizeName(name) == key {
			return refusedName(recipe.CodeBaseRecipeNameTaken)
		}
	}
	return rows.Err()
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
	clean, create, err := s.prepare(ctx, in, 0)
	if err != nil {
		return recipe.Recipe{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return recipe.Recipe{}, err
	}
	defer tx.Rollback()
	for i := range clean.Lines {
		clean.Lines[i].ID = 0 // a new Recipe has no line ids to keep
	}
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
	isBase := clean.IsBase()
	if err := checkCourses(ctx, tx, clean.CourseIDs); err != nil {
		return 0, err
	}
	timing, err := recipe.TimingOf(clean.Steps)
	if err != nil {
		return 0, err
	}
	now := s.now()
	mainID, err := mainCourse(ctx, tx)
	if err != nil {
		return 0, err
	}
	courseIDs := clean.CourseIDs
	if courseIDs == nil && !isBase {
		courseIDs = []int64{mainID}
	}
	if isBase {
		courseIDs = nil // a Base recipe has no Courses (§3.1)
	}
	whole := recipe.DefaultWholeMeal(clean.ReadyMeal, courseIDs, mainID)
	if clean.WholeMeal != nil {
		whole = *clean.WholeMeal
	}
	if isBase {
		whole = false
	}
	yieldUnit := sql.NullString{}
	if isBase {
		yieldUnit = sql.NullString{String: clean.YieldUnit, Valid: true}
	}
	res, err := tx.ExecContext(ctx, `INSERT INTO recipes (name, description, yield, ready_meal, cooldown_days, leftover_use_by_days, frozen_use_by_days,
	        reheat_minutes, source_url, source_attribution, image, archived, total_minutes, advance_minutes, whole_meal, created_at, updated_at, yield_unit)
	        VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?)`,
		clean.Name, clean.Description, clean.Yield, boolInt(clean.ReadyMeal), nullInt(clean.CooldownDays), nullInt(clean.LeftoverUseByDays),
		nullInt(clean.FrozenUseByDays), nullInt(clean.ReheatMinutes), clean.Source.URL, clean.Source.Attribution, clean.Image, timing.TotalMinutes, timing.AdvanceMinutes,
		boolInt(whole), now, now, yieldUnit)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, err
	}
	if isBase {
		if _, err := s.claimBase(ctx, tx, id, 0, clean, false); err != nil {
			return 0, err
		}
	}
	if err := writeCourses(ctx, tx, id, courseIDs); err != nil {
		return 0, err
	}
	if err := writeContent(ctx, tx, id, clean); err != nil {
		return 0, err
	}
	if err := refreshTotals(ctx, tx, id); err != nil {
		return 0, err
	}
	if err := checkCycles(ctx, tx, id); err != nil {
		return 0, err
	}
	return id, nil
}

// checkCourses reports a ValidationError for a Course id that does not exist or is archived, read through the
// caller's transaction so a Course created earlier in it counts.
func checkCourses(ctx context.Context, q Querier, ids []int64) error {
	for _, id := range ids {
		var active int
		if err := q.QueryRowContext(ctx, `SELECT count(*) FROM courses WHERE id = ? AND archived = 0`, id).Scan(&active); err != nil {
			return err
		}
		if active == 0 {
			return &recipe.ValidationError{Field: "courses", Code: recipe.CodeCourseUnknown,
				Message: "that Course does not exist or is archived"}
		}
	}
	return nil
}

// Get returns the Recipe; ErrNotFound.
func (s *Store) Get(ctx context.Context, id int64) (recipe.Recipe, error) {
	return getRecipe(ctx, s.db, id)
}

// Update replaces every field, line and Step (PUT semantics), keeping id,
// archived flag and created_at. Same errors as Create, plus ErrNotFound.
func (s *Store) Update(ctx context.Context, id int64, in recipe.Input) (recipe.Recipe, error) {
	clean, create, err := s.prepare(ctx, in, id)
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
	if err := checkCourses(ctx, tx, clean.CourseIDs); err != nil {
		return nil, err
	}
	timing, err := recipe.TimingOf(clean.Steps)
	if err != nil {
		return nil, err
	}
	var storedWhole int64
	var storedBase sql.NullInt64
	var storedName string
	if err := tx.QueryRowContext(ctx, `SELECT whole_meal, base_ingredient_id, name FROM recipes WHERE id = ?`, id).Scan(&storedWhole, &storedBase, &storedName); errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	} else if err != nil {
		return nil, err
	}
	isBase := clean.IsBase()
	if storedBase.Valid != isBase {
		return nil, &recipe.ValidationError{Field: "baseRecipe", Code: recipe.CodeBaseRecipeKind, Message: "a save cannot change the kind: use to-base or to-plannable"}
	}
	before, err := recipeImages(ctx, tx, id)
	if err != nil {
		return nil, err
	}
	prevCourses, err := loadCourses(ctx, tx, id)
	if err != nil {
		return nil, err
	}
	// Courses: nil keeps the stored ones; Whole meal: nil keeps the stored value. A Base recipe has neither.
	ids := clean.CourseIDs
	if ids == nil {
		ids = courseIDs(prevCourses)
	}
	whole := storedWhole == 1
	if clean.WholeMeal != nil {
		whole = *clean.WholeMeal
	}
	if isBase {
		ids, whole = nil, false
	}
	lines, err := lineMemory(ctx, tx, id, clean.Lines)
	if err != nil {
		return nil, err
	}
	clean.Lines = lines
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
	yieldUnit := sql.NullString{}
	if isBase {
		yieldUnit = sql.NullString{String: clean.YieldUnit, Valid: true}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE recipes SET name = ?, description = ?, yield = ?, ready_meal = ?, cooldown_days = ?,
	        leftover_use_by_days = ?, frozen_use_by_days = ?, reheat_minutes = ?, source_url = ?, source_attribution = ?, image = ?, total_minutes = ?, advance_minutes = ?,
	        whole_meal = ?, yield_unit = ?, updated_at = ? WHERE id = ?`,
		clean.Name, clean.Description, clean.Yield, boolInt(clean.ReadyMeal), nullInt(clean.CooldownDays), nullInt(clean.LeftoverUseByDays),
		nullInt(clean.FrozenUseByDays), nullInt(clean.ReheatMinutes), clean.Source.URL, clean.Source.Attribution, clean.Image, timing.TotalMinutes, timing.AdvanceMinutes,
		boolInt(whole), yieldUnit, s.now(), id); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM recipe_courses WHERE recipe_id = ?`, id); err != nil {
		return nil, err
	}
	if err := writeCourses(ctx, tx, id, ids); err != nil {
		return nil, err
	}
	// A Recipe that loses a Course loses its unpinned, unresolved plan there (and its Slot Rules by Recipe).
	if lost := recipe.LostCourses(courseIDs(prevCourses), ids); len(lost) > 0 {
		if err := s.dropLostCourses(ctx, tx, id, lost); err != nil {
			return nil, err
		}
	}
	if isBase {
		keepName := units.NormalizeName(storedName) == units.NormalizeName(clean.Name)
		if _, err := s.claimBase(ctx, tx, id, storedBase.Int64, clean, keepName); err != nil {
			return nil, err
		}
	}
	if err := writeContent(ctx, tx, id, clean); err != nil {
		return nil, err
	}
	if err := refreshTotals(ctx, tx, id); err != nil {
		return nil, err
	}
	if err := checkCycles(ctx, tx, id); err != nil {
		return nil, err
	}
	return before, nil
}

// lineMemory keeps the line ids a Recipe's lines had (an editor's PUT names them, so a line keeps its id across saves)
// and the plain Ingredient a Base recipe line was linked from (§3.7): an explicit one wins, else a line matched by id
// keeps its memory, or remembers the plain Ingredient it had when a save made it a Base recipe line.
func lineMemory(ctx context.Context, tx *sql.Tx, id int64, in []recipe.Line) ([]recipe.Line, error) {
	type old struct{ ingredient, linked int64 }
	rows, err := tx.QueryContext(ctx, `SELECT id, ingredient_id, linked_from_ingredient_id FROM recipe_lines WHERE recipe_id = ?`, id)
	if err != nil {
		return nil, err
	}
	existing := map[int64]old{}
	for rows.Next() {
		var lid, ing int64
		var linked sql.NullInt64
		if err := rows.Scan(&lid, &ing, &linked); err != nil {
			rows.Close()
			return nil, err
		}
		existing[lid] = old{ing, linked.Int64}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	bases := map[int64]bool{}
	brows, err := tx.QueryContext(ctx, `SELECT base_ingredient_id FROM recipes WHERE base_ingredient_id IS NOT NULL`)
	if err != nil {
		return nil, err
	}
	for brows.Next() {
		var ing int64
		if err := brows.Scan(&ing); err != nil {
			brows.Close()
			return nil, err
		}
		bases[ing] = true
	}
	brows.Close()
	if err := brows.Err(); err != nil {
		return nil, err
	}
	out := append([]recipe.Line(nil), in...)
	for i := range out {
		l := &out[i]
		prev, matched := existing[l.ID]
		if l.ID != 0 && !matched {
			l.ID = 0
		}
		if !bases[l.IngredientID] {
			l.LinkedFromIngredientID = 0
			continue
		}
		if l.LinkedFromIngredientID == 0 && matched {
			if bases[prev.ingredient] {
				l.LinkedFromIngredientID = prev.linked
			} else {
				l.LinkedFromIngredientID = prev.ingredient
			}
		}
		if l.LinkedFromIngredientID == l.IngredientID {
			l.LinkedFromIngredientID = 0
		}
	}
	return out, nil
}

// DropUnreferenced removes the stored photos in ids that no Recipe or Step uses
// any more (best-effort, see dropUnreferenced).
func (s *Store) DropUnreferenced(ctx context.Context, ids []string) {
	s.dropUnreferenced(ctx, ids)
}

// ListFilter selects Recipes. Archived: "" or "no" = active only, "yes" = archived only, "all".
type ListFilter struct {
	// Kind: "" or "plannable" = plannable Recipes only (the default), "base" = Base recipes only, "all" = both.
	Kind     string
	Archived string
	Tag      string // TagKey match; "" = any
	Query    string // case-insensitive substring of the name; "" = any
	// CourseID keeps Recipes marked with the Course, NotCourseID those not marked with it (0 = any); the
	// Couldn't plan fix uses the second.
	CourseID    int64
	NotCourseID int64
	// For (round 2): the Recipe a line is being added to. With Kind "base" each Summary's WouldCycle says whether
	// a line of For calling for that Base recipe would make a cycle (one catalog load plus baserecipe.FindCycle).
	For int64
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
	switch f.Kind {
	case "base":
		where = append(where, "r.base_ingredient_id IS NOT NULL")
	case "all":
	default: // "" and "plannable": a Base recipe is never planned, so it is hidden by default
		where = append(where, "r.base_ingredient_id IS NULL")
	}
	if f.Tag != "" {
		where = append(where, `EXISTS (SELECT 1 FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id
		        WHERE rt.recipe_id = r.id AND t.key = ?)`)
		args = append(args, recipe.TagKey(f.Tag))
	}
	if f.CourseID != 0 {
		where = append(where, `EXISTS (SELECT 1 FROM recipe_courses rc WHERE rc.recipe_id = r.id AND rc.course_id = ?)`)
		args = append(args, f.CourseID)
	}
	if f.NotCourseID != 0 {
		where = append(where, `NOT EXISTS (SELECT 1 FROM recipe_courses rc WHERE rc.recipe_id = r.id AND rc.course_id = ?)`)
		args = append(args, f.NotCourseID)
	}
	q := `SELECT r.id, r.name, r.yield, r.ready_meal, r.image, r.archived, r.total_minutes, r.advance_minutes, r.reheat_minutes, r.whole_meal,
	        r.base_ingredient_id, r.yield_unit,
	        (SELECT count(DISTINCT rl.recipe_id) FROM recipe_lines rl WHERE rl.ingredient_id = r.base_ingredient_id) FROM recipes r`
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
		var ready, archived, whole, used int64
		var reheat, baseIng sql.NullInt64
		var yieldUnit sql.NullString
		if err := rows.Scan(&sum.ID, &sum.Name, &sum.Yield, &ready, &sum.Image, &archived, &sum.TotalMinutes, &sum.AdvanceMinutes, &reheat, &whole,
			&baseIng, &yieldUnit, &used); err != nil {
			return nil, err
		}
		sum.ReheatMinutes = int(reheat.Int64)
		sum.WholeMeal = whole == 1
		sum.BaseRecipe = baseIng.Valid
		sum.BaseIngredientID = baseIng.Int64
		sum.YieldUnit = yieldUnit.String
		sum.UsedByCount = int(used)
		sum.CourseIDs = []int64{}
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
	if f.For != 0 && (f.Kind == "base" || f.Kind == "all") {
		if err := s.markWouldCycle(ctx, out, f.For); err != nil {
			return nil, err
		}
	}
	if len(out) == 0 {
		return out, nil
	}
	tags, err := s.allRecipeTags(ctx)
	if err != nil {
		return nil, err
	}
	courses, err := s.allRecipeCourses(ctx)
	if err != nil {
		return nil, err
	}
	for i := range out {
		if t, ok := tags[out[i].ID]; ok {
			out[i].Tags = t
		}
		if c, ok := courses[out[i].ID]; ok {
			out[i].CourseIDs = c
		}
	}
	return out, nil
}

// allRecipeCourses maps every Recipe to its Course ids in household order.
func (s *Store) allRecipeCourses(ctx context.Context) (map[int64][]int64, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT rc.recipe_id, rc.course_id FROM recipe_courses rc
	        JOIN courses c ON c.id = rc.course_id ORDER BY rc.recipe_id, c.position, c.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64][]int64{}
	for rows.Next() {
		var recipeID, courseID int64
		if err := rows.Scan(&recipeID, &courseID); err != nil {
			return nil, err
		}
		out[recipeID] = append(out[recipeID], courseID)
	}
	return out, rows.Err()
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
	var baseIng sql.NullInt64
	if err := tx.QueryRowContext(ctx, `SELECT base_ingredient_id FROM recipes WHERE id = ?`, id).Scan(&baseIng); err != nil {
		return err
	}
	if baseIng.Valid {
		used, err := usedBy(ctx, tx, baseIng.Int64)
		if err != nil {
			return err
		}
		if len(used) > 0 {
			return &recipe.InUseError{UsedBy: refsOf(used)}
		}
	}
	before, err := recipeImages(ctx, tx, id)
	if err != nil {
		return err
	}
	// Lines, Steps, uses, Tag links and preferences go with the Recipe (ON DELETE CASCADE).
	if _, err := tx.ExecContext(ctx, `DELETE FROM recipes WHERE id = ?`, id); err != nil {
		return err
	}
	if baseIng.Valid && s.ings != nil {
		// The Base recipe's Ingredient stays as an ordinary one (with its Stock) unless nothing holds it: it takes its
		// plain key back here; a plain Ingredient holding the name keeps the key of the Base recipe (ErrNameTaken).
		if err := s.releaseDeleted(ctx, tx, baseIng.Int64); err != nil {
			return err
		}
		for _, k := range []string{"batch", "portion"} {
			if err := s.ings.RemoveConversionTx(ctx, tx, baseIng.Int64, k); err != nil {
				return err
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	if baseIng.Valid && s.ings != nil {
		_ = s.ings.Delete(ctx, baseIng.Int64) // in use (Stock, Products, lines): it stays as an ordinary Ingredient
	}
	s.dropUnreferenced(ctx, before)
	return nil
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
	ing, err := baseIngredientOf(ctx, s.db, recipeID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if err == nil {
		// A Base recipe has only an Exclusion (P2), stored as the Exclusion of its Ingredient (§8).
		switch st {
		case recipe.StateFavourite, recipe.StateDislike:
			return &recipe.ValidationError{Field: "state", Code: recipe.CodeBasePreference, Message: "a Base recipe has only an Exclusion"}
		case recipe.StateExclusion:
			_, err := s.db.ExecContext(ctx, `INSERT OR IGNORE INTO member_ingredient_exclusions (member_id, ingredient_id) VALUES (?,?)`, memberID, ing)
			return err
		case recipe.StateNone:
			if _, err := s.db.ExecContext(ctx, `DELETE FROM member_ingredient_exclusions WHERE member_id = ? AND ingredient_id = ?`, memberID, ing); err != nil {
				return err
			}
		}
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
	bases, err := s.db.QueryContext(ctx, `SELECT r.id FROM recipes r JOIN member_ingredient_exclusions e ON e.ingredient_id = r.base_ingredient_id
		WHERE e.member_id = ?`, memberID)
	if err != nil {
		return Preferences{}, err
	}
	for bases.Next() {
		var id int64
		if err := bases.Scan(&id); err != nil {
			bases.Close()
			return Preferences{}, err
		}
		out.Recipes[id] = recipe.StateExclusion
	}
	bases.Close()
	if err := bases.Err(); err != nil {
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
	clean.TakeOver = in.TakeOver
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
			_ = s.images.Delete(ctx, id)
		}
	}
}

func (s *Store) now() string { return s.clk.Now().UTC().Format(time.RFC3339) }

// writeContent stores Tags, lines, Steps and their uses for the Recipe id.
func writeContent(ctx context.Context, tx *sql.Tx, id int64, in recipe.Input) error {
	for pos, name := range in.Tags {
		tagID, err := tagstore.EnsureTx(ctx, tx, name)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO recipe_tags (recipe_id, tag_id, position) VALUES (?,?,?)`, id, tagID, pos); err != nil {
			return err
		}
	}
	for pos, l := range in.Lines {
		var linked any
		if l.LinkedFromIngredientID != 0 {
			linked = l.LinkedFromIngredientID
		}
		if l.ID != 0 {
			if _, err := tx.ExecContext(ctx, `INSERT INTO recipe_lines (id, recipe_id, position, ingredient_id, quantity, unit, optional, note, needed_at_step, linked_from_ingredient_id)
			        VALUES (?,?,?,?,?,?,?,?,?,?)`, l.ID, id, pos, l.IngredientID, l.Quantity, l.Unit, boolInt(l.Optional), l.Note, nullInt(l.NeededAtStep), linked); err != nil {
				return err
			}
			continue
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO recipe_lines (recipe_id, position, ingredient_id, quantity, unit, optional, note, needed_at_step, linked_from_ingredient_id)
		        VALUES (?,?,?,?,?,?,?,?,?)`, id, pos, l.IngredientID, l.Quantity, l.Unit, boolInt(l.Optional), l.Note, nullInt(l.NeededAtStep), linked); err != nil {
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

// getRecipe loads a Recipe with its Tags, lines, Steps and timing.

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

// mainCourse is the id of the main Course.
func mainCourse(ctx context.Context, q Querier) (int64, error) {
	var id int64
	err := q.QueryRowContext(ctx, `SELECT id FROM courses WHERE is_main = 1`).Scan(&id)
	return id, err
}

// writeCourses stores the Recipe's Course links (the caller removed the old ones).
func writeCourses(ctx context.Context, tx *sql.Tx, id int64, ids []int64) error {
	for _, c := range ids {
		if _, err := tx.ExecContext(ctx, `INSERT INTO recipe_courses (recipe_id, course_id) VALUES (?, ?)`, id, c); err != nil {
			return err
		}
	}
	return nil
}

// loadCourses returns the Recipe's Courses in household order.
func loadCourses(ctx context.Context, q Querier, id int64) ([]recipe.CourseRef, error) {
	rows, err := q.QueryContext(ctx, `SELECT c.id, c.name FROM recipe_courses rc JOIN courses c ON c.id = rc.course_id
	        WHERE rc.recipe_id = ? ORDER BY c.position, c.id`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []recipe.CourseRef{}
	for rows.Next() {
		var c recipe.CourseRef
		if err := rows.Scan(&c.ID, &c.Name); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func courseIDs(refs []recipe.CourseRef) []int64 {
	out := make([]int64, 0, len(refs))
	for _, r := range refs {
		out = append(out, r.ID)
	}
	return out
}

// dropLostCourses removes what a Recipe no longer has a reason to be in once it loses the Courses lost:
// its Slot Rules by Recipe on them, and its unpinned, unresolved, unbought Planned Meals from today on in them.
// Pinned, Bought, Cooked, Not cooked and past Planned Meals stay, as do other Recipes' and Tag rules.
func (s *Store) dropLostCourses(ctx context.Context, tx *sql.Tx, id int64, lost []int64) error {
	today, err := s.householdToday(ctx, tx)
	if err != nil {
		return err
	}
	for _, c := range lost {
		if _, err := tx.ExecContext(ctx, `DELETE FROM slot_rules WHERE recipe_id = ? AND course_id = ?`, id, c); err != nil {
			return err
		}
		// A Bought Planned Meal stays (B5-BO, ADR 0013): the plan shows it with the course_lost warning.
		if _, err := tx.ExecContext(ctx, `DELETE FROM planned_meals WHERE recipe_id = ? AND course_id = ?
		        AND state = 'planned' AND pinned = 0 AND date >= ?
		        AND NOT EXISTS (SELECT 1 FROM planned_meal_bought b WHERE b.planned_meal_id = planned_meals.id)`, id, c, today); err != nil {
			return err
		}
	}
	return nil
}

// householdToday is the date (YYYY-MM-DD) of the clock's now in the Household's time zone.
func (s *Store) householdToday(ctx context.Context, q Querier) (string, error) {
	return clock.HouseholdToday(ctx, q, s.clk)
}

// markWouldCycle sets WouldCycle on each Base recipe summary: a line of the Recipe forID calling for it would make a
// cycle, that is, the Base recipe reaches forID through the "calls for" graph. One catalog load, one FindCycle each
// (round 2). A virtual edge forID -> base stands for the new line.
func (s *Store) markWouldCycle(ctx context.Context, out []recipe.Summary, forID int64) error {
	cat, err := loadCatalog(ctx, s.db)
	if err != nil {
		return err
	}
	graph := cat.graph()
	for i := range out {
		if !out[i].BaseRecipe {
			continue
		}
		edges := make(map[int64][]int64, len(graph)+1)
		for k, v := range graph {
			edges[k] = v
		}
		edges[forID] = append(append([]int64(nil), graph[forID]...), out[i].ID)
		out[i].WouldCycle = baserecipe.FindCycle(edges, cat.names, forID) != nil
	}
	return nil
}
