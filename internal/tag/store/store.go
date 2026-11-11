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

var errTODO = errors.New("tag/store: not implemented (TG-A developer)")

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

// List returns every Tag ordered by lower(name), then id, with its counts.
func (s *Store) List(ctx context.Context) ([]tag.Listing, error) { return nil, errTODO }

// Get returns one Tag; tag.ErrNotFound.
func (s *Store) Get(ctx context.Context, id int64) (tag.Tag, error) { return tag.Tag{}, errTODO }

// Create adds a Tag. An empty colour takes tag.NextColour over the current counts, in the same
// transaction. tag.ErrNameInvalid, tag.ErrColourUnknown, *tag.NameTakenError.
func (s *Store) Create(ctx context.Context, name, colour string) (tag.Tag, error) {
	return tag.Tag{}, errTODO
}

// Update renames and/or recolours a Tag (nil leaves a field alone). A new spelling with the
// same key changes the name only; a new key rewrites the rules on the old key as tag.Merge says
// against the rules already on the new key. tag.ErrNotFound, ErrNameInvalid, ErrColourUnknown,
// *tag.NameTakenError (another Tag has the key; nothing changes).
func (s *Store) Update(ctx context.Context, id int64, name, colour *string) (Result, error) {
	return Result{}, errTODO
}

// Impact lists what Merge or Delete of the Tag touches. tag.ErrNotFound.
func (s *Store) Impact(ctx context.Context, id int64) (tag.Impact, error) {
	return tag.Impact{}, errTODO
}

// Merge moves Tag id onto Tag into and removes id. tag.ErrNotFound (id), tag.ErrMergeSelf,
// tag.ErrMergeTarget (into unknown).
func (s *Store) Merge(ctx context.Context, id, into int64) (Result, error) { return Result{}, errTODO }

// Delete removes the Tag from every Recipe, removes the rules naming its key and the Tag.
// tag.ErrNotFound.
func (s *Store) Delete(ctx context.Context, id int64) (Result, error) { return Result{}, errTODO }

// Exists reports whether a Tag has the key (already tag.NameKey'd by the caller).
func (s *Store) Exists(ctx context.Context, key string) (bool, error) { return false, errTODO }

// EnsureTx returns the id of the Tag with name's key, creating it with the next colour when
// there is none (the first spelling is kept). The one place a Tag is created on use; the Recipe
// repository calls it from writeContent.
func EnsureTx(ctx context.Context, tx *sql.Tx, name string) (int64, error) { return 0, errTODO }
