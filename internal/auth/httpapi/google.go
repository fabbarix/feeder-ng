package httpapi

import "github.com/fabbarix/feeder-ng/internal/auth"

// SetProvider replaces the sign-in provider (a test seam; the provider is read
// at request time) and returns a function that restores the previous one.
// Without an override the provider is built from FEEDER_GOOGLE_CLIENT_ID and
// FEEDER_GOOGLE_CLIENT_SECRET; with no client id, sign-in answers 503
// google_not_configured.
func SetProvider(p auth.Provider) (restore func()) { panic("httpapi: not implemented") }
