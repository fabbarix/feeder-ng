// Package refs answers "which image ids does the database still use?" for the orphan sweep: every (table, column)
// that holds an internal/imaging id is listed in Default. A new image field (Ingredient images) adds one line there.
//
// IP1 stubs: the Developer implements them.
package refs

import (
	"context"
	"database/sql"
	"errors"
)

// Column is a TEXT column holding an image id ('' = none).
type Column struct{ Table, Column string }

// Default lists the columns that hold image ids today.
var Default = []Column{}

// Columns implements images.Referencer over SQL.
type Columns struct{}

// New returns a Referencer over cols (Default when none). Identifiers must match [a-z_][a-z0-9_]* or ReferencedIDs fails.
func New(d *sql.DB, cols ...Column) *Columns { return &Columns{} }

// ReferencedIDs returns the non-empty ids found in every column. A missing table or column, or a bad identifier, is an error.
func (c *Columns) ReferencedIDs(ctx context.Context) (map[string]bool, error) {
	return nil, errors.New("refs: not implemented")
}
