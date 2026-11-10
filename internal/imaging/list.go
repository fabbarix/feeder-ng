package imaging

import (
	"errors"
	"time"
)

// IP1 stubs: the Developer implements these (docs/dev/design/ip1-imagepicker.md, "Store additions").

// Entry is one stored image as listed by Store.List.
type Entry struct {
	ID      string
	ModTime time.Time
	Size    int64
}

// SaveAt is Save with the file's modification time set to at (the household clock), so the orphan sweep ages
// an upload by the application clock and tests can drive it with a fake one.
func (s *Store) SaveAt(data []byte, at time.Time) (string, error) {
	return "", errors.New("imaging: SaveAt not implemented")
}

// List returns every stored image (<id>.webp with a valid id); temp files and strangers are ignored. Order unspecified.
func (s *Store) List() ([]Entry, error) {
	return nil, errors.New("imaging: List not implemented")
}

// RemoveTemp deletes the ".tmp-*" files left by a crashed Save whose modification time is before the cutoff, and
// returns how many it removed.
func (s *Store) RemoveTemp(before time.Time) (int, error) {
	return 0, errors.New("imaging: RemoveTemp not implemented")
}
