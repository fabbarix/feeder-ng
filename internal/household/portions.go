package household

// Attendee is one Member at a Meal Slot, with an optional Portion Factor override.
type Attendee struct {
	MemberID              int64
	PortionFactorOverride *float64
}

// ResolveAttendance returns the override when one exists (even an empty one),
// otherwise the usual Attendance.
func ResolveAttendance(usual, override []Attendee, hasOverride bool) []Attendee {
	if hasOverride {
		return override
	}
	return usual
}

// EffectiveFactor is the override when set, else the Member's default Portion Factor.
func EffectiveFactor(m Member, a Attendee) float64 {
	if a.PortionFactorOverride != nil {
		return *a.PortionFactorOverride
	}
	return m.PortionFactor
}

// PortionsNeeded sums the effective Portion Factors of the attending Members.
func PortionsNeeded(members []Member, attendance []Attendee) (float64, error) {
	byID := make(map[int64]Member, len(members))
	for _, m := range members {
		byID[m.ID] = m
	}
	total := 0.0
	for _, a := range attendance {
		m, ok := byID[a.MemberID]
		if !ok {
			return 0, ErrUnknownMember
		}
		total += EffectiveFactor(m, a)
	}
	return total, nil
}

// ValidateAttendees checks each override is a valid Portion Factor and that no
// Member is listed twice.
func ValidateAttendees(att []Attendee) error {
	seen := make(map[int64]bool, len(att))
	for _, a := range att {
		if a.PortionFactorOverride != nil {
			if err := ValidatePortionFactorOverride(*a.PortionFactorOverride); err != nil {
				return err
			}
		}
		if seen[a.MemberID] {
			return ErrDuplicateAttendee
		}
		seen[a.MemberID] = true
	}
	return nil
}

// ValidatePortionFactorOverride is ValidatePortionFactor, reporting the
// override's own field name.
func ValidatePortionFactorOverride(f float64) error {
	if err := ValidatePortionFactor(f); err != nil {
		return fieldError("portionFactorOverride", "must be between 0.25 and 3 in steps of 0.25")
	}
	return nil
}
