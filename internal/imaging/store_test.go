package imaging

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
)

func TestStoreRoundTrip(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "images") // does not exist yet
	s := NewStore(dir)
	id, err := s.Save([]byte("RIFFxxxxWEBPdata"))
	if err != nil {
		t.Fatal(err)
	}
	if !ValidID(id) || len(id) != 32 {
		t.Fatalf("id %q is not 32 hex characters", id)
	}
	f, err := s.Open(id)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := io.ReadAll(f)
	f.Close()
	if string(got) != "RIFFxxxxWEBPdata" {
		t.Errorf("read back %q", got)
	}
	id2, _ := s.Save([]byte("other"))
	if id2 == id {
		t.Error("ids must be unique")
	}
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if filepath.Ext(e.Name()) != ".webp" {
			t.Errorf("leftover file %q (temp files must be renamed or removed)", e.Name())
		}
	}
}

func TestStoreDeleteAndMissing(t *testing.T) {
	s := NewStore(t.TempDir())
	id, _ := s.Save([]byte("x"))
	if err := s.Delete(id); err != nil {
		t.Fatal(err)
	}
	if err := s.Delete(id); err != nil {
		t.Errorf("second Delete must be a no-op, got %v", err)
	}
	if _, err := s.Open(id); !errors.Is(err, ErrNotFound) {
		t.Errorf("Open after Delete: %v, want ErrNotFound", err)
	}
}

func TestValidIDRejectsTraversal(t *testing.T) {
	for _, bad := range []string{"", "../etc/passwd", "..", "a/b", "ABCDEF0123456789ABCDEF0123456789", "0123456789abcdef0123456789abcde", "0123456789abcdef0123456789abcdef0", "0123456789abcdef0123456789abcdeg", "0123456789abcdef0123456789abcdef.webp"} {
		if ValidID(bad) {
			t.Errorf("ValidID(%q) = true", bad)
		}
	}
	if !ValidID("0123456789abcdef0123456789abcdef") {
		t.Error("valid id rejected")
	}
	s := NewStore(t.TempDir())
	if _, err := s.Open("../../etc/passwd"); !errors.Is(err, ErrNotFound) {
		t.Errorf("Open(traversal) = %v, want ErrNotFound", err)
	}
	if err := s.Delete("../x"); err != nil {
		t.Errorf("Delete(invalid id) = %v, want nil", err)
	}
}
