package recipeassistant

import (
	"encoding/json"
	"fmt"
	"log/slog"
)

// Limits (design §1.5).
const (
	MaxRecipes       = 5
	MaxTextChars     = 50000 // pasted text, in characters (runes), after trimming
	MaxPageBytes     = 3 << 20
	MaxPageTextChars = 60000
	MaxJSONLDChars   = 30000
	MaxBaseURLChars  = 2048
	MaxModelIDChars  = 128

	DefaultBaseURL = "https://api.anthropic.com"
	DefaultModel   = "claude-haiku-5-5"
)

// ValidateBaseURL checks and normalises the Anthropic base URL (design §1.7):
// absolute; https, or http only for localhost, *.localhost, 127.0.0.1 or [::1];
// no userinfo, query (not even an empty one) or fragment; at most 2048
// characters; scheme and host lower-cased; trailing "/" trimmed. A path is
// allowed but not one ending in "/v1" (CodeBaseURLHasVersion); everything else
// is CodeBaseURLInvalid.
func ValidateBaseURL(raw string) (string, error) { return "", nil }

// OriginOf is scheme://host[:port] of a base URL in canonical form (lower
// case, the scheme's default port dropped); "" when it does not parse.
func OriginOf(baseURL string) string { return "" }

// OriginChanged reports whether scheme, host or port differ. A path change
// alone is not an origin change.
func OriginChanged(oldBase, newBase string) bool { return false }

// ValidateModelID accepts ^[A-Za-z0-9._:@/-]{1,128}$ (else CodeModelInvalid).
func ValidateModelID(id string) error { return nil }

// Secret is an API key in transit: every print, log and JSON encoding shows
// "[redacted]". Reveal returns the value for the one call that needs it.
type Secret string

func (s Secret) String() string               { return "" }
func (s Secret) GoString() string             { return "" }
func (s Secret) Format(f fmt.State, v rune)   {}
func (s Secret) LogValue() slog.Value         { return slog.StringValue("") }
func (s Secret) MarshalJSON() ([]byte, error) { return json.Marshal("") }

// Reveal returns the plaintext.
func (s Secret) Reveal() string { return string(s) }

// Last4 is the last four characters of a key of at least 8 characters, "" otherwise.
func Last4(key Secret) string { return "" }

// Settings is the saved configuration as the domain sees it (no key material).
type Settings struct {
	Enabled  bool
	BaseURL  string // normalised
	Model    string
	HasKey   bool
	KeyLast4 string
}

// DefaultSettings is the seed row: off, Anthropic, Haiku 5.5, no key.
func DefaultSettings() Settings { return Settings{} }

// Update is a PUT: the whole form. An empty APIKey keeps the saved key.
type Update struct {
	Enabled bool
	BaseURL string
	Model   string
	APIKey  Secret
}

// Change-history actions (design §4.3). Detail: base_url_changed and
// model_changed "old -> new"; key_saved, key_replaced, key_removed the last
// four characters; turned_on and turned_off empty.
const (
	ActionTurnedOn       = "turned_on"
	ActionTurnedOff      = "turned_off"
	ActionBaseURLChanged = "base_url_changed"
	ActionModelChanged   = "model_changed"
	ActionKeySaved       = "key_saved"
	ActionKeyReplaced    = "key_replaced"
	ActionKeyRemoved     = "key_removed"
)

// Change is one change-history row to write (one per changed field).
type Change struct{ Action, Detail string }

// Applied is the outcome of a valid update. NewKey is non-empty when a key
// must be sealed and stored (the old one, if any, is replaced); when the origin
// changed the old key is gone and NewKey is the replacement.
type Applied struct {
	Settings Settings
	NewKey   Secret
	Changes  []Change
}

// ApplyUpdate applies a PUT to the saved settings. Checks, in this order, each
// returning a *Error and changing nothing:
//  1. base URL, model ID, API key (trimmed; no whitespace or control
//     characters inside; at most 512 characters) -> CodeBaseURLInvalid,
//     CodeBaseURLHasVersion, CodeModelInvalid, CodeAPIKeyInvalid;
//  2. no secret key on the server and (Enabled or a key given) -> CodeSecretKeyMissing;
//  3. the origin changed, a key is saved and none is given -> CodeKeyRequiredNewBaseURL;
//  4. Enabled and no key would remain -> CodeAPIKeyRequired.
func ApplyUpdate(cur Settings, in Update, secretKeyAvailable bool) (Applied, error) {
	return Applied{}, nil
}

// ApplyKeyRemoval removes the saved key and turns the assistant off
// (changes: key_removed, plus turned_off if it was on); no key: no changes.
func ApplyKeyRemoval(cur Settings) Applied { return Applied{} }
