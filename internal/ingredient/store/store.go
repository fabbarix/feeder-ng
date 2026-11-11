// Package store is the SQL repository for Ingredients, plus the registry through
// which other features' stores move their Ingredient references on merge.
package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/units"
)

var (
	ErrNotFound  = errors.New("ingredient not found")
	ErrNameTaken = errors.New("an Ingredient with that name already exists")
	// ErrInUse: delete, Base Unit change, or removing a Unit Conversion that other features still reference.
	ErrInUse = errors.New("ingredient is in use")
	// ErrMergeSelf: merging an Ingredient into itself.
	ErrMergeSelf = errors.New("cannot merge an Ingredient into itself")
)

// Store reads and writes Ingredients. Methods return ingredient.ErrInvalid-matching
// *ingredient.ValidationError for bad input.
type Store struct {
	db     *sql.DB
	clk    clock.Clock
	movers *Movers
	images Images
}

// Images is the part of the image store the Ingredient Store needs (IM2): the same shape as recipe/store.Images.
// Without WithImages, image ids are not checked and replaced pictures are not removed.
type Images interface {
	Exists(id string) bool
	Delete(ctx context.Context, id string) error
}

// WithImages makes the Store refuse a picture that was never uploaded (a *ingredient.ValidationError on field "image")
// and delete the file of a picture that no Ingredient uses any more after a change (IM2 design note).
func WithImages(im Images) Option { return func(s *Store) { s.images = im } }

// Option configures New.
type Option func(*Store)

// WithMovers makes the Store use r instead of the default registry (tests).
func WithMovers(r *Movers) Option { return func(s *Store) { s.movers = r } }

// New returns a Store over db. Timestamps come from clk (created_at, updated_at; RFC 3339 UTC).
func New(db *sql.DB, clk clock.Clock, opts ...Option) *Store {
	s := &Store{db: db, clk: clk, movers: DefaultMovers}
	for _, o := range opts {
		o(s)
	}
	return s
}

// Patch is a partial update. nil = leave unchanged. ShelfLife: nil = unchanged,
// &nil = clear it, &&n = set it (see ShelfLifePatch).
type Patch struct {
	Name      *string
	Base      *units.Base
	ShelfLife *ShelfLifePatch
	// Image: nil = unchanged, &"" = remove the picture, &id = set it (IM2).
	Image *string
}

// ShelfLifePatch distinguishes "set to n" (Days != nil) from "clear" (Days == nil).
type ShelfLifePatch struct{ Days *int }

// Create validates in and inserts. ErrNameTaken when the normalised name exists.
func (s *Store) Create(ctx context.Context, in ingredient.Input) (ingredient.Ingredient, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return ingredient.Ingredient{}, err
	}
	defer tx.Rollback()

	created, err := s.CreateTx(ctx, tx, in)
	if err != nil {
		return ingredient.Ingredient{}, err
	}
	if err := tx.Commit(); err != nil {
		return ingredient.Ingredient{}, err
	}
	return s.Get(ctx, created.ID)
}

// CreateTx is Create inside the caller's transaction (nothing is committed here).
// The returned Ingredient is read back inside tx.
func (s *Store) CreateTx(ctx context.Context, tx *sql.Tx, in ingredient.Input) (ingredient.Ingredient, error) {
	clean, err := in.Validate()
	if err != nil {
		return ingredient.Ingredient{}, err
	}
	if err := checkNameFree(ctx, tx, units.NormalizeName(clean.Name), 0); err != nil {
		return ingredient.Ingredient{}, err
	}
	if err := s.checkImage(clean.Image); err != nil {
		return ingredient.Ingredient{}, err
	}
	now := s.now()
	res, err := tx.ExecContext(ctx,
		`INSERT INTO ingredients (name, name_key, base_unit, shelf_life_days, image, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		clean.Name, units.NormalizeName(clean.Name), string(clean.Base), nullDays(clean.ShelfLifeDays), clean.Image, now, now)
	if err != nil {
		return ingredient.Ingredient{}, mapNameErr(err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return ingredient.Ingredient{}, err
	}
	if err := insertConversions(ctx, tx, id, clean.Conversions); err != nil {
		return ingredient.Ingredient{}, err
	}
	return loadOne(ctx, tx, id)
}

// Get returns the Ingredient with its Conversions, or ErrNotFound.
func (s *Store) Get(ctx context.Context, id int64) (ingredient.Ingredient, error) {
	return loadOne(ctx, s.db, id)
}

// ByName finds by normalised name; ErrNotFound if none.
func (s *Store) ByName(ctx context.Context, name string) (ingredient.Ingredient, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id FROM ingredients WHERE name_key = ?`, units.NormalizeName(name))
	var id int64
	if err := row.Scan(&id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ingredient.Ingredient{}, ErrNotFound
		}
		return ingredient.Ingredient{}, err
	}
	return loadOne(ctx, s.db, id)
}

// List returns all Ingredients ordered by normalised name, with Conversions.
func (s *Store) List(ctx context.Context) ([]ingredient.Ingredient, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, base_unit, shelf_life_days, image FROM ingredients ORDER BY name_key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ingredient.Ingredient
	index := map[int64]int{}
	for rows.Next() {
		i, err := scanIngredient(rows)
		if err != nil {
			return nil, err
		}
		index[i.ID] = len(out)
		out = append(out, i)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	crows, err := s.db.QueryContext(ctx, `SELECT ingredient_id, unit, to_base FROM ingredient_conversions ORDER BY ingredient_id, unit`)
	if err != nil {
		return nil, err
	}
	defer crows.Close()
	for crows.Next() {
		var id int64
		var c units.Conversion
		if err := crows.Scan(&id, &c.Unit, &c.ToBase); err != nil {
			return nil, err
		}
		if k, ok := index[id]; ok {
			out[k].Conversions = append(out[k].Conversions, c)
		}
	}
	return out, crows.Err()
}

// Search runs ingredient.Search over every Ingredient and resolves the hits to full Ingredients.
func (s *Store) Search(ctx context.Context, query string, limit int) (SearchResult, error) {
	all, err := s.List(ctx)
	if err != nil {
		return SearchResult{}, err
	}
	byID := make(map[int64]ingredient.Ingredient, len(all))
	cands := make([]ingredient.Candidate, 0, len(all))
	for _, i := range all {
		byID[i.ID] = i
		cands = append(cands, ingredient.Candidate{ID: i.ID, Name: i.Name})
	}
	r := ingredient.Search(query, cands, limit)
	var out SearchResult
	if r.Exact != nil {
		e := byID[r.Exact.ID]
		out.Exact = &e
	}
	for _, sg := range r.Suggestions {
		out.Suggestions = append(out.Suggestions, Suggested{Ingredient: byID[sg.ID], Score: sg.Score})
	}
	return out, nil
}

// SearchResult is ingredient.Result with the full Ingredients.
type SearchResult struct {
	Exact       *ingredient.Ingredient
	Suggestions []Suggested
}

// Suggested is a fuzzy hit.
type Suggested struct {
	Ingredient ingredient.Ingredient
	Score      float64
}

// Update applies p. Rename keeps the id (so all references stay). ErrNameTaken if the
// new name collides with another Ingredient; renaming to a different spelling of its
// own name (case, spacing) is fine. Changing the Base Unit while References > 0 is ErrInUse.
// Setting a Base Unit equal to an existing conversion's unit is invalid.
func (s *Store) Update(ctx context.Context, id int64, p Patch) (ingredient.Ingredient, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return ingredient.Ingredient{}, err
	}
	defer tx.Rollback()

	cur, err := loadOne(ctx, tx, id)
	if err != nil {
		return ingredient.Ingredient{}, err
	}
	in := ingredient.Input{Name: cur.Name, Base: cur.Base, ShelfLifeDays: cur.ShelfLifeDays, Conversions: cur.Conversions, Image: cur.Image}
	if p.Name != nil {
		in.Name = *p.Name
	}
	if p.Base != nil {
		in.Base = *p.Base
	}
	if p.ShelfLife != nil {
		in.ShelfLifeDays = p.ShelfLife.Days
	}
	if p.Image != nil {
		in.Image = *p.Image
	}
	clean, err := in.Validate()
	if err != nil {
		return ingredient.Ingredient{}, err
	}
	if clean.Image != cur.Image {
		if err := s.checkImage(clean.Image); err != nil {
			return ingredient.Ingredient{}, err
		}
	}
	if clean.Base != cur.Base {
		refs, err := s.refCounts(ctx, tx, id)
		if err != nil {
			return ingredient.Ingredient{}, err
		}
		if total(refs) > 0 {
			return ingredient.Ingredient{}, ErrInUse
		}
	}
	key := units.NormalizeName(clean.Name)
	if err := checkNameFree(ctx, tx, key, id); err != nil {
		return ingredient.Ingredient{}, err
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE ingredients SET name = ?, name_key = ?, base_unit = ?, shelf_life_days = ?, image = ?, updated_at = ? WHERE id = ?`,
		clean.Name, key, string(clean.Base), nullDays(clean.ShelfLifeDays), clean.Image, s.now(), id); err != nil {
		return ingredient.Ingredient{}, mapNameErr(err)
	}
	if err := tx.Commit(); err != nil {
		return ingredient.Ingredient{}, err
	}
	s.dropUnreferenced(ctx, cur.Image)
	return s.Get(ctx, id)
}

// SetConversion adds or replaces the Unit Conversion for unit (validated as in Input).
func (s *Store) SetConversion(ctx context.Context, id int64, c units.Conversion) (ingredient.Ingredient, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return ingredient.Ingredient{}, err
	}
	defer tx.Rollback()

	if _, err := s.SetConversionTx(ctx, tx, id, c); err != nil {
		return ingredient.Ingredient{}, err
	}
	if err := tx.Commit(); err != nil {
		return ingredient.Ingredient{}, err
	}
	return s.Get(ctx, id)
}

// SetConversionTx is SetConversion inside the caller's transaction (nothing is committed here).
func (s *Store) SetConversionTx(ctx context.Context, tx *sql.Tx, id int64, c units.Conversion) (ingredient.Ingredient, error) {
	cur, err := loadOne(ctx, tx, id)
	if err != nil {
		return ingredient.Ingredient{}, err
	}
	want := units.NormalizeUnit(c.Unit)
	list := []units.Conversion{c}
	for _, old := range cur.Conversions {
		if old.Unit != want {
			list = append(list, old)
		}
	}
	clean, err := ingredient.Input{Name: cur.Name, Base: cur.Base, ShelfLifeDays: cur.ShelfLifeDays, Conversions: list}.Validate()
	if err != nil {
		return ingredient.Ingredient{}, err
	}
	var upsert units.Conversion
	for _, v := range clean.Conversions {
		if v.Unit == want {
			upsert = v
		}
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO ingredient_conversions (ingredient_id, unit, to_base) VALUES (?, ?, ?)
		 ON CONFLICT (ingredient_id, unit) DO UPDATE SET to_base = excluded.to_base`,
		id, upsert.Unit, upsert.ToBase); err != nil {
		return ingredient.Ingredient{}, err
	}
	if err := touch(ctx, tx, id, s.now()); err != nil {
		return ingredient.Ingredient{}, err
	}
	return loadOne(ctx, tx, id)
}

// AddConversionTx adds the Unit Conversion c to the Ingredient inside the
// caller's transaction, only when it has no Conversion for that unit yet. An
// existing Conversion is never overwritten: added is false and nothing changes.
func (s *Store) AddConversionTx(ctx context.Context, tx *sql.Tx, id int64, c units.Conversion) (added bool, err error) {
	cur, err := loadOne(ctx, tx, id)
	if err != nil {
		return false, err
	}
	want := units.NormalizeUnit(c.Unit)
	for _, old := range cur.Conversions {
		if old.Unit == want {
			return false, nil
		}
	}
	clean, err := ingredient.Input{Name: cur.Name, Base: cur.Base, ShelfLifeDays: cur.ShelfLifeDays, Conversions: []units.Conversion{c}}.Validate()
	if err != nil {
		return false, err
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO ingredient_conversions (ingredient_id, unit, to_base) VALUES (?, ?, ?)`,
		id, clean.Conversions[0].Unit, clean.Conversions[0].ToBase); err != nil {
		return false, err
	}
	if err := touch(ctx, tx, id, s.now()); err != nil {
		return false, err
	}
	return true, nil
}

// GetTx returns the Ingredient read inside the caller's transaction.
func (s *Store) GetTx(ctx context.Context, tx *sql.Tx, id int64) (ingredient.Ingredient, error) {
	return loadOne(ctx, tx, id)
}

// RemoveConversion removes it (idempotent when absent). ErrInUse when any registered
// UnitGuard says the unit is still used by that Ingredient.
func (s *Store) RemoveConversion(ctx context.Context, id int64, unit string) (ingredient.Ingredient, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return ingredient.Ingredient{}, err
	}
	defer tx.Rollback()

	cur, err := loadOne(ctx, tx, id)
	if err != nil {
		return ingredient.Ingredient{}, err
	}
	want := units.NormalizeUnit(unit)
	present := false
	for _, c := range cur.Conversions {
		present = present || c.Unit == want
	}
	if !present {
		return cur, nil
	}
	for _, m := range s.movers.All() {
		g, ok := m.(UnitGuard)
		if !ok {
			continue
		}
		used, err := g.UnitInUse(ctx, tx, id, want)
		if err != nil {
			return ingredient.Ingredient{}, err
		}
		if used {
			return ingredient.Ingredient{}, ErrInUse
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM ingredient_conversions WHERE ingredient_id = ? AND unit = ?`, id, want); err != nil {
		return ingredient.Ingredient{}, err
	}
	if err := touch(ctx, tx, id, s.now()); err != nil {
		return ingredient.Ingredient{}, err
	}
	if err := tx.Commit(); err != nil {
		return ingredient.Ingredient{}, err
	}
	return s.Get(ctx, id)
}

// Delete removes an unreferenced Ingredient (ErrInUse when References > 0).
func (s *Store) Delete(ctx context.Context, id int64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	cur, err := loadOne(ctx, tx, id)
	if err != nil {
		return err
	}
	refs, err := s.refCounts(ctx, tx, id)
	if err != nil {
		return err
	}
	if total(refs) > 0 {
		return ErrInUse
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM ingredients WHERE id = ?`, id); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.dropUnreferenced(ctx, cur.Image)
	return nil
}

// References returns per-mover reference counts (mover name -> count, only counts > 0).
func (s *Store) References(ctx context.Context, id int64) (map[string]int, error) {
	return s.refCounts(ctx, s.db, id)
}

// MergePreview compares source and target without changing anything.
// ErrNotFound if either is missing; ErrMergeSelf if the ids are equal.
func (s *Store) MergePreview(ctx context.Context, sourceID, targetID int64) (Preview, error) {
	if sourceID == targetID {
		return Preview{}, ErrMergeSelf
	}
	src, err := loadOne(ctx, s.db, sourceID)
	if err != nil {
		return Preview{}, err
	}
	tgt, err := loadOne(ctx, s.db, targetID)
	if err != nil {
		return Preview{}, err
	}
	srcRefs, err := s.refCounts(ctx, s.db, sourceID)
	if err != nil {
		return Preview{}, err
	}
	tgtRefs, err := s.refCounts(ctx, s.db, targetID)
	if err != nil {
		return Preview{}, err
	}
	return Preview{
		Source:           src,
		Target:           tgt,
		Plan:             ingredient.PlanMerge(src, tgt),
		SourceReferences: srcRefs,
		TargetReferences: tgtRefs,
	}, nil
}

// Preview is what the merge screen shows.
type Preview struct {
	Source, Target   ingredient.Ingredient
	Plan             ingredient.MergePlan
	SourceReferences map[string]int
	TargetReferences map[string]int
}

// Merge moves everything from source to target in ONE transaction: it applies the
// plan (ingredient.ErrBaseMismatch / *ingredient.UnresolvedError leave nothing changed),
// writes the combined Conversions and Shelf Life onto the target, calls every registered
// ReferenceMover.Move(from=source, to=target), then deletes the source. If any mover fails
// the whole merge is rolled back. The target keeps its name and id.
func (s *Store) Merge(ctx context.Context, sourceID, targetID int64, res ingredient.Resolution) (ingredient.Ingredient, error) {
	if sourceID == targetID {
		return ingredient.Ingredient{}, ErrMergeSelf
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return ingredient.Ingredient{}, err
	}
	defer tx.Rollback()

	src, err := loadOne(ctx, tx, sourceID)
	if err != nil {
		return ingredient.Ingredient{}, err
	}
	tgt, err := loadOne(ctx, tx, targetID)
	if err != nil {
		return ingredient.Ingredient{}, err
	}
	merged, err := ingredient.PlanMerge(src, tgt).Apply(res)
	if err != nil {
		return ingredient.Ingredient{}, err
	}
	// The target keeps its own picture; without one it adopts the source's.
	image, dropped := tgt.Image, src.Image
	if image == "" {
		image, dropped = src.Image, ""
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE ingredients SET shelf_life_days = ?, image = ?, updated_at = ? WHERE id = ?`,
		nullDays(merged.ShelfLifeDays), image, s.now(), targetID); err != nil {
		return ingredient.Ingredient{}, err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM ingredient_conversions WHERE ingredient_id = ?`, targetID); err != nil {
		return ingredient.Ingredient{}, err
	}
	if err := insertConversions(ctx, tx, targetID, merged.Conversions); err != nil {
		return ingredient.Ingredient{}, err
	}
	for _, m := range s.movers.All() {
		if err := m.Move(ctx, tx, sourceID, targetID); err != nil {
			return ingredient.Ingredient{}, err
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM ingredients WHERE id = ?`, sourceID); err != nil {
		return ingredient.Ingredient{}, err
	}
	if err := tx.Commit(); err != nil {
		return ingredient.Ingredient{}, err
	}
	s.dropUnreferenced(ctx, dropped)
	return s.Get(ctx, targetID)
}

// refCounts asks every registered mover how many rows reference the Ingredient.
func (s *Store) refCounts(ctx context.Context, q Querier, id int64) (map[string]int, error) {
	out := map[string]int{}
	for _, m := range s.movers.All() {
		n, err := m.Count(ctx, q, id)
		if err != nil {
			return nil, err
		}
		if n > 0 {
			out[m.Name()] = n
		}
	}
	return out, nil
}

// checkImage refuses a picture id that was never uploaded (only when WithImages was given).
func (s *Store) checkImage(id string) error {
	if id == "" || s.images == nil || s.images.Exists(id) {
		return nil
	}
	return &ingredient.ValidationError{Field: "image", Message: "The picture was not uploaded"}
}

// dropUnreferenced deletes the file of a picture no Ingredient uses any more (best effort, after the commit).
func (s *Store) dropUnreferenced(ctx context.Context, id string) {
	if id == "" || s.images == nil {
		return
	}
	var n int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ingredients WHERE image = ?`, id).Scan(&n); err != nil || n > 0 {
		return
	}
	_ = s.images.Delete(ctx, id)
}

func (s *Store) now() string { return s.clk.Now().UTC().Format(time.RFC3339) }

func total(refs map[string]int) int {
	n := 0
	for _, c := range refs {
		n += c
	}
	return n
}

// checkNameFree returns ErrNameTaken when another Ingredient (not id self) has the key.
func checkNameFree(ctx context.Context, q Querier, key string, self int64) error {
	var other int64
	err := q.QueryRowContext(ctx, `SELECT id FROM ingredients WHERE name_key = ?`, key).Scan(&other)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && other == self) {
		return nil
	}
	if err != nil {
		return err
	}
	return ErrNameTaken
}

// mapNameErr turns a UNIQUE violation on the name key into ErrNameTaken.
func mapNameErr(err error) error {
	if strings.Contains(err.Error(), "ingredients.name_key") {
		return ErrNameTaken
	}
	return err
}

func touch(ctx context.Context, tx *sql.Tx, id int64, now string) error {
	_, err := tx.ExecContext(ctx, `UPDATE ingredients SET updated_at = ? WHERE id = ?`, now, id)
	return err
}

func insertConversions(ctx context.Context, tx *sql.Tx, id int64, cs []units.Conversion) error {
	for _, c := range cs {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO ingredient_conversions (ingredient_id, unit, to_base) VALUES (?, ?, ?)`, id, c.Unit, c.ToBase); err != nil {
			return err
		}
	}
	return nil
}

func nullDays(d *int) sql.NullInt64 {
	if d == nil {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: int64(*d), Valid: true}
}

// rowScanner is satisfied by *sql.Row and *sql.Rows.
type rowScanner interface{ Scan(dest ...any) error }

func scanIngredient(r rowScanner) (ingredient.Ingredient, error) {
	var (
		i    ingredient.Ingredient
		base string
		days sql.NullInt64
	)
	if err := r.Scan(&i.ID, &i.Name, &base, &days, &i.Image); err != nil {
		return ingredient.Ingredient{}, err
	}
	i.Base = units.Base(base)
	if days.Valid {
		d := int(days.Int64)
		i.ShelfLifeDays = &d
	}
	return i, nil
}

// loadOne reads one Ingredient with its Conversions, or ErrNotFound.
func loadOne(ctx context.Context, q Querier, id int64) (ingredient.Ingredient, error) {
	row := q.QueryRowContext(ctx, `SELECT id, name, base_unit, shelf_life_days, image FROM ingredients WHERE id = ?`, id)
	i, err := scanIngredient(row)
	if errors.Is(err, sql.ErrNoRows) {
		return ingredient.Ingredient{}, ErrNotFound
	}
	if err != nil {
		return ingredient.Ingredient{}, err
	}
	rows, err := q.QueryContext(ctx, `SELECT unit, to_base FROM ingredient_conversions WHERE ingredient_id = ? ORDER BY unit`, id)
	if err != nil {
		return ingredient.Ingredient{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var c units.Conversion
		if err := rows.Scan(&c.Unit, &c.ToBase); err != nil {
			return ingredient.Ingredient{}, err
		}
		i.Conversions = append(i.Conversions, c)
	}
	return i, rows.Err()
}
