// Package store is the SQLite repository for Tags (migration 1440_tags.sql). It enforces the
// rules of internal/tag and does every Rename, Merge and Delete in one transaction, rewriting
// Slot Rules and Variety Rules by key (ADR 0010 points 3 to 6). It writes slot_rules and
// variety_rules only in those three cases and does not import internal/plan/store or
// internal/recipe.
package store

import (
	"context"
	"database/sql"
	"errors"

	"github.com/fabbarix/feeder-ng/internal/tag"
)

// Store is the Tag repository.
type Store struct{ db *sql.DB }

// New returns a Store over an open, migrated database.
func New(d *sql.DB) *Store { return &Store{db: d} }

// Result is what a write returns: the Tag as it is now (zero after Merge and Delete) and
// whether a Slot Rule or Variety Rule moved or was removed, which the API turns into
// plan.invalidate rules_changed.
type Result struct {
	Tag          tag.Tag
	RulesChanged bool
}

// querier is the part of *sql.DB and *sql.Tx the repository uses.
type querier interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

const tagCols = `id, key, name, colour`

func scanTag(row *sql.Row) (tag.Tag, error) {
	var t tag.Tag
	err := row.Scan(&t.ID, &t.Key, &t.Name, &t.Colour)
	return t, err
}

// getTag loads one Tag; tag.ErrNotFound when there is none.
func getTag(ctx context.Context, q querier, id int64) (tag.Tag, error) {
	t, err := scanTag(q.QueryRowContext(ctx, `SELECT `+tagCols+` FROM tags WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return tag.Tag{}, tag.ErrNotFound
	}
	return t, err
}

// tagByKey returns the Tag with the key; found is false when no Tag has it.
func tagByKey(ctx context.Context, q querier, key string) (t tag.Tag, found bool, err error) {
	t, err = scanTag(q.QueryRowContext(ctx, `SELECT `+tagCols+` FROM tags WHERE key = ?`, key))
	if errors.Is(err, sql.ErrNoRows) {
		return tag.Tag{}, false, nil
	}
	return t, err == nil, err
}

// colourCounts counts the Tags per colour id.
func colourCounts(ctx context.Context, q querier) (map[string]int, error) {
	rows, err := q.QueryContext(ctx, `SELECT colour, count(*) FROM tags GROUP BY colour`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var c string
		var n int
		if err := rows.Scan(&c, &n); err != nil {
			return nil, err
		}
		out[c] = n
	}
	return out, rows.Err()
}

// ruleSet reads the rules that name a key, by key (no Tag row needed).
func ruleSet(ctx context.Context, q querier, key string) (tag.RuleSet, error) {
	var rs tag.RuleSet
	rows, err := q.QueryContext(ctx, `SELECT meal_slot_id, course_id FROM slot_rules WHERE tag = ? ORDER BY id`, key)
	if err != nil {
		return rs, err
	}
	for rows.Next() {
		var s tag.Slot
		if err := rows.Scan(&s.MealSlotID, &s.CourseID); err != nil {
			rows.Close()
			return rs, err
		}
		rs.Slots = append(rs.Slots, s)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return rs, err
	}
	rows.Close()
	var n int
	if err := q.QueryRowContext(ctx, `SELECT count(*) FROM variety_rules WHERE tag = ?`, key).Scan(&n); err != nil {
		return rs, err
	}
	rs.Variety = n > 0
	return rs, nil
}

// applyRules moves the rules on from to the key to, as out says. It reports whether any rule
// moved or was removed.
func applyRules(ctx context.Context, q querier, from, to string, out tag.MergeOutcome) (bool, error) {
	for _, s := range out.DropSlots {
		if _, err := q.ExecContext(ctx, `DELETE FROM slot_rules WHERE tag = ? AND meal_slot_id = ? AND course_id = ?`,
			from, s.MealSlotID, s.CourseID); err != nil {
			return false, err
		}
	}
	for _, s := range out.MoveSlots {
		if _, err := q.ExecContext(ctx, `UPDATE slot_rules SET tag = ? WHERE tag = ? AND meal_slot_id = ? AND course_id = ?`,
			to, from, s.MealSlotID, s.CourseID); err != nil {
			return false, err
		}
	}
	if out.MoveVariety {
		if _, err := q.ExecContext(ctx, `UPDATE variety_rules SET tag = ? WHERE tag = ?`, to, from); err != nil {
			return false, err
		}
	}
	if out.DropVariety {
		if _, err := q.ExecContext(ctx, `DELETE FROM variety_rules WHERE tag = ?`, from); err != nil {
			return false, err
		}
	}
	return len(out.DropSlots)+len(out.MoveSlots) > 0 || out.MoveVariety || out.DropVariety, nil
}

// List returns every Tag ordered by lower(name), then id, with its counts.
func (s *Store) List(ctx context.Context) ([]tag.Listing, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT t.id, t.key, t.name, t.colour,
	        (SELECT count(*) FROM recipe_tags rt WHERE rt.tag_id = t.id),
	        (SELECT count(*) FROM slot_rules sr WHERE sr.tag = t.key),
	        (SELECT count(*) FROM variety_rules vr WHERE vr.tag = t.key)
	    FROM tags t ORDER BY lower(t.name), t.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []tag.Listing{}
	for rows.Next() {
		var l tag.Listing
		var variety int
		if err := rows.Scan(&l.ID, &l.Key, &l.Name, &l.Colour, &l.Recipes, &l.SlotRules, &variety); err != nil {
			return nil, err
		}
		l.VarietyRule = variety > 0
		out = append(out, l)
	}
	return out, rows.Err()
}

// Get returns one Tag; tag.ErrNotFound.
func (s *Store) Get(ctx context.Context, id int64) (tag.Tag, error) {
	return getTag(ctx, s.db, id)
}

// Create adds a Tag. An empty colour takes tag.NextColour over the current counts, in the same
// transaction. tag.ErrNameInvalid, tag.ErrColourUnknown, *tag.NameTakenError.
func (s *Store) Create(ctx context.Context, name, colour string) (tag.Tag, error) {
	clean, err := tag.CleanName(name)
	if err != nil {
		return tag.Tag{}, err
	}
	if colour != "" && !tag.ValidColour(colour) {
		return tag.Tag{}, tag.ErrColourUnknown
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return tag.Tag{}, err
	}
	defer tx.Rollback()
	key := tag.NameKey(clean)
	if other, found, err := tagByKey(ctx, tx, key); err != nil {
		return tag.Tag{}, err
	} else if found {
		return tag.Tag{}, &tag.NameTakenError{Tag: other}
	}
	if colour == "" {
		counts, err := colourCounts(ctx, tx)
		if err != nil {
			return tag.Tag{}, err
		}
		colour = tag.NextColour(counts)
	}
	res, err := tx.ExecContext(ctx, `INSERT INTO tags (key, name, colour) VALUES (?,?,?)`, key, clean, colour)
	if err != nil {
		return tag.Tag{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return tag.Tag{}, err
	}
	if err := tx.Commit(); err != nil {
		return tag.Tag{}, err
	}
	return tag.Tag{ID: id, Key: key, Name: clean, Colour: colour}, nil
}

// Update renames and/or recolours a Tag (nil leaves a field alone). A new spelling with the
// same key changes the name only; a new key rewrites the rules on the old key as tag.Merge says
// against the rules already on the new key. tag.ErrNotFound, ErrNameInvalid, ErrColourUnknown,
// *tag.NameTakenError (another Tag has the key; nothing changes).
func (s *Store) Update(ctx context.Context, id int64, name, colour *string) (Result, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Result{}, err
	}
	defer tx.Rollback()
	cur, err := getTag(ctx, tx, id)
	if err != nil {
		return Result{}, err
	}
	next := cur
	if name != nil {
		clean, err := tag.CleanName(*name)
		if err != nil {
			return Result{}, err
		}
		next.Name, next.Key = clean, tag.NameKey(clean)
	}
	if colour != nil {
		if !tag.ValidColour(*colour) {
			return Result{}, tag.ErrColourUnknown
		}
		next.Colour = *colour
	}

	var rulesChanged bool
	if next.Key != cur.Key {
		if other, found, err := tagByKey(ctx, tx, next.Key); err != nil {
			return Result{}, err
		} else if found {
			return Result{}, &tag.NameTakenError{Tag: other}
		}
		src, err := ruleSet(ctx, tx, cur.Key)
		if err != nil {
			return Result{}, err
		}
		into, err := ruleSet(ctx, tx, next.Key)
		if err != nil {
			return Result{}, err
		}
		if rulesChanged, err = applyRules(ctx, tx, cur.Key, next.Key, tag.Merge(src, into)); err != nil {
			return Result{}, err
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE tags SET key = ?, name = ?, colour = ? WHERE id = ?`,
		next.Key, next.Name, next.Colour, id); err != nil {
		return Result{}, err
	}
	if err := tx.Commit(); err != nil {
		return Result{}, err
	}
	return Result{Tag: next, RulesChanged: rulesChanged}, nil
}

// Impact lists what Merge or Delete of the Tag touches. tag.ErrNotFound.
func (s *Store) Impact(ctx context.Context, id int64) (tag.Impact, error) {
	t, err := getTag(ctx, s.db, id)
	if err != nil {
		return tag.Impact{}, err
	}
	imp := tag.Impact{Tag: t}
	if err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM recipe_tags WHERE tag_id = ?`, id).Scan(&imp.Recipes); err != nil {
		return tag.Impact{}, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT sr.id, sr.meal_slot_id, ms.name, ms.weekday, sr.course_id, c.name
	    FROM slot_rules sr
	    JOIN meal_slots ms ON ms.id = sr.meal_slot_id
	    JOIN courses c ON c.id = sr.course_id
	    WHERE sr.tag = ?
	    ORDER BY ms.weekday, ms.time, ms.id, c.position`, t.Key)
	if err != nil {
		return tag.Impact{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var r tag.ImpactSlotRule
		if err := rows.Scan(&r.ID, &r.MealSlotID, &r.MealSlotName, &r.Weekday, &r.CourseID, &r.CourseName); err != nil {
			return tag.Impact{}, err
		}
		imp.SlotRules = append(imp.SlotRules, r)
	}
	if err := rows.Err(); err != nil {
		return tag.Impact{}, err
	}
	var v tag.ImpactVariety
	var consecutive int
	err = s.db.QueryRowContext(ctx, `SELECT max_per_week, not_consecutive_days FROM variety_rules WHERE tag = ?`, t.Key).
		Scan(&v.MaxPerWeek, &consecutive)
	switch {
	case errors.Is(err, sql.ErrNoRows):
	case err != nil:
		return tag.Impact{}, err
	default:
		v.NotConsecutiveDays = consecutive == 1
		imp.VarietyRule = &v
	}
	return imp, nil
}

// Merge moves Tag id onto Tag into and removes id. tag.ErrNotFound (id), tag.ErrMergeSelf,
// tag.ErrMergeTarget (into unknown).
func (s *Store) Merge(ctx context.Context, id, into int64) (Result, error) {
	if id == into {
		return Result{}, tag.ErrMergeSelf
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Result{}, err
	}
	defer tx.Rollback()
	src, err := getTag(ctx, tx, id)
	if err != nil {
		return Result{}, err
	}
	dst, err := getTag(ctx, tx, into)
	if errors.Is(err, tag.ErrNotFound) {
		return Result{}, tag.ErrMergeTarget
	}
	if err != nil {
		return Result{}, err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM recipe_tags WHERE tag_id = ?
	        AND recipe_id IN (SELECT recipe_id FROM recipe_tags WHERE tag_id = ?)`, id, into); err != nil {
		return Result{}, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE recipe_tags SET tag_id = ? WHERE tag_id = ?`, into, id); err != nil {
		return Result{}, err
	}
	srcRules, err := ruleSet(ctx, tx, src.Key)
	if err != nil {
		return Result{}, err
	}
	dstRules, err := ruleSet(ctx, tx, dst.Key)
	if err != nil {
		return Result{}, err
	}
	rulesChanged, err := applyRules(ctx, tx, src.Key, dst.Key, tag.Merge(srcRules, dstRules))
	if err != nil {
		return Result{}, err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM tags WHERE id = ?`, id); err != nil {
		return Result{}, err
	}
	if err := tx.Commit(); err != nil {
		return Result{}, err
	}
	return Result{RulesChanged: rulesChanged}, nil
}

// Delete removes the Tag from every Recipe, removes the rules naming its key and the Tag. It is
// never refused because rules name the Tag. tag.ErrNotFound.
func (s *Store) Delete(ctx context.Context, id int64) (Result, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Result{}, err
	}
	defer tx.Rollback()
	t, err := getTag(ctx, tx, id)
	if err != nil {
		return Result{}, err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM recipe_tags WHERE tag_id = ?`, id); err != nil {
		return Result{}, err
	}
	slots, err := tx.ExecContext(ctx, `DELETE FROM slot_rules WHERE tag = ?`, t.Key)
	if err != nil {
		return Result{}, err
	}
	nSlots, err := slots.RowsAffected()
	if err != nil {
		return Result{}, err
	}
	variety, err := tx.ExecContext(ctx, `DELETE FROM variety_rules WHERE tag = ?`, t.Key)
	if err != nil {
		return Result{}, err
	}
	nVariety, err := variety.RowsAffected()
	if err != nil {
		return Result{}, err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM tags WHERE id = ?`, id); err != nil {
		return Result{}, err
	}
	if err := tx.Commit(); err != nil {
		return Result{}, err
	}
	return Result{RulesChanged: nSlots+nVariety > 0}, nil
}

// Exists reports whether a Tag has the key (already tag.NameKey'd by the caller).
func (s *Store) Exists(ctx context.Context, key string) (bool, error) {
	_, found, err := tagByKey(ctx, s.db, key)
	return found, err
}

// EnsureTx returns the id of the Tag with name's key, creating it with the next colour when
// there is none (the first spelling is kept). The one place a Tag is created on use; the Recipe
// repository calls it from writeContent.
func EnsureTx(ctx context.Context, tx *sql.Tx, name string) (int64, error) {
	clean, err := tag.CleanName(name)
	if err != nil {
		return 0, err
	}
	key := tag.NameKey(clean)
	if t, found, err := tagByKey(ctx, tx, key); err != nil {
		return 0, err
	} else if found {
		return t.ID, nil
	}
	counts, err := colourCounts(ctx, tx)
	if err != nil {
		return 0, err
	}
	res, err := tx.ExecContext(ctx, `INSERT INTO tags (key, name, colour) VALUES (?,?,?)`, key, clean, tag.NextColour(counts))
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// BothRecipes counts the Recipes (archived included) that carry both Tag id and Tag into: the
// "(4 already have both)" of the merge confirm (GET /api/tags/{id}/impact?into=). tag.ErrNotFound
// (id), tag.ErrMergeSelf, tag.ErrMergeTarget, checked in that order.
func (s *Store) BothRecipes(ctx context.Context, id, into int64) (int, error) {
	if _, err := getTag(ctx, s.db, id); err != nil {
		return 0, err
	}
	if id == into {
		return 0, tag.ErrMergeSelf
	}
	if _, err := getTag(ctx, s.db, into); errors.Is(err, tag.ErrNotFound) {
		return 0, tag.ErrMergeTarget
	} else if err != nil {
		return 0, err
	}
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT count(DISTINCT a.recipe_id) FROM recipe_tags a
	    JOIN recipe_tags b ON b.recipe_id = a.recipe_id
	    WHERE a.tag_id = ? AND b.tag_id = ?`, id, into).Scan(&n)
	return n, err
}
