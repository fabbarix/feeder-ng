// Package config reads the Feeder's start-up configuration from environment
// variables.
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"path/filepath"
	"strings"

	"github.com/fabbarix/feeder-ng/internal/secretbox"
)

// ErrAdminEmailRequired is returned when FEEDER_ADMIN_EMAIL is missing or blank.
var ErrAdminEmailRequired = errors.New("FEEDER_ADMIN_EMAIL is required: it names the first Admin, the only person who can sign in at first")

// ErrSecretKeyMalformed is returned when FEEDER_SECRET_KEY is set but is not base64 of exactly 32 bytes.
// The message names the variable and never the value.
var ErrSecretKeyMalformed = errors.New("FEEDER_SECRET_KEY is malformed: it must be base64 of exactly 32 bytes (openssl rand -base64 32)")

// Config is the Feeder's start-up configuration.
type Config struct {
	AdminEmail         string
	DataDir            string
	Addr               string
	BaseURL            string
	GoogleClientID     string
	GoogleClientSecret string
	DevLogin           bool
	// SecretKey is FEEDER_SECRET_KEY (zero value: unset). Required only for the Recipe Assistant.
	SecretKey secretbox.MasterKey
	// TrustProxy: the client address for rate limits is the last X-Forwarded-For entry. Off by default (the socket peer
	// is used); FEEDER_TRUST_PROXY=1/true/yes/on says a reverse proxy sits in front.
	TrustProxy bool
}

// HasSecretKey reports whether FEEDER_SECRET_KEY was set (and valid).
func (c Config) HasSecretKey() bool { return c.SecretKey != secretbox.MasterKey{} }

// redacted is what a secret field prints as.
const redacted = "[redacted]"

// LogValue redacts every secret field so a Config can be logged.
func (c Config) LogValue() slog.Value {
	secret := func(v string) slog.Value {
		if v == "" {
			return slog.StringValue("")
		}
		return slog.StringValue(redacted)
	}
	return slog.GroupValue(
		slog.String("AdminEmail", c.AdminEmail),
		slog.String("DataDir", c.DataDir),
		slog.String("Addr", c.Addr),
		slog.String("BaseURL", c.BaseURL),
		slog.String("GoogleClientID", c.GoogleClientID),
		slog.Any("GoogleClientSecret", secret(c.GoogleClientSecret)),
		slog.Bool("DevLogin", c.DevLogin),
		slog.String("SecretKey", redacted),
		slog.Bool("TrustProxy", c.TrustProxy),
	)
}

// String and Format print the redacted form under every verb, so a Config never leaks a secret through fmt.
func (c Config) String() string { return c.redactedString() }

// Format prints the redacted form under every verb.
func (c Config) Format(f fmt.State, _ rune) { _, _ = f.Write([]byte(c.redactedString())) }

func (c Config) redactedString() string {
	secret := func(v string) string {
		if v == "" {
			return ""
		}
		return redacted
	}
	return fmt.Sprintf("{AdminEmail:%s DataDir:%s Addr:%s BaseURL:%s GoogleClientID:%s GoogleClientSecret:%s DevLogin:%t SecretKey:%s TrustProxy:%t}",
		c.AdminEmail, c.DataDir, c.Addr, c.BaseURL, c.GoogleClientID, secret(c.GoogleClientSecret), c.DevLogin, redacted, c.TrustProxy)
}

// Load reads the configuration through getenv (os.Getenv in production).
func Load(getenv func(string) string) (Config, error) {
	admin := strings.ToLower(strings.TrimSpace(getenv("FEEDER_ADMIN_EMAIL")))
	if admin == "" {
		return Config{}, fmt.Errorf("config: %w", ErrAdminEmailRequired)
	}
	c := Config{
		AdminEmail:         admin,
		DataDir:            valueOr(getenv("FEEDER_DATA_DIR"), "/data"),
		Addr:               valueOr(getenv("FEEDER_ADDR"), ":8080"),
		BaseURL:            getenv("FEEDER_BASE_URL"),
		GoogleClientID:     getenv("FEEDER_GOOGLE_CLIENT_ID"),
		GoogleClientSecret: getenv("FEEDER_GOOGLE_CLIENT_SECRET"),
	}
	if v := strings.TrimSpace(getenv("FEEDER_SECRET_KEY")); v != "" {
		mk, err := secretbox.ParseMasterKey(v)
		if err != nil {
			return Config{}, fmt.Errorf("config: %w", ErrSecretKeyMalformed)
		}
		c.SecretKey = mk
	}
	switch strings.ToLower(strings.TrimSpace(getenv("FEEDER_TRUST_PROXY"))) {
	case "1", "true", "yes", "on":
		c.TrustProxy = true
	}
	switch strings.ToLower(getenv("FEEDER_DEV_LOGIN")) {
	case "1", "true":
		c.DevLogin = true
	}
	return c, nil
}

// DBPath is the SQLite database file inside DataDir.
func (c Config) DBPath() string { return filepath.Join(c.DataDir, "feeder.db") }

// SecureCookies reports whether session cookies must carry the Secure flag.
func (c Config) SecureCookies() bool { return strings.HasPrefix(c.BaseURL, "https://") }

func valueOr(v, def string) string {
	if v == "" {
		return def
	}
	return v
}
