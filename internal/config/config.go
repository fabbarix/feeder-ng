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
}

// HasSecretKey reports whether FEEDER_SECRET_KEY was set (and valid).
// TODO(ra-c developer): implement; compare SecretKey with its zero value.
func (c Config) HasSecretKey() bool { return false }

// LogValue redacts every secret field so a Config can be logged.
// TODO(ra-c developer): implement.
func (c Config) LogValue() slog.Value { return slog.AnyValue(c) }

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
