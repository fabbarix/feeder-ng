package store

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
)

// B9-11 (PC-01, SAFE-03, SAFE-07): the rows a write changed, so they can be written back exactly (Undo of a replanning
// write, Reopen of Cooked and Not cooked), the plan revision, the undo token store (plan_snapshots, migration 1574) and
// the records of Cooked and Not cooked (cooked_takes, migration 1573).

// planTable is one table whose rows a write can change, with the columns that identify a row.
type planTable struct {
	name string
	key  []string
}

// planTables are written back parents first; rows are removed children first.
var planTables = []planTable{
	{name: "planned_meals", key: []string{"id"}},
	{name: "plan_unfilled", key: []string{"date", "meal_slot_id", "course_id"}},
	{name: "planned_meal_bought", key: []string{"planned_meal_id", "ingredient_id", "lot_id"}},
}

// tableRows is every row of one table, by the key of each row.
type tableRows struct {
	cols []string
	rows map[string][]any
	keys []string // in read order
}

// Rows is a capture of every plan row (planned_meals, plan_unfilled, planned_meal_bought) and the generation.
type Rows struct {
	tables     map[string]tableRows
	generation int64
}

// CaptureRows reads every plan row, inside the Store's transaction when it is bound to one.
func (s *Store) CaptureRows(ctx context.Context) (Rows, error) {
	out := Rows{tables: map[string]tableRows{}}
	for _, t := range planTables {
		tr, err := s.readTable(ctx, t, "", nil)
		if err != nil {
			return Rows{}, err
		}
		out.tables[t.name] = tr
	}
	g, err := s.Generation(ctx)
	if err != nil {
		return Rows{}, err
	}
	out.generation = g
	return out, nil
}

// readTable reads the rows of t matching where (all rows when where is "").
func (s *Store) readTable(ctx context.Context, t planTable, where string, args []any) (tableRows, error) {
	q := `SELECT * FROM ` + t.name
	if where != "" {
		q += ` WHERE ` + where
	}
	rows, err := s.q.QueryContext(ctx, q, args...)
	if err != nil {
		return tableRows{}, err
	}
	defer rows.Close()
	cols, err := rows.Columns()
	if err != nil {
		return tableRows{}, err
	}
	idx := keyIndexes(cols, t.key)
	tr := tableRows{cols: cols, rows: map[string][]any{}}
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return tableRows{}, err
		}
		for i, v := range vals {
			if b, ok := v.([]byte); ok {
				vals[i] = string(b)
			}
		}
		k := rowKey(vals, idx)
		tr.rows[k] = vals
		tr.keys = append(tr.keys, k)
	}
	return tr, rows.Err()
}

func keyIndexes(cols, key []string) []int {
	out := make([]int, 0, len(key))
	for _, k := range key {
		for i, c := range cols {
			if c == k {
				out = append(out, i)
			}
		}
	}
	return out
}

func rowKey(vals []any, idx []int) string {
	parts := make([]string, 0, len(idx))
	for _, i := range idx {
		parts = append(parts, valueKey(vals[i]))
	}
	return strings.Join(parts, "\x1f")
}

// valueKey is a value as text, numbers in one form whatever their Go type.
func valueKey(v any) string {
	if f, ok := number(v); ok {
		return strconv.FormatFloat(f, 'g', -1, 64)
	}
	return fmt.Sprint(v)
}

func number(v any) (float64, bool) {
	switch n := v.(type) {
	case int64:
		return float64(n), true
	case float64:
		return n, true
	case int:
		return float64(n), true
	}
	return 0, false
}

// sameRow compares two rows value by value (an integer and a float of the same value are the same).
func sameRow(a, b []any) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		fa, na := number(a[i])
		fb, nb := number(b[i])
		switch {
		case na && nb:
			if fa != fb && !(math.IsNaN(fa) && math.IsNaN(fb)) {
				return false
			}
		case na != nb:
			return false
		case a[i] == nil || b[i] == nil:
			if a[i] != b[i] {
				return false
			}
		default:
			if fmt.Sprint(a[i]) != fmt.Sprint(b[i]) {
				return false
			}
		}
	}
	return true
}

// TableDiff is what a write changed in one table: Before holds the rows it changed or removed as they were, After the
// rows it changed or added as they are.
type TableDiff struct {
	Name   string   `json:"name"`
	Cols   []string `json:"cols"`
	Before [][]any  `json:"before"`
	After  [][]any  `json:"after"`
}

// RowDiff is what one write changed in the plan rows.
type RowDiff struct {
	Tables    []TableDiff `json:"tables"`
	GenBefore int64       `json:"genBefore"`
	GenAfter  int64       `json:"genAfter"`
}

// Empty reports whether the write changed no row. The generation alone is not a change: a Regenerate that moved no meal
// changed nothing anyone can see, so it bumps no revision and issues no token. With rows, it is written back with them.
func (d RowDiff) Empty() bool {
	for _, t := range d.Tables {
		if len(t.Before) > 0 || len(t.After) > 0 {
			return false
		}
	}
	return true
}

// DiffRows compares two captures of the plan rows.
func DiffRows(before, after Rows) RowDiff {
	d := RowDiff{GenBefore: before.generation, GenAfter: after.generation}
	for _, t := range planTables {
		b, a := before.tables[t.name], after.tables[t.name]
		cols := a.cols
		if cols == nil {
			cols = b.cols
		}
		td := TableDiff{Name: t.name, Cols: cols}
		for _, k := range b.keys {
			br := b.rows[k]
			if ar, ok := a.rows[k]; !ok || !sameRow(br, ar) {
				td.Before = append(td.Before, br)
			}
		}
		for _, k := range a.keys {
			ar := a.rows[k]
			if br, ok := b.rows[k]; !ok || !sameRow(br, ar) {
				td.After = append(td.After, ar)
			}
		}
		if len(td.Before) > 0 || len(td.After) > 0 {
			d.Tables = append(d.Tables, td)
		}
	}
	return d
}

// DecodeRowDiff reads a diff written as JSON, numbers as integers when they have no fraction.
func DecodeRowDiff(raw []byte) (RowDiff, error) {
	var d RowDiff
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	if err := dec.Decode(&d); err != nil {
		return RowDiff{}, err
	}
	for ti := range d.Tables {
		for _, rows := range [][][]any{d.Tables[ti].Before, d.Tables[ti].After} {
			for _, r := range rows {
				for i, v := range r {
					if n, ok := v.(json.Number); ok {
						if iv, err := n.Int64(); err == nil {
							r[i] = iv
						} else if fv, err := n.Float64(); err == nil {
							r[i] = fv
						}
					}
				}
			}
		}
	}
	return d, nil
}

// Revert writes back the rows the diff changed, as they were before it. Without guard (Undo of a replanning write,
// whose token proves nothing wrote since) every row is written back. With guard (Reopen, which comes after other writes)
// a row is written back only while it is still as the diff left it, and a removed row only while its place is free.
func (s *Store) Revert(ctx context.Context, d RowDiff, guard bool) error {
	byName := map[string]TableDiff{}
	for _, t := range d.Tables {
		byName[t.Name] = t
	}
	type split struct {
		t                       planTable
		td                      TableDiff
		idx                     []int
		added, changed, removed [][]any // added/changed as after; removed as before
		changedBefore           map[string][]any
	}
	var parts []split
	for _, t := range planTables {
		td, ok := byName[t.name]
		if !ok {
			continue
		}
		sp := split{t: t, td: td, idx: keyIndexes(td.Cols, t.key), changedBefore: map[string][]any{}}
		before := map[string][]any{}
		for _, r := range td.Before {
			before[rowKey(r, sp.idx)] = r
		}
		after := map[string]bool{}
		for _, r := range td.After {
			k := rowKey(r, sp.idx)
			after[k] = true
			if b, ok := before[k]; ok {
				sp.changed = append(sp.changed, r)
				sp.changedBefore[k] = b
			} else {
				sp.added = append(sp.added, r)
			}
		}
		for _, r := range td.Before {
			if !after[rowKey(r, sp.idx)] {
				sp.removed = append(sp.removed, r)
			}
		}
		parts = append(parts, sp)
	}
	// still reports whether the row at the key of r is as r (with guard only).
	still := func(sp split, r []any) (bool, error) {
		if !guard {
			return true, nil
		}
		where, args := keyWhere(sp.td.Cols, sp.idx, r)
		cur, err := s.readTable(ctx, sp.t, where, args)
		if err != nil {
			return false, err
		}
		for _, k := range cur.keys {
			return sameRow(cur.rows[k], r), nil
		}
		return false, nil
	}
	// Rows the write added go first, children first.
	for i := len(parts) - 1; i >= 0; i-- {
		sp := parts[i]
		for _, r := range sp.added {
			ok, err := still(sp, r)
			if err != nil {
				return err
			}
			if !ok {
				continue
			}
			where, args := keyWhere(sp.td.Cols, sp.idx, r)
			if _, err := s.q.ExecContext(ctx, `DELETE FROM `+sp.t.name+` WHERE `+where, args...); err != nil {
				return mapErr(err)
			}
		}
	}
	for _, sp := range parts {
		for _, r := range sp.changed {
			ok, err := still(sp, r)
			if err != nil {
				return err
			}
			if !ok {
				continue
			}
			b := sp.changedBefore[rowKey(r, sp.idx)]
			sets := make([]string, 0, len(sp.td.Cols))
			for _, c := range sp.td.Cols {
				sets = append(sets, c+` = ?`)
			}
			where, kargs := keyWhere(sp.td.Cols, sp.idx, r)
			args := append(append([]any{}, b...), kargs...)
			if _, err := s.q.ExecContext(ctx, `UPDATE `+sp.t.name+` SET `+strings.Join(sets, ", ")+` WHERE `+where, args...); err != nil {
				return mapErr(err)
			}
		}
	}
	for _, sp := range parts {
		for _, r := range sp.removed {
			if sp.t.name == "planned_meal_bought" {
				// The record goes with its Planned Meal: none to attach it to, nothing to put back.
				var n int
				if err := s.q.QueryRowContext(ctx, `SELECT COUNT(*) FROM planned_meals WHERE id = ?`, r[sp.idx[0]]).Scan(&n); err != nil {
					return err
				}
				if n == 0 {
					continue
				}
			}
			marks := strings.TrimSuffix(strings.Repeat("?,", len(r)), ",")
			verb := `INSERT INTO `
			if guard {
				verb = `INSERT OR IGNORE INTO `
			}
			if _, err := s.q.ExecContext(ctx, verb+sp.t.name+` (`+strings.Join(sp.td.Cols, ", ")+`) VALUES (`+marks+`)`, r...); err != nil {
				return mapErr(err)
			}
		}
	}
	if d.GenBefore != d.GenAfter {
		g, err := s.Generation(ctx)
		if err != nil {
			return err
		}
		if !guard || g == d.GenAfter {
			if _, err := s.q.ExecContext(ctx, `UPDATE plan_state SET generation = ? WHERE id = 1`, d.GenBefore); err != nil {
				return err
			}
		}
	}
	return nil
}

func keyWhere(cols []string, idx []int, r []any) (string, []any) {
	parts := make([]string, 0, len(idx))
	args := make([]any, 0, len(idx))
	for _, i := range idx {
		parts = append(parts, cols[i]+` = ?`)
		args = append(args, r[i])
	}
	return strings.Join(parts, " AND "), args
}

// Revision is plan_state.revision: bumped by every write that changes a plan row.
func (s *Store) Revision(ctx context.Context) (int64, error) {
	var n int64
	err := s.q.QueryRowContext(ctx, `SELECT revision FROM plan_state WHERE id = 1`).Scan(&n)
	return n, err
}

// BumpRevision increments the revision and returns the new value.
func (s *Store) BumpRevision(ctx context.Context) (int64, error) {
	if _, err := s.q.ExecContext(ctx, `UPDATE plan_state SET revision = revision + 1 WHERE id = 1`); err != nil {
		return 0, err
	}
	return s.Revision(ctx)
}

// Snapshots.

// SnapshotsKept is how many undo tokens the store keeps; older ones are pruned.
const SnapshotsKept = 20

// Snapshot is one stored undo token: the revision right after its write and what to write back.
type Snapshot struct {
	Token    string
	Revision int64
	State    []byte
}

// SaveSnapshot stores a token and prunes all but the newest SnapshotsKept.
func (s *Store) SaveSnapshot(ctx context.Context, sn Snapshot) error {
	if _, err := s.q.ExecContext(ctx, `INSERT INTO plan_snapshots (token, revision, created_at, state_json) VALUES (?, ?, ?, ?)`,
		sn.Token, sn.Revision, s.now(), string(sn.State)); err != nil {
		return mapErr(err)
	}
	_, err := s.q.ExecContext(ctx, `DELETE FROM plan_snapshots WHERE rowid NOT IN (
		SELECT rowid FROM plan_snapshots ORDER BY rowid DESC LIMIT ?)`, SnapshotsKept)
	return err
}

// SnapshotOf reads a token; ErrNotFound when the store has none by that token.
func (s *Store) SnapshotOf(ctx context.Context, token string) (Snapshot, error) {
	var sn Snapshot
	var state string
	err := s.q.QueryRowContext(ctx, `SELECT token, revision, state_json FROM plan_snapshots WHERE token = ?`, token).
		Scan(&sn.Token, &sn.Revision, &state)
	if errors.Is(err, sql.ErrNoRows) {
		return Snapshot{}, ErrNotFound
	}
	sn.State = []byte(state)
	return sn, err
}

// Records of Cooked and Not cooked.

// Mark kinds.
const (
	MarkCooked    = "cooked"
	MarkNotCooked = "not_cooked"
)

// MarkRecord is what one Cooked or Not cooked mark of one Course did (cooked_takes).
type MarkRecord struct {
	ID               int64
	Date             string
	MealSlotID       int64
	CourseID         int64
	Kind             string
	MarkedOn         string // household date
	MarkedAt         string // RFC 3339, "" when unknown
	UserID           int64
	UserName         string
	Action           string // the Courses of one Mark all share it
	LotJSON          string
	PlanJSON         string // a RowDiff, "" when none
	LeftoverID       int64
	LeftoverPortions float64
	SourceLeftoverID int64
	SourceTaken      float64
	ReopenedAt       string
}

// AddMark stores a record. An open record left on the cell (its meal was opened again some other way) is closed first.
func (s *Store) AddMark(ctx context.Context, m MarkRecord) (int64, error) {
	lot := m.LotJSON
	if lot == "" {
		lot = "[]"
	}
	if _, err := s.q.ExecContext(ctx, `UPDATE cooked_takes SET reopened_at = ? WHERE reopened_at IS NULL AND date = ? AND
		meal_slot_id = ? AND course_id = ?`, s.now(), m.Date, m.MealSlotID, m.CourseID); err != nil {
		return 0, err
	}
	res, err := s.q.ExecContext(ctx, `INSERT INTO cooked_takes (date, meal_slot_id, course_id, kind, marked_on, marked_at, user_id,
		user_name, action, lot_json, plan_json, leftover_id, leftover_portions, source_leftover_id, source_taken)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		m.Date, m.MealSlotID, m.CourseID, m.Kind, m.MarkedOn, nullText(m.MarkedAt), nullInt(m.UserID), nullText(m.UserName),
		nullText(m.Action), lot, nullText(m.PlanJSON), nullInt(m.LeftoverID), m.LeftoverPortions, nullInt(m.SourceLeftoverID),
		m.SourceTaken)
	if err != nil {
		return 0, mapErr(err)
	}
	return res.LastInsertId()
}

func nullText(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func nullInt(n int64) any {
	if n == 0 {
		return nil
	}
	return n
}

var markCols = `id, date, meal_slot_id, course_id, kind, marked_on, marked_at, user_id, user_name, action, lot_json, plan_json,
	leftover_id, leftover_portions, source_leftover_id, source_taken, reopened_at`

func (s *Store) marks(ctx context.Context, where string, args ...any) ([]MarkRecord, error) {
	rows, err := s.q.QueryContext(ctx, `SELECT `+markCols+` FROM cooked_takes WHERE `+where+` ORDER BY id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []MarkRecord
	for rows.Next() {
		var m MarkRecord
		var at, name, action, planJSON, reopened sql.NullString
		var user, left, src sql.NullInt64
		if err := rows.Scan(&m.ID, &m.Date, &m.MealSlotID, &m.CourseID, &m.Kind, &m.MarkedOn, &at, &user, &name, &action,
			&m.LotJSON, &planJSON, &left, &m.LeftoverPortions, &src, &m.SourceTaken, &reopened); err != nil {
			return nil, err
		}
		m.MarkedAt, m.UserID, m.UserName, m.Action = at.String, user.Int64, name.String, action.String
		m.PlanJSON, m.LeftoverID, m.SourceLeftoverID, m.ReopenedAt = planJSON.String, left.Int64, src.Int64, reopened.String
		out = append(out, m)
	}
	return out, rows.Err()
}

// OpenMarks are the records not reopened of the Meal Slot occurrence (every Course), oldest first.
func (s *Store) OpenMarks(ctx context.Context, date string, mealSlotID int64) ([]MarkRecord, error) {
	return s.marks(ctx, `reopened_at IS NULL AND date = ? AND meal_slot_id = ?`, date, mealSlotID)
}

// OpenMarksOfAction are the records not reopened of one action (a Mark all), oldest first.
func (s *Store) OpenMarksOfAction(ctx context.Context, action string) ([]MarkRecord, error) {
	return s.marks(ctx, `reopened_at IS NULL AND action = ?`, action)
}

// OpenMarksBetween are the records not reopened of the meals dated from..to.
func (s *Store) OpenMarksBetween(ctx context.Context, from, to string) ([]MarkRecord, error) {
	return s.marks(ctx, `reopened_at IS NULL AND date >= ? AND date <= ?`, from, to)
}

// MarkReopened marks the records reopened at the store's now.
func (s *Store) MarkReopened(ctx context.Context, ids []int64) error {
	now := s.now()
	for _, id := range ids {
		if err := s.affectOne(ctx, `UPDATE cooked_takes SET reopened_at = ? WHERE id = ? AND reopened_at IS NULL`, now, id); err != nil {
			return err
		}
	}
	return nil
}
