// Package secretbox encrypts small secrets (the Recipe Assistant's API key)
// at rest: AES-256-GCM with a subkey derived from FEEDER_SECRET_KEY by
// HKDF-SHA256. Crypto only: no file IO, no environment, no logging of any
// key or plaintext. See docs/dev/design/ai-recipe-import.md §4.1.
package secretbox

import (
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
	"strings"
)

// Fixed derivation inputs (part of the stored format; never change them).
const (
	// HKDFInfo is the HKDF info string of the API key subkey.
	HKDFInfo = "feeder/recipe-assistant/api-key/v1"
	// APIKeyAAD is the additional authenticated data of Seal and Open.
	APIKeyAAD = "recipe_assistant_settings.api_key.v1"
	// NonceSize is the GCM nonce length stored in front of the ciphertext.
	NonceSize = 12
	// KeyIDLabel is the HMAC message of MasterKey.ID.
	KeyIDLabel = "feeder key id"
)

// Errors (matched with errors.Is). Their texts never contain key material or plaintext.
var (
	ErrMasterKeyMalformed = errors.New("secretbox: the secret key must be base64 of exactly 32 bytes")
	ErrDecrypt            = errors.New("secretbox: cannot decrypt")
)

// MasterKey is the 32-byte FEEDER_SECRET_KEY. Every formatting verb and slog
// print "[redacted]".
type MasterKey struct{ b [32]byte }

const redacted = "[redacted]"

// ParseMasterKey decodes base64 (standard or URL alphabet, padding optional)
// that must decode to exactly 32 bytes (ErrMasterKeyMalformed otherwise). The
// error never echoes the input.
func ParseMasterKey(s string) (MasterKey, error) {
	s = strings.TrimRight(strings.TrimSpace(s), "=")
	b, err := base64.RawStdEncoding.DecodeString(s)
	if err != nil {
		b, err = base64.RawURLEncoding.DecodeString(s)
	}
	if err != nil || len(b) != 32 {
		return MasterKey{}, ErrMasterKeyMalformed
	}
	var m MasterKey
	copy(m.b[:], b)
	return m, nil
}

// ID is the first 8 bytes of HMAC-SHA256(master, KeyIDLabel) in hex (16
// characters): stored beside the ciphertext to notice a different master key.
func (m MasterKey) ID() string {
	mac := hmac.New(sha256.New, m.b[:])
	mac.Write([]byte(KeyIDLabel))
	return hex.EncodeToString(mac.Sum(nil)[:8])
}

// String returns "[redacted]".
func (m MasterKey) String() string { return redacted }

// Format prints "[redacted]" under every verb.
func (m MasterKey) Format(f fmt.State, _ rune) { _, _ = f.Write([]byte(redacted)) }

// LogValue returns the string "[redacted]".
func (m MasterKey) LogValue() slog.Value { return slog.StringValue(redacted) }

// Box seals and opens with the subkey HKDF-SHA256(master, nil, HKDFInfo).
type Box struct{ aead cipher.AEAD }

// New derives the subkey.
func New(m MasterKey) (*Box, error) {
	sub, err := hkdf.Key(sha256.New, m.b[:], nil, HKDFInfo, 32)
	if err != nil {
		return nil, err
	}
	blk, err := aes.NewCipher(sub)
	if err != nil {
		return nil, err
	}
	g, err := cipher.NewGCMWithNonceSize(blk, NonceSize)
	if err != nil {
		return nil, err
	}
	return &Box{aead: g}, nil
}

// Seal returns nonce || ciphertext || tag with a fresh random nonce and APIKeyAAD.
func (b *Box) Seal(plaintext []byte) ([]byte, error) { return b.SealAAD(APIKeyAAD, plaintext) }

// Open reverses Seal. Any failure (wrong key, wrong AAD, tampering, too short)
// is ErrDecrypt and returns no bytes.
func (b *Box) Open(blob []byte) ([]byte, error) { return b.OpenAAD(APIKeyAAD, blob) }

// SealAAD and OpenAAD are Seal and Open with another AAD (one purpose per AAD).
func (b *Box) SealAAD(aad string, plaintext []byte) ([]byte, error) {
	nonce := make([]byte, NonceSize, NonceSize+len(plaintext)+b.aead.Overhead())
	if _, err := rand.Read(nonce); err != nil {
		return nil, errors.New("secretbox: cannot encrypt")
	}
	return b.aead.Seal(nonce, nonce, plaintext, []byte(aad)), nil
}

// OpenAAD is Open with an explicit AAD.
func (b *Box) OpenAAD(aad string, blob []byte) ([]byte, error) {
	if len(blob) < NonceSize+b.aead.Overhead() {
		return nil, ErrDecrypt
	}
	pt, err := b.aead.Open(nil, blob[:NonceSize], blob[NonceSize:], []byte(aad))
	if err != nil {
		return nil, ErrDecrypt
	}
	return pt, nil
}

// String returns "[redacted]"; Box has no other printable state.
func (b *Box) String() string { return redacted }

// Format prints "[redacted]" under every verb.
func (b *Box) Format(f fmt.State, _ rune) { _, _ = f.Write([]byte(redacted)) }

// LogValue returns the string "[redacted]".
func (b *Box) LogValue() slog.Value { return slog.StringValue(redacted) }
