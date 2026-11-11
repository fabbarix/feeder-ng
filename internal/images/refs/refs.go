// Package refs answers "which image ids does the database still use?" for the orphan sweep: every (table, column)
// that holds an internal/imaging id is listed in Default. A new image field (Ingredient images) adds one line there.
package refs

import (
	"context"
	"database/sql"
	"fmt"
	"regexp"
)

// Column is a TEXT column holding an image id (” = none).
type Column struct{ Table, Column string }

// Default lists the columns that hold image ids today. A new image field MUST add its column here, or the
// nightly sweep deletes its photos after 24 hours.
var Default = []Column{
	{"recipes", "image"},
	{"recipe_steps", "image"},
	{"ingredients", "image"},
	{"members", "photo"},
}

// Columns implements images.Referencer over SQL.
type Columns struct {
	db   *sql.DB
	cols []Column
}

// New returns a Referencer over cols (Default when none). Identifiers must match [a-z_][a-z0-9_]* or ReferencedIDs fails.
func New(d *sql.DB, cols ...Column) *Columns {
	if len(cols) == 0 {
		cols = Default
	}
	return &Columns{db: d, cols: cols}
}

var ident = regexp.MustCompile(`^[a-z_][a-z0-9_]*$`)

// ReferencedIDs returns the non-empty ids found in every column. A missing table or column, or a bad identifier, is an error.
func (c *Columns) ReferencedIDs(ctx context.Context) (map[string]bool, error) {
	out := map[string]bool{}
	for _, col := range c.cols {
		if !ident.MatchString(col.Table) || !ident.MatchString(col.Column) {
			return nil, fmt.Errorf("refs: unsafe identifier %q.%q", col.Table, col.Column)
		}
		// Identifiers were validated above and cannot be bound as parameters.
		q := fmt.Sprintf(`SELECT DISTINCT %s FROM %s WHERE %s IS NOT NULL AND %s <> ''`, col.Column, col.Table, col.Column, col.Column)
		rows, err := c.db.QueryContext(ctx, q)
		if err != nil {
			return nil, fmt.Errorf("refs: %s.%s: %w", col.Table, col.Column, err)
		}
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return nil, err
			}
			out[id] = true
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}
	return out, nil
}

// IsReferenced reports whether id is held by any listed column, with one targeted query per column.
func (c *Columns) IsReferenced(ctx context.Context, id string) (bool, error) {
	for _, col := range c.cols {
		if !ident.MatchString(col.Table) || !ident.MatchString(col.Column) {
			return false, fmt.Errorf("refs: unsafe identifier %q.%q", col.Table, col.Column)
		}
		q := fmt.Sprintf(`SELECT EXISTS(SELECT 1 FROM %s WHERE %s = ?)`, col.Table, col.Column)
		var found bool
		if err := c.db.QueryRowContext(ctx, q, id).Scan(&found); err != nil {
			return false, fmt.Errorf("refs: %s.%s: %w", col.Table, col.Column, err)
		}
		if found {
			return true, nil
		}
	}
	return false, nil
}
