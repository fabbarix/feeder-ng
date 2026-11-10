package secretbox_test

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hkdf"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/secretbox"
)

func rawKey(t *testing.T) []byte {
	t.Helper()
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		t.Fatal(err)
	}
	return b
}

func master(t *testing.T, raw []byte) secretbox.MasterKey {
	t.Helper()
	m, err := secretbox.ParseMasterKey(base64.StdEncoding.EncodeToString(raw))
	if err != nil {
		t.Fatal(err)
	}
	return m
}

func box(t *testing.T) (*secretbox.Box, []byte) {
	t.Helper()
	raw := rawKey(t)
	b, err := secretbox.New(master(t, raw))
	if err != nil {
		t.Fatal(err)
	}
	return b, raw
}

// ---- ParseMasterKey -------------------------------------------------------

func TestParseMasterKeyAcceptsBothAlphabetsWithOrWithoutPadding(t *testing.T) {
	raw := []byte("0123456789abcdef0123456789abcdef") // 32 bytes
	// Bytes chosen so that the std and URL alphabets differ.
	raw[0], raw[1], raw[2] = 0xfb, 0xff, 0xbe
	for name, enc := range map[string]string{
		"std padded": base64.StdEncoding.EncodeToString(raw),
		"std raw":    base64.RawStdEncoding.EncodeToString(raw),
		"url padded": base64.URLEncoding.EncodeToString(raw),
		"url raw":    base64.RawURLEncoding.EncodeToString(raw),
	} {
		m, err := secretbox.ParseMasterKey(enc)
		if err != nil {
			t.Errorf("%s: %v", name, err)
			continue
		}
		if m.ID() != master(t, raw).ID() {
			t.Errorf("%s: decoded to a different key", name)
		}
	}
}

func TestParseMasterKeyRejectsMalformedValuesWithoutEchoingThem(t *testing.T) {
	for name, v := range map[string]string{
		"empty":       "",
		"not base64":  "this is !!! not base64 at all, secret-ish",
		"16 bytes":    base64.StdEncoding.EncodeToString(make([]byte, 16)),
		"31 bytes":    base64.StdEncoding.EncodeToString(make([]byte, 31)),
		"33 bytes":    base64.StdEncoding.EncodeToString(make([]byte, 33)),
		"64 bytes":    base64.StdEncoding.EncodeToString(make([]byte, 64)),
		"hex of 32":   hex.EncodeToString(make([]byte, 32)), // 64 chars of hex is valid base64 but 48 bytes
		"mixed alpha": "ab+/-_" + strings.Repeat("A", 38),
	} {
		_, err := secretbox.ParseMasterKey(v)
		if !errors.Is(err, secretbox.ErrMasterKeyMalformed) {
			t.Errorf("%s: got %v, want ErrMasterKeyMalformed", name, err)
			continue
		}
		if v != "" && strings.Contains(err.Error(), v) {
			t.Errorf("%s: the error echoes the value: %q", name, err)
		}
	}
}

func TestMasterKeyIDIsAStableHMACPrefix(t *testing.T) {
	raw := rawKey(t)
	mac := hmac.New(sha256.New, raw)
	mac.Write([]byte("feeder key id"))
	want := hex.EncodeToString(mac.Sum(nil)[:8])
	got := master(t, raw).ID()
	if got != want || len(got) != 16 {
		t.Fatalf("ID = %q, want %q", got, want)
	}
	if other := master(t, rawKey(t)).ID(); other == got {
		t.Fatal("two keys share an ID")
	}
	if strings.Contains(got, hex.EncodeToString(raw[:4])) {
		t.Fatal("the ID must not leak key bytes")
	}
}

// ---- Seal / Open ----------------------------------------------------------

func TestRoundTrip(t *testing.T) {
	b, _ := box(t)
	for _, pt := range []string{"sk-ant-api03-abcdef", "", "ünïcode 🔑", strings.Repeat("k", 4096)} {
		blob, err := b.Seal([]byte(pt))
		if err != nil {
			t.Fatal(err)
		}
		got, err := b.Open(blob)
		if err != nil || string(got) != pt {
			t.Fatalf("round trip of %d bytes: %q, %v", len(pt), got, err)
		}
	}
}

func TestStoredFormatIsNonceCiphertextUnderAnHKDFSubkey(t *testing.T) {
	b, raw := box(t)
	pt := []byte("sk-ant-secret")
	blob, err := b.Seal(pt)
	if err != nil {
		t.Fatal(err)
	}
	if len(blob) != secretbox.NonceSize+len(pt)+16 {
		t.Fatalf("len = %d, want nonce(12) + plaintext + tag(16)", len(blob))
	}
	if bytes.Contains(blob, pt) {
		t.Fatal("the plaintext appears in the stored blob")
	}
	// Re-derive independently: this pins the algorithm, subkey info and AAD.
	sub, err := hkdf.Key(sha256.New, raw, nil, "feeder/recipe-assistant/api-key/v1", 32)
	if err != nil {
		t.Fatal(err)
	}
	blk, _ := aes.NewCipher(sub)
	gcm, _ := cipher.NewGCM(blk)
	got, err := gcm.Open(nil, blob[:12], blob[12:], []byte("recipe_assistant_settings.api_key.v1"))
	if err != nil || !bytes.Equal(got, pt) {
		t.Fatalf("independent decrypt: %q %v", got, err)
	}
	// The master key itself is not the AES key.
	blk2, _ := aes.NewCipher(raw)
	gcm2, _ := cipher.NewGCM(blk2)
	if _, err := gcm2.Open(nil, blob[:12], blob[12:], []byte(secretbox.APIKeyAAD)); err == nil {
		t.Fatal("the ciphertext opens under the raw master key: no subkey derivation")
	}
}

func TestNoncesAreUnique(t *testing.T) {
	b, _ := box(t)
	seen := map[string]bool{}
	cts := map[string]bool{}
	for i := 0; i < 2000; i++ {
		blob, err := b.Seal([]byte("same plaintext"))
		if err != nil {
			t.Fatal(err)
		}
		n := string(blob[:secretbox.NonceSize])
		if seen[n] {
			t.Fatalf("nonce reused after %d seals", i)
		}
		seen[n] = true
		if cts[string(blob)] {
			t.Fatal("identical blobs for identical plaintext")
		}
		cts[string(blob)] = true
	}
}

func TestOpenFailsCleanlyWithTheWrongMasterKey(t *testing.T) {
	a, _ := box(t)
	other, _ := box(t)
	secret := "sk-ant-very-secret-value"
	blob, _ := a.Seal([]byte(secret))
	got, err := other.Open(blob)
	if !errors.Is(err, secretbox.ErrDecrypt) {
		t.Fatalf("got %v, want ErrDecrypt", err)
	}
	if got != nil {
		t.Fatalf("a failed Open returned %d bytes", len(got))
	}
	if strings.Contains(err.Error(), secret) {
		t.Fatal("the error contains the plaintext")
	}
}

func TestOpenFailsOnTamperingTruncationAndGarbage(t *testing.T) {
	b, _ := box(t)
	blob, _ := b.Seal([]byte("sk-ant-x"))
	for i := range blob {
		bad := bytes.Clone(blob)
		bad[i] ^= 0x01
		if _, err := b.Open(bad); !errors.Is(err, secretbox.ErrDecrypt) {
			t.Fatalf("flipping byte %d: got %v, want ErrDecrypt", i, err)
		}
	}
	for _, short := range [][]byte{nil, {}, blob[:1], blob[:secretbox.NonceSize], blob[:secretbox.NonceSize+15], blob[:len(blob)-1]} {
		if _, err := b.Open(short); !errors.Is(err, secretbox.ErrDecrypt) {
			t.Fatalf("%d-byte blob: got %v, want ErrDecrypt", len(short), err)
		}
	}
	if _, err := b.Open(append(bytes.Clone(blob), 0)); !errors.Is(err, secretbox.ErrDecrypt) {
		t.Fatal("trailing byte accepted")
	}
}

func TestTheAADBindsTheCiphertextToItsPurpose(t *testing.T) {
	b, _ := box(t)
	blob, _ := b.SealAAD("some.other.purpose.v1", []byte("v"))
	if _, err := b.Open(blob); !errors.Is(err, secretbox.ErrDecrypt) {
		t.Fatalf("Open (API key AAD) of another purpose: got %v", err)
	}
	got, err := b.OpenAAD("some.other.purpose.v1", blob)
	if err != nil || string(got) != "v" {
		t.Fatalf("OpenAAD: %q %v", got, err)
	}
	apiKey, _ := b.Seal([]byte("v"))
	if _, err := b.OpenAAD("some.other.purpose.v1", apiKey); !errors.Is(err, secretbox.ErrDecrypt) {
		t.Fatalf("wrong AAD: got %v", err)
	}
	same, err := b.OpenAAD(secretbox.APIKeyAAD, apiKey)
	if err != nil || string(same) != "v" {
		t.Fatalf("Open is OpenAAD(APIKeyAAD): %q %v", same, err)
	}
}

// ---- Never printed --------------------------------------------------------

func TestKeysAndBoxesPrintRedactedUnderEveryVerb(t *testing.T) {
	raw := rawKey(t)
	m := master(t, raw)
	b, err := secretbox.New(m)
	if err != nil {
		t.Fatal(err)
	}
	leaks := []string{
		base64.StdEncoding.EncodeToString(raw), base64.URLEncoding.EncodeToString(raw),
		base64.RawStdEncoding.EncodeToString(raw), hex.EncodeToString(raw), fmt.Sprint(raw),
	}
	for _, v := range []any{m, &m, b} {
		for _, verb := range []string{"%v", "%+v", "%#v", "%s", "%q", "%x", "%d"} {
			out := fmt.Sprintf(verb, v)
			for _, l := range leaks {
				if strings.Contains(out, l) {
					t.Errorf("%s of %T leaks the key: %q", verb, v, out)
				}
			}
		}
	}
	if m.String() != "[redacted]" || b.String() != "[redacted]" {
		t.Fatalf("String() = %q / %q", m.String(), b.String())
	}
	var buf bytes.Buffer
	slog.New(slog.NewTextHandler(&buf, nil)).Info("start", "secret", m, "box", b, slog.Any("grp", struct{ K secretbox.MasterKey }{m}))
	for _, l := range leaks {
		if strings.Contains(buf.String(), l) {
			t.Fatalf("slog output leaks the key: %q", buf.String())
		}
	}
	if !strings.Contains(buf.String(), "[redacted]") {
		t.Fatalf("slog output = %q, want [redacted]", buf.String())
	}
}

func TestErrorsNeverContainThePlaintextOrKeys(t *testing.T) {
	b, raw := box(t)
	pt := "sk-ant-PLAINTEXT-MARKER"
	blob, _ := b.Seal([]byte(pt))
	blob[len(blob)-1] ^= 1
	_, err := b.Open(blob)
	_, perr := secretbox.ParseMasterKey(base64.StdEncoding.EncodeToString(raw[:20]))
	for _, e := range []error{err, perr} {
		if e == nil {
			t.Fatal("expected an error")
		}
		for _, bad := range []string{pt, base64.StdEncoding.EncodeToString(raw[:20]), base64.StdEncoding.EncodeToString(raw)} {
			if strings.Contains(e.Error(), bad) {
				t.Fatalf("%q contains %q", e, bad)
			}
		}
	}
}

func TestNoFileIsEverCreated(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	t.Setenv("HOME", dir)
	t.Setenv("TMPDIR", dir)
	b, raw := box(t)
	blob, _ := b.Seal([]byte("k"))
	_, _ = b.Open(blob)
	_, _ = secretbox.ParseMasterKey(base64.StdEncoding.EncodeToString(raw))
	_, _ = secretbox.ParseMasterKey("bad")
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 0 {
		t.Fatalf("secretbox created files: %v %v", entries, err)
	}
}
