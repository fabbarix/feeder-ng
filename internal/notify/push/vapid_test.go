package push_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/notify/push"
)

func TestFirstStartGeneratesAndStoresTheKeysUnderTheDataDir(t *testing.T) {
	dir := t.TempDir()
	v, err := push.LoadOrCreateVAPID(dir)
	if err != nil {
		t.Fatal(err)
	}
	if v.PublicKey == "" || v.PrivateKey == "" || v.PublicKey == v.PrivateKey {
		t.Fatalf("keys %+v", v)
	}
	info, err := os.Stat(filepath.Join(dir, push.VAPIDFile))
	if err != nil {
		t.Fatalf("keys were not stored: %v", err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Errorf("mode %v, want 0600", info.Mode().Perm())
	}
}

func TestTheSameKeysComeBackAfterARestart(t *testing.T) {
	dir := t.TempDir()
	a, err := push.LoadOrCreateVAPID(dir)
	if err != nil {
		t.Fatal(err)
	}
	b, err := push.LoadOrCreateVAPID(dir)
	if err != nil || a != b {
		t.Fatalf("second load = %+v, %v; want %+v", b, err, a)
	}
}

func TestACreatesTheDataDirWhenMissing(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "nested", "data")
	if _, err := push.LoadOrCreateVAPID(dir); err != nil {
		t.Fatal(err)
	}
}

func TestACorruptKeyFileIsAnErrorAndIsLeftAlone(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, push.VAPIDFile)
	if err := os.WriteFile(path, []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := push.LoadOrCreateVAPID(dir); err == nil {
		t.Fatal("want an error for a corrupt key file")
	}
	got, _ := os.ReadFile(path)
	if string(got) != "{not json" {
		t.Errorf("the corrupt file was overwritten: %q", got)
	}
}

func TestAKeyFileWithMissingKeysIsAnError(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, push.VAPIDFile), []byte(`{"publicKey":"x"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := push.LoadOrCreateVAPID(dir); err == nil {
		t.Fatal("want an error when the private key is missing")
	}
}
