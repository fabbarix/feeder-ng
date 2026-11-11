package imaging

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Entry is one stored image as listed by Store.List.
type Entry struct {
	ID      string
	ModTime time.Time
	Size    int64
}

// SaveAt is Save with the file's modification time set to at (the household clock), so the orphan sweep ages
// an upload by the application clock and tests can drive it with a fake one.
func (s *Store) SaveAt(data []byte, at time.Time) (string, error) {
	id, err := s.Save(data)
	if err != nil {
		return "", err
	}
	if err := os.Chtimes(s.path(id), at, at); err != nil {
		_ = os.Remove(s.path(id))
		return "", err
	}
	return id, nil
}

// List returns every stored image (<id>.webp with a valid id); temp files and strangers are ignored. Order unspecified.
func (s *Store) List() ([]Entry, error) {
	des, err := os.ReadDir(s.dir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var out []Entry
	for _, de := range des {
		name := de.Name()
		id, ok := strings.CutSuffix(name, ".webp")
		if !ok || !ValidID(id) || !de.Type().IsRegular() {
			continue
		}
		info, err := de.Info()
		if err != nil {
			continue // vanished between the listing and the stat
		}
		out = append(out, Entry{ID: id, ModTime: info.ModTime(), Size: info.Size()})
	}
	return out, nil
}

// RemoveTemp deletes the ".tmp-*" files left by a crashed Save whose modification time is before the cutoff, and
// returns how many it removed.
func (s *Store) RemoveTemp(before time.Time) (int, error) {
	des, err := os.ReadDir(s.dir)
	if errors.Is(err, fs.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	n := 0
	for _, de := range des {
		if !strings.HasPrefix(de.Name(), ".tmp-") || !de.Type().IsRegular() {
			continue
		}
		info, err := de.Info()
		if err != nil || !info.ModTime().Before(before) {
			continue
		}
		if err := os.Remove(filepath.Join(s.dir, de.Name())); err == nil {
			n++
		}
	}
	return n, nil
}
