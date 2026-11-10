// Package secretbox encrypts small secrets (the Recipe Assistant's API key)
// at rest: AES-256-GCM with a subkey derived from FEEDER_SECRET_KEY by
// HKDF-SHA256. Crypto only: no file IO, no environment, no logging of any
// key or plaintext. See docs/dev/design/ai-recipe-import.md §4.1.
//
// STUB: signatures only.
package secretbox

import (
	"errors"
	"log/slog"
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

// ParseMasterKey decodes base64 (standard or URL alphabet, padding optional)
// that must decode to exactly 32 bytes (ErrMasterKeyMalformed otherwise). The
// error never echoes the input.
func ParseMasterKey(s string) (MasterKey, error) { return MasterKey{}, errors.New("not implemented") }

// ID is the first 8 bytes of HMAC-SHA256(master, KeyIDLabel) in hex (16
// characters): stored beside the ciphertext to notice a different master key.
func (m MasterKey) ID() string { return "" }

// String returns "[redacted]".
func (m MasterKey) String() string { return "" }

// LogValue returns the string "[redacted]".
func (m MasterKey) LogValue() slog.Value { return slog.StringValue("") }

// Box seals and opens with the subkey HKDF-SHA256(master, nil, HKDFInfo).
type Box struct{}

// New derives the subkey.
func New(m MasterKey) (*Box, error) { return nil, errors.New("not implemented") }

// Seal returns nonce || ciphertext || tag with a fresh random nonce and APIKeyAAD.
func (b *Box) Seal(plaintext []byte) ([]byte, error) { return nil, errors.New("not implemented") }

// Open reverses Seal. Any failure (wrong key, wrong AAD, tampering, too short)
// is ErrDecrypt and returns no bytes.
func (b *Box) Open(blob []byte) ([]byte, error) { return nil, errors.New("not implemented") }

// SealAAD and OpenAAD are Seal and Open with another AAD (one purpose per AAD).
func (b *Box) SealAAD(aad string, plaintext []byte) ([]byte, error) {
	return nil, errors.New("not implemented")
}

// OpenAAD is Open with an explicit AAD.
func (b *Box) OpenAAD(aad string, blob []byte) ([]byte, error) {
	return nil, errors.New("not implemented")
}

// String returns "[redacted]"; Box has no other printable state.
func (b *Box) String() string { return "" }
