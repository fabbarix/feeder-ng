package recipeassistant

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/url"
	"strings"
	"unicode"
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
func ValidateBaseURL(raw string) (string, error) {
	bad := &Error{Code: CodeBaseURLInvalid}
	raw = strings.TrimSpace(raw)
	if raw == "" || len(raw) > MaxBaseURLChars || strings.ContainsAny(raw, "?#") {
		return "", bad
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" {
		return "", bad
	}
	scheme := strings.ToLower(u.Scheme)
	host := strings.ToLower(u.Host)
	switch scheme {
	case "https":
	case "http":
		h := strings.ToLower(u.Hostname())
		if h != "localhost" && !strings.HasSuffix(h, ".localhost") && h != "127.0.0.1" && h != "::1" {
			return "", bad
		}
	default:
		return "", bad
	}
	path := strings.TrimRight(u.EscapedPath(), "/")
	if strings.HasSuffix(path, "/v1") {
		return "", &Error{Code: CodeBaseURLHasVersion}
	}
	return scheme + "://" + host + path, nil
}

// OriginOf is scheme://host[:port] of a base URL in canonical form (lower
// case, the scheme's default port dropped); "" when it does not parse.
func OriginOf(baseURL string) string {
	u, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil || u.Scheme == "" || u.Hostname() == "" {
		return ""
	}
	scheme := strings.ToLower(u.Scheme)
	host := strings.ToLower(u.Hostname())
	if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	port := u.Port()
	if (scheme == "https" && port == "443") || (scheme == "http" && port == "80") {
		port = ""
	}
	if port != "" {
		host += ":" + port
	}
	return scheme + "://" + host
}

// OriginChanged reports whether scheme, host or port differ. A path change
// alone is not an origin change.
func OriginChanged(oldBase, newBase string) bool { return OriginOf(oldBase) != OriginOf(newBase) }

// ValidateModelID accepts ^[A-Za-z0-9._:@/-]{1,128}$ (else CodeModelInvalid).
func ValidateModelID(id string) error {
	if id == "" || len(id) > MaxModelIDChars {
		return &Error{Code: CodeModelInvalid}
	}
	for _, r := range id {
		ok := r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || strings.ContainsRune("._:@/-", r)
		if !ok {
			return &Error{Code: CodeModelInvalid}
		}
	}
	return nil
}

// Secret is an API key in transit: every print, log and JSON encoding shows
// "[redacted]". Reveal returns the value for the one call that needs it.
type Secret string

func (s Secret) String() string               { return redacted }
func (s Secret) GoString() string             { return redacted }
func (s Secret) Format(f fmt.State, v rune)   { _, _ = f.Write([]byte(redacted)) }
func (s Secret) LogValue() slog.Value         { return slog.StringValue(redacted) }
func (s Secret) MarshalJSON() ([]byte, error) { return json.Marshal(redacted) }

const redacted = "[redacted]"

// Reveal returns the plaintext.
func (s Secret) Reveal() string { return string(s) }

// Last4 is the last four characters of a key of at least 8 characters, "" otherwise.
func Last4(key Secret) string {
	r := []rune(string(key))
	if len(r) < 8 {
		return ""
	}
	return string(r[len(r)-4:])
}

// Settings is the saved configuration as the domain sees it (no key material).
type Settings struct {
	Enabled  bool
	BaseURL  string // normalised
	Model    string
	HasKey   bool
	KeyLast4 string
}

// DefaultSettings is the seed row: off, Anthropic, Haiku 5.5, no key.
func DefaultSettings() Settings {
	return Settings{BaseURL: DefaultBaseURL, Model: DefaultModel}
}

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
	base, err := ValidateBaseURL(in.BaseURL)
	if err != nil {
		return Applied{}, err
	}
	if err := ValidateModelID(in.Model); err != nil {
		return Applied{}, err
	}
	key, err := cleanKey(in.APIKey)
	if err != nil {
		return Applied{}, err
	}
	if !secretKeyAvailable && (in.Enabled || key != "") {
		return Applied{}, &Error{Code: CodeSecretKeyMissing}
	}
	if OriginChanged(cur.BaseURL, base) && cur.HasKey && key == "" {
		return Applied{}, &Error{Code: CodeKeyRequiredNewBaseURL}
	}
	hasKey := cur.HasKey || key != ""
	if in.Enabled && !hasKey {
		return Applied{}, &Error{Code: CodeAPIKeyRequired}
	}

	out := Applied{Settings: Settings{Enabled: in.Enabled, BaseURL: base, Model: in.Model, HasKey: hasKey, KeyLast4: cur.KeyLast4}}
	if in.Enabled != cur.Enabled {
		action := ActionTurnedOff
		if in.Enabled {
			action = ActionTurnedOn
		}
		out.Changes = append(out.Changes, Change{Action: action})
	}
	if base != cur.BaseURL {
		out.Changes = append(out.Changes, Change{Action: ActionBaseURLChanged, Detail: cur.BaseURL + " -> " + base})
	}
	if in.Model != cur.Model {
		out.Changes = append(out.Changes, Change{Action: ActionModelChanged, Detail: cur.Model + " -> " + in.Model})
	}
	if key != "" {
		action := ActionKeySaved
		if cur.HasKey {
			action = ActionKeyReplaced
		}
		out.NewKey = Secret(key)
		out.Settings.KeyLast4 = Last4(out.NewKey)
		out.Changes = append(out.Changes, Change{Action: action, Detail: out.Settings.KeyLast4})
	}
	return out, nil
}

// cleanKey trims an API key and checks it: at most 512 characters, no
// whitespace or control characters inside. Empty means "keep the saved key".
func cleanKey(k Secret) (string, error) {
	s := strings.TrimSpace(string(k))
	if len([]rune(s)) > 512 {
		return "", &Error{Code: CodeAPIKeyInvalid}
	}
	for _, r := range s {
		if unicode.IsSpace(r) || unicode.IsControl(r) {
			return "", &Error{Code: CodeAPIKeyInvalid}
		}
	}
	return s, nil
}

// ApplyKeyRemoval removes the saved key and turns the assistant off
// (changes: key_removed, plus turned_off if it was on); no key: no changes.
func ApplyKeyRemoval(cur Settings) Applied {
	if !cur.HasKey {
		return Applied{Settings: cur}
	}
	out := Applied{Settings: cur}
	out.Settings.HasKey, out.Settings.KeyLast4, out.Settings.Enabled = false, "", false
	if cur.Enabled {
		out.Changes = append(out.Changes, Change{Action: ActionTurnedOff})
	}
	out.Changes = append(out.Changes, Change{Action: ActionKeyRemoved, Detail: cur.KeyLast4})
	return out
}
