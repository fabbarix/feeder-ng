package imaging

import (
	"os"
	"path/filepath"
	"sort"
	"testing"
	"time"
)

func TestSaveAtSetsTheModTime(t *testing.T) {
	s := NewStore(t.TempDir())
	at := time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)
	id, err := s.SaveAt([]byte("webp"), at)
	if err != nil {
		t.Fatal(err)
	}
	if !ValidID(id) || !s.Exists(id) {
		t.Fatalf("SaveAt must store the file under a valid id, got %q", id)
	}
	list, err := s.List()
	if err != nil || len(list) != 1 {
		t.Fatalf("List = %v, %v", list, err)
	}
	if list[0].ID != id || !list[0].ModTime.Equal(at) || list[0].Size != 4 {
		t.Errorf("entry = %+v, want id %s, mtime %v, size 4", list[0], id, at)
	}
}

func TestListIgnoresTempFilesAndStrangers(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir)
	a, _ := s.SaveAt([]byte("a"), time.Now())
	b, _ := s.SaveAt([]byte("b"), time.Now())
	for _, name := range []string{".tmp-123", "notes.txt", "short.webp", "ABCDEF0123456789ABCDEF0123456789.webp"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Mkdir(filepath.Join(dir, "0123456789abcdef0123456789abcdef.webp"), 0o755); err != nil { // a directory is not an image
		t.Fatal(err)
	}
	list, err := s.List()
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, e := range list {
		got = append(got, e.ID)
	}
	want := []string{a, b}
	sort.Strings(got)
	sort.Strings(want)
	if len(got) != 2 || got[0] != want[0] || got[1] != want[1] {
		t.Errorf("List ids = %v, want %v", got, want)
	}
}

func TestListOfAMissingDirectoryIsEmpty(t *testing.T) {
	list, err := NewStore(filepath.Join(t.TempDir(), "never-created")).List()
	if err != nil || len(list) != 0 {
		t.Errorf("List = %v, %v; want empty and no error", list, err)
	}
}

func TestRemoveTempDeletesOnlyStaleTempFiles(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir)
	keep, _ := s.SaveAt([]byte("k"), time.Now().Add(-100*time.Hour))
	old := filepath.Join(dir, ".tmp-old")
	fresh := filepath.Join(dir, ".tmp-fresh")
	for _, p := range []string{old, fresh} {
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	cutoff := time.Now().Add(-time.Hour)
	if err := os.Chtimes(old, cutoff.Add(-time.Minute), cutoff.Add(-time.Minute)); err != nil {
		t.Fatal(err)
	}
	n, err := s.RemoveTemp(cutoff)
	if err != nil || n != 1 {
		t.Fatalf("RemoveTemp = %d, %v; want 1, nil", n, err)
	}
	if _, err := os.Stat(old); !os.IsNotExist(err) {
		t.Error("the stale temp file must be removed")
	}
	if _, err := os.Stat(fresh); err != nil {
		t.Error("a fresh temp file may be an upload in flight and must stay")
	}
	if !s.Exists(keep) {
		t.Error("RemoveTemp must never touch stored images, however old")
	}
}
