package household

// Preferences are one User's display preferences (spec §14).
type Preferences struct {
	Scheme    string  // light | dark | system
	Accent    string  // #rrggbb
	Secondary *string // #rrggbb, optional
	Units     string  // metric | imperial
}

// DefaultPreferences are the preferences of a User who has not chosen any.
func DefaultPreferences() Preferences {
	return Preferences{Scheme: "system", Accent: "#3f7d58", Units: "metric"}
}

// Validate checks each preference's allowed values.
func (p Preferences) Validate() error {
	switch p.Scheme {
	case "light", "dark", "system":
	default:
		return fieldError("scheme", "must be light, dark or system")
	}
	if !validHex(p.Accent) {
		return fieldError("accent", "must be a #rrggbb colour")
	}
	if p.Secondary != nil && !validHex(*p.Secondary) {
		return fieldError("secondary", "must be a #rrggbb colour")
	}
	switch p.Units {
	case "metric", "imperial":
	default:
		return fieldError("units", "must be metric or imperial")
	}
	return nil
}
