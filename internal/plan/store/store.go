// Package store is the SQLite repository for planning: Planned Meals, Leftovers,
// Slot Rules, Variety Rules, "couldn't plan" reasons and the generation counter
// (migration 0600_planning.sql). It holds no planning rules: internal/plan and
// internal/planner do. Every read and write can run inside the caller's
// transaction through InTx, so the runner persists a whole run atomically.
package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/plan"
	rstore "github.com/fabbarix/feeder-ng/internal/recipe/store"
)

// Errors.
var (
	ErrNotFound      = errors.New("planning: not found")
	ErrInvalid       = errors.New("planning: invalid")                     // rule with both/neither Recipe and Tag, bad Variety Rule
	ErrDuplicateRule = errors.New("planning: rule already exists")         // same Slot Rule twice
	ErrUnknownRef    = errors.New("planning: unknown Meal Slot or Recipe") // foreign key not satisfied
)

// DB is what a Store runs its statements on: *sql.DB or *sql.Tx.
type DB interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// Store is the planning repository.
type Store struct {
	db  *sql.DB
	q   DB
	tx  *sql.Tx // non-nil when bound to a transaction
	clk clock.Clock
}

// New returns a Store over an open, migrated database.
func New(d *sql.DB, clk clock.Clock) *Store { return &Store{db: d, q: d, clk: clk} }

// InTx runs fn in one transaction: st is bound to it, tx is for callers that
// must pass the transaction on (stock.DeductForCookedTx). It commits when fn
// returns nil and rolls back otherwise. Nested InTx on the bound store joins the
// same transaction.
func (s *Store) InTx(ctx context.Context, fn func(tx *sql.Tx, st *Store) error) error {
	if s.tx != nil {
		return fn(s.tx, s)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	bound := &Store{db: s.db, q: tx, tx: tx, clk: s.clk}
	if err := fn(tx, bound); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

// now is the store's timestamp for created_at and updated_at.
func (s *Store) now() string { return s.clk.Now().UTC().Format(time.RFC3339) }

// mapErr turns a foreign key violation into ErrUnknownRef.
func mapErr(err error) error {
	if err != nil && strings.Contains(err.Error(), "FOREIGN KEY constraint failed") {
		return ErrUnknownRef
	}
	return err
}

// Planned Meals.

const mealCols = `date, meal_slot_id, recipe_id, batches, portions, state, pinned, from_leftover_id, from_date, from_meal_slot_id, why_json`

type scanner interface {
	Scan(dest ...any) error
}

func scanMeal(sc scanner) (plan.Meal, error) {
	var (
		m                      plan.Meal
		state, why             string
		pinned                 int64
		fromLeftover, fromSlot sql.NullInt64
		fromDate               sql.NullString
	)
	err := sc.Scan(&m.ID, &m.Key.Date, &m.Key.MealSlotID, &m.RecipeID, &m.Batches, &m.Portions, &state, &pinned,
		&fromLeftover, &fromDate, &fromSlot, &why)
	if err != nil {
		return plan.Meal{}, err
	}
	m.State = plan.State(state)
	m.Pinned = pinned == 1
	if fromDate.Valid {
		m.From = &plan.Source{LeftoverID: fromLeftover.Int64, From: plan.Key{Date: fromDate.String, MealSlotID: fromSlot.Int64}}
	}
	m.Why, err = plan.DecodeWhy(why)
	return m, err
}

const mealSelect = `SELECT id, ` + mealCols + ` FROM planned_meals`

// Meals returns the Planned Meals with from <= date <= to ("" = open bound), ordered by date then Meal Slot id.
func (s *Store) Meals(ctx context.Context, from, to string) ([]plan.Meal, error) {
	rows, err := s.q.QueryContext(ctx, mealSelect+` WHERE (? = '' OR date >= ?) AND (? = '' OR date <= ?)
		ORDER BY date, meal_slot_id`, from, from, to, to)
	if err != nil {
		return nil, err
	}
	return collectMeals(rows)
}

func collectMeals(rows *sql.Rows) ([]plan.Meal, error) {
	defer rows.Close()
	var out []plan.Meal
	for rows.Next() {
		m, err := scanMeal(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// Meal returns the Planned Meal at key; ErrNotFound if the slot is empty.
func (s *Store) Meal(ctx context.Context, key plan.Key) (plan.Meal, error) {
	m, err := scanMeal(s.q.QueryRowContext(ctx, mealSelect+` WHERE date = ? AND meal_slot_id = ?`, key.Date, key.MealSlotID))
	if errors.Is(err, sql.ErrNoRows) {
		return plan.Meal{}, ErrNotFound
	}
	return m, err
}

// UnresolvedBefore returns the Planned Meals in State planned dated before date (still to confirm), oldest first.
func (s *Store) UnresolvedBefore(ctx context.Context, date string) ([]plan.Meal, error) {
	rows, err := s.q.QueryContext(ctx, mealSelect+` WHERE state = 'planned' AND date < ? ORDER BY date, meal_slot_id`, date)
	if err != nil {
		return nil, err
	}
	return collectMeals(rows)
}

// SaveMeal inserts or replaces the Planned Meal at m.Key (the id is kept when it exists) and returns it.
// ErrUnknownRef for an unknown Meal Slot or Recipe.
func (s *Store) SaveMeal(ctx context.Context, m plan.Meal) (plan.Meal, error) {
	why, err := plan.EncodeWhy(m.Why)
	if err != nil {
		return plan.Meal{}, err
	}
	var fromLeftover sql.NullInt64
	var fromDate sql.NullString
	var fromSlot sql.NullInt64
	if m.From != nil {
		if m.From.LeftoverID != 0 {
			fromLeftover = sql.NullInt64{Int64: m.From.LeftoverID, Valid: true}
		}
		fromDate = sql.NullString{String: m.From.From.Date, Valid: true}
		fromSlot = sql.NullInt64{Int64: m.From.From.MealSlotID, Valid: true}
	}
	pinned := 0
	if m.Pinned {
		pinned = 1
	}
	now := s.now()
	var resolved sql.NullString
	if m.State != plan.StatePlanned {
		resolved = sql.NullString{String: now, Valid: true}
	}
	state := string(m.State)
	if state == "" {
		state = string(plan.StatePlanned)
	}
	_, err = s.q.ExecContext(ctx, `INSERT INTO planned_meals (date, meal_slot_id, recipe_id, batches, portions, state, pinned,
		from_leftover_id, from_date, from_meal_slot_id, why_json, resolved_at, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (date, meal_slot_id) DO UPDATE SET recipe_id = excluded.recipe_id, batches = excluded.batches,
		  portions = excluded.portions, state = excluded.state, pinned = excluded.pinned,
		  from_leftover_id = excluded.from_leftover_id, from_date = excluded.from_date,
		  from_meal_slot_id = excluded.from_meal_slot_id, why_json = excluded.why_json,
		  resolved_at = excluded.resolved_at, updated_at = excluded.updated_at`,
		m.Key.Date, m.Key.MealSlotID, m.RecipeID, m.Batches, m.Portions, state, pinned,
		fromLeftover, fromDate, fromSlot, why, resolved, now, now)
	if err != nil {
		return plan.Meal{}, mapErr(err)
	}
	return s.Meal(ctx, m.Key)
}

// SetPinned changes only the Pinned flag; ErrNotFound if the slot is empty.
func (s *Store) SetPinned(ctx context.Context, key plan.Key, pinned bool) error {
	v := 0
	if pinned {
		v = 1
	}
	return s.affectOne(ctx, `UPDATE planned_meals SET pinned = ?, updated_at = ? WHERE date = ? AND meal_slot_id = ?`,
		v, s.now(), key.Date, key.MealSlotID)
}

// MarkResolved sets State (cooked or skipped) and the resolution instant (the clock's now).
func (s *Store) MarkResolved(ctx context.Context, key plan.Key, state plan.State) error {
	now := s.now()
	return s.affectOne(ctx, `UPDATE planned_meals SET state = ?, resolved_at = ?, updated_at = ? WHERE date = ? AND meal_slot_id = ?`,
		string(state), now, now, key.Date, key.MealSlotID)
}

// DeleteMeal removes the Planned Meal at key; ErrNotFound if there is none.
func (s *Store) DeleteMeal(ctx context.Context, key plan.Key) error {
	return s.affectOne(ctx, `DELETE FROM planned_meals WHERE date = ? AND meal_slot_id = ?`, key.Date, key.MealSlotID)
}

// affectOne runs a statement that must change exactly one row.
func (s *Store) affectOne(ctx context.Context, query string, args ...any) error {
	res, err := s.q.ExecContext(ctx, query, args...)
	if err != nil {
		return mapErr(err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// Dependants returns the Planned Meals in State planned served from the Leftover of the fresh meal at source.
func (s *Store) Dependants(ctx context.Context, source plan.Key) ([]plan.Meal, error) {
	rows, err := s.q.QueryContext(ctx, mealSelect+` WHERE state = 'planned' AND from_date = ? AND from_meal_slot_id = ?
		ORDER BY date, meal_slot_id`, source.Date, source.MealSlotID)
	if err != nil {
		return nil, err
	}
	return collectMeals(rows)
}

// LinkLeftover points every dependant of source (State planned) at the actual Leftover.
func (s *Store) LinkLeftover(ctx context.Context, source plan.Key, leftoverID int64) error {
	_, err := s.q.ExecContext(ctx, `UPDATE planned_meals SET from_leftover_id = ?, updated_at = ?
		WHERE state = 'planned' AND from_date = ? AND from_meal_slot_id = ?`, leftoverID, s.now(), source.Date, source.MealSlotID)
	return mapErr(err)
}

// History returns, per Recipe, the latest date before `before` of a fresh meal (not served from a Leftover) in
// State planned or cooked. Skipped meals do not count.
func (s *Store) History(ctx context.Context, before string) ([]plan.HistoryEntry, error) {
	rows, err := s.q.QueryContext(ctx, `SELECT recipe_id, MAX(date) FROM planned_meals
		WHERE from_date IS NULL AND state IN ('planned', 'cooked') AND date < ? GROUP BY recipe_id ORDER BY recipe_id`, before)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []plan.HistoryEntry
	for rows.Next() {
		var h plan.HistoryEntry
		if err := rows.Scan(&h.RecipeID, &h.Date); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

// Apply writes a run's Changes: upserts (State planned, not Pinned), deletes, the new "couldn't plan" reasons and the
// cleared ones. It never touches Pinned, Cooked or Skipped meals, and an error leaves nothing written when the Store
// is bound to a transaction (the runner always is).
func (s *Store) Apply(ctx context.Context, ch plan.Changes) error {
	return s.InTx(ctx, func(_ *sql.Tx, st *Store) error {
		for _, k := range ch.Deletes {
			_, err := st.q.ExecContext(ctx, `DELETE FROM planned_meals WHERE date = ? AND meal_slot_id = ?
				AND state = 'planned' AND pinned = 0`, k.Date, k.MealSlotID)
			if err != nil {
				return mapErr(err)
			}
		}
		for _, m := range ch.Upserts {
			cur, err := st.Meal(ctx, m.Key)
			if err == nil && (cur.Pinned || cur.State != plan.StatePlanned) {
				continue // fixed by the User: never rewritten by a run
			}
			if err != nil && !errors.Is(err, ErrNotFound) {
				return err
			}
			m.State, m.Pinned = plan.StatePlanned, false
			if _, err := st.SaveMeal(ctx, m); err != nil {
				return err
			}
		}
		for _, u := range ch.Unfilled {
			elim, err := json.Marshal(u.Eliminated)
			if err != nil {
				return err
			}
			claimed := 0
			if u.SlotRuleClaimed {
				claimed = 1
			}
			_, err = st.q.ExecContext(ctx, `INSERT INTO plan_unfilled (date, meal_slot_id, reason, slot_rule_claimed, eliminated_json)
				VALUES (?, ?, ?, ?, ?) ON CONFLICT (date, meal_slot_id) DO UPDATE SET reason = excluded.reason,
				slot_rule_claimed = excluded.slot_rule_claimed, eliminated_json = excluded.eliminated_json`,
				u.Key.Date, u.Key.MealSlotID, u.Reason, claimed, string(elim))
			if err != nil {
				return mapErr(err)
			}
		}
		for _, k := range ch.ClearUnfilled {
			if _, err := st.q.ExecContext(ctx, `DELETE FROM plan_unfilled WHERE date = ? AND meal_slot_id = ?`,
				k.Date, k.MealSlotID); err != nil {
				return err
			}
		}
		return nil
	})
}

// Unfilled returns the stored "couldn't plan" reasons with from <= date <= to, ordered by date then Meal Slot id.
func (s *Store) Unfilled(ctx context.Context, from, to string) ([]plan.Unfilled, error) {
	rows, err := s.q.QueryContext(ctx, `SELECT date, meal_slot_id, reason, slot_rule_claimed, eliminated_json FROM plan_unfilled
		WHERE (? = '' OR date >= ?) AND (? = '' OR date <= ?) ORDER BY date, meal_slot_id`, from, from, to, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []plan.Unfilled
	for rows.Next() {
		var u plan.Unfilled
		var claimed int64
		var elim string
		if err := rows.Scan(&u.Key.Date, &u.Key.MealSlotID, &u.Reason, &claimed, &elim); err != nil {
			return nil, err
		}
		u.SlotRuleClaimed = claimed == 1
		if err := json.Unmarshal([]byte(elim), &u.Eliminated); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// Leftovers.

const leftoverCols = `id, recipe_id, from_date, from_meal_slot_id, portions, cooked_on, use_by, status`

func scanLeftover(sc scanner) (plan.Leftover, error) {
	var l plan.Leftover
	var status string
	err := sc.Scan(&l.ID, &l.RecipeID, &l.From.Date, &l.From.MealSlotID, &l.Portions, &l.CookedOn, &l.UseBy, &status)
	l.Status = plan.LeftoverStatus(status)
	return l, err
}

// AddLeftover records an actual Leftover (Status available) and returns it with its id.
func (s *Store) AddLeftover(ctx context.Context, l plan.Leftover) (plan.Leftover, error) {
	res, err := s.q.ExecContext(ctx, `INSERT INTO leftovers (recipe_id, from_date, from_meal_slot_id, portions, cooked_on, use_by, status, created_at)
		VALUES (?, ?, ?, ?, ?, ?, 'available', ?)`,
		l.RecipeID, l.From.Date, l.From.MealSlotID, l.Portions, l.CookedOn, l.UseBy, s.now())
	if err != nil {
		return plan.Leftover{}, mapErr(err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return plan.Leftover{}, err
	}
	l.ID, l.Status = id, plan.LeftoverAvailable
	return l, nil
}

// Leftover returns one Leftover of any status; ErrNotFound otherwise.
func (s *Store) Leftover(ctx context.Context, id int64) (plan.Leftover, error) {
	l, err := scanLeftover(s.q.QueryRowContext(ctx, `SELECT `+leftoverCols+` FROM leftovers WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return plan.Leftover{}, ErrNotFound
	}
	return l, err
}

// Leftovers returns the available Leftovers with Portions > 0, soonest Use-by first (then id).
func (s *Store) Leftovers(ctx context.Context) ([]plan.Leftover, error) {
	rows, err := s.q.QueryContext(ctx, `SELECT `+leftoverCols+` FROM leftovers
		WHERE status = 'available' AND portions > 0 ORDER BY use_by, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []plan.Leftover
	for rows.Next() {
		l, err := scanLeftover(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// LeftoverFrom returns the available Leftover produced by the Cooked meal at key, if any.
func (s *Store) LeftoverFrom(ctx context.Context, key plan.Key) (plan.Leftover, bool, error) {
	l, err := scanLeftover(s.q.QueryRowContext(ctx, `SELECT `+leftoverCols+` FROM leftovers
		WHERE status = 'available' AND from_date = ? AND from_meal_slot_id = ? ORDER BY id DESC LIMIT 1`, key.Date, key.MealSlotID))
	if errors.Is(err, sql.ErrNoRows) {
		return plan.Leftover{}, false, nil
	}
	return l, err == nil, err
}

// SetLeftoverPortions sets the remaining portions (>= 0); ErrNotFound if unknown.
func (s *Store) SetLeftoverPortions(ctx context.Context, id int64, portions float64) error {
	if portions < 0 {
		return ErrInvalid
	}
	return s.affectOne(ctx, `UPDATE leftovers SET portions = ? WHERE id = ?`, portions, id)
}

// DiscardLeftover marks a Leftover discarded on the given date; ErrNotFound if unknown.
func (s *Store) DiscardLeftover(ctx context.Context, id int64, on string) error {
	return s.affectOne(ctx, `UPDATE leftovers SET status = 'discarded', discarded_on = ? WHERE id = ?`, on, id)
}

// Rules.

// SlotRules returns all Slot Rules ordered by Meal Slot id, then id.
func (s *Store) SlotRules(ctx context.Context) ([]plan.SlotRule, error) {
	rows, err := s.q.QueryContext(ctx, `SELECT id, meal_slot_id, recipe_id, tag FROM slot_rules ORDER BY meal_slot_id, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []plan.SlotRule
	for rows.Next() {
		var r plan.SlotRule
		var recipeID sql.NullInt64
		var tag sql.NullString
		if err := rows.Scan(&r.ID, &r.MealSlotID, &recipeID, &tag); err != nil {
			return nil, err
		}
		r.RecipeID, r.Tag = recipeID.Int64, tag.String
		out = append(out, r)
	}
	return out, rows.Err()
}

// AddSlotRule stores a Slot Rule. ErrInvalid unless exactly one of RecipeID and Tag is set, ErrUnknownRef for an unknown
// Meal Slot or Recipe, ErrDuplicateRule for the same rule twice.
func (s *Store) AddSlotRule(ctx context.Context, r plan.SlotRule) (plan.SlotRule, error) {
	if (r.RecipeID == 0) == (r.Tag == "") {
		return plan.SlotRule{}, ErrInvalid
	}
	var recipeID sql.NullInt64
	var tag sql.NullString
	if r.RecipeID != 0 {
		recipeID = sql.NullInt64{Int64: r.RecipeID, Valid: true}
	} else {
		tag = sql.NullString{String: r.Tag, Valid: true}
	}
	var dup int
	if err := s.q.QueryRowContext(ctx, `SELECT COUNT(*) FROM slot_rules WHERE meal_slot_id = ? AND recipe_id IS ? AND tag IS ?`,
		r.MealSlotID, recipeID, tag).Scan(&dup); err != nil {
		return plan.SlotRule{}, err
	}
	if dup > 0 {
		return plan.SlotRule{}, ErrDuplicateRule
	}
	res, err := s.q.ExecContext(ctx, `INSERT INTO slot_rules (meal_slot_id, recipe_id, tag) VALUES (?, ?, ?)`,
		r.MealSlotID, recipeID, tag)
	if err != nil {
		return plan.SlotRule{}, mapErr(err)
	}
	r.ID, _ = res.LastInsertId()
	return r, nil
}

// DeleteSlotRule removes a Slot Rule; ErrNotFound if unknown.
func (s *Store) DeleteSlotRule(ctx context.Context, id int64) error {
	return s.affectOne(ctx, `DELETE FROM slot_rules WHERE id = ?`, id)
}

// VarietyRules returns all Variety Rules ordered by Tag.
func (s *Store) VarietyRules(ctx context.Context) ([]plan.VarietyRule, error) {
	rows, err := s.q.QueryContext(ctx, `SELECT tag, max_per_week, not_consecutive_days FROM variety_rules ORDER BY tag`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []plan.VarietyRule
	for rows.Next() {
		var v plan.VarietyRule
		var consecutive int64
		if err := rows.Scan(&v.Tag, &v.MaxPerWeek, &consecutive); err != nil {
			return nil, err
		}
		v.NotConsecutiveDays = consecutive == 1
		out = append(out, v)
	}
	return out, rows.Err()
}

// SetVarietyRule inserts or replaces the rule for r.Tag. ErrInvalid when it limits nothing (MaxPerWeek 0 and not
// NotConsecutiveDays), when MaxPerWeek is negative or above 21, or when the Tag is empty.
func (s *Store) SetVarietyRule(ctx context.Context, r plan.VarietyRule) error {
	if r.Tag == "" || r.MaxPerWeek < 0 || r.MaxPerWeek > 21 || (r.MaxPerWeek == 0 && !r.NotConsecutiveDays) {
		return ErrInvalid
	}
	consecutive := 0
	if r.NotConsecutiveDays {
		consecutive = 1
	}
	_, err := s.q.ExecContext(ctx, `INSERT INTO variety_rules (tag, max_per_week, not_consecutive_days) VALUES (?, ?, ?)
		ON CONFLICT (tag) DO UPDATE SET max_per_week = excluded.max_per_week, not_consecutive_days = excluded.not_consecutive_days`,
		r.Tag, r.MaxPerWeek, consecutive)
	return mapErr(err)
}

// DeleteVarietyRule removes the rule for tag; ErrNotFound if there is none.
func (s *Store) DeleteVarietyRule(ctx context.Context, tag string) error {
	return s.affectOne(ctx, `DELETE FROM variety_rules WHERE tag = ?`, tag)
}

// Generation.

// Generation is the current plan generation (starts at 1).
func (s *Store) Generation(ctx context.Context) (int64, error) {
	var g int64
	err := s.q.QueryRowContext(ctx, `SELECT generation FROM plan_state WHERE id = 1`).Scan(&g)
	return g, err
}

// BumpGeneration increments the generation and returns the new value (Regenerate).
func (s *Store) BumpGeneration(ctx context.Context) (int64, error) {
	if _, err := s.q.ExecContext(ctx, `UPDATE plan_state SET generation = generation + 1 WHERE id = 1`); err != nil {
		return 0, err
	}
	return s.Generation(ctx)
}

// Checker tells the Recipes feature whether a Recipe was ever planned (so it can only be archived, not deleted):
// it has a Planned Meal, a Leftover or a Slot Rule. It registers itself as "planning" in init().
type Checker struct{}

// WasPlanned implements recipe/store.PlannedChecker.
func (Checker) WasPlanned(ctx context.Context, q rstore.Querier, recipeID int64) (bool, error) {
	var n int64
	err := q.QueryRowContext(ctx, `SELECT
		(SELECT COUNT(*) FROM planned_meals WHERE recipe_id = ?) +
		(SELECT COUNT(*) FROM leftovers WHERE recipe_id = ?) +
		(SELECT COUNT(*) FROM slot_rules WHERE recipe_id = ?)`, recipeID, recipeID, recipeID).Scan(&n)
	return n > 0, err
}

func init() { rstore.RegisterPlannedChecker("planning", Checker{}) }
