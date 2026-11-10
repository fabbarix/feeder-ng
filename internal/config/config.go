// Package config reads the Feeder's start-up configuration from environment
// variables.
package config

import (
	"errors"
	"fmt"
	"path/filepath"
	"strings"
)

// ErrAdminEmailRequired is returned when FEEDER_ADMIN_EMAIL is missing or blank.
var ErrAdminEmailRequired = errors.New("FEEDER_ADMIN_EMAIL is required: it names the first Admin, the only person who can sign in at first")

// Config is the Feeder's start-up configuration.
type Config struct {
	AdminEmail         string
	DataDir            string
	Addr               string
	BaseURL            string
	GoogleClientID     string
	GoogleClientSecret string
	DevLogin           bool
	// TrustProxy: the client address for rate limits is the last X-Forwarded-For entry (ADR 0004 requires a reverse
	// proxy). FEEDER_TRUST_PROXY=false uses the connection address. Default true.
	TrustProxy bool
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
		TrustProxy:         true,
	}
	switch strings.ToLower(strings.TrimSpace(getenv("FEEDER_TRUST_PROXY"))) {
	case "0", "false", "no", "off":
		c.TrustProxy = false
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
