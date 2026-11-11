package household

import (
	"math"
	"regexp"
	"strings"

	"github.com/fabbarix/feeder-ng/internal/imaging"
)

// Member is a person who eats from the plan.
type Member struct {
	ID            int64
	Name          string
	Colour        string // #rrggbb
	Avatar        string // optional short text, e.g. an emoji
	PortionFactor float64
	UserID        *int64
	Email         string // optional sign-in address, lower case; empty when none
	Photo         string // IM2: image id (internal/imaging), "" = none. The avatar shows photo, else Avatar, else initials.
}

// MemberInput is what an Admin supplies to create or change a Member.
type MemberInput struct {
	Name          string
	Colour        string
	Avatar        string
	PortionFactor float64
	Email         string // optional; empty clears it
	Photo         string // IM2: image id, "" = none (clears it)
}

// Normalized trims the name and avatar. It returns a copy.
func (m MemberInput) Normalized() MemberInput {
	m.Name = strings.TrimSpace(m.Name)
	m.Avatar = strings.TrimSpace(m.Avatar)
	m.Email = strings.ToLower(strings.TrimSpace(m.Email))
	m.Photo = strings.TrimSpace(m.Photo)
	return m
}

// ValidatePortionFactor accepts 0.25 to 3 in steps of 0.25.
func ValidatePortionFactor(f float64) error {
	if f < 0.25 || f > 3 || math.Abs(f*4-math.Round(f*4)) > 1e-9 {
		return fieldError("portionFactor", "must be between 0.25 and 3 in steps of 0.25")
	}
	return nil
}

// Validate checks name, colour, avatar and Portion Factor.
func (m MemberInput) Validate() error {
	if n := nameLength(m.Name); n < 1 || n > 50 {
		return fieldError("name", "must be between 1 and 50 characters")
	}
	if !validHex(m.Colour) {
		return fieldError("colour", "must be a #rrggbb colour")
	}
	if nameLength(m.Avatar) > 4 {
		return fieldError("avatar", "must be at most 4 characters")
	}
	if m.Photo != "" && !imaging.ValidID(m.Photo) {
		return fieldError("photo", "must be an uploaded image")
	}
	if m.Email != "" && !validMemberEmail(m.Email) {
		return fieldError("email", "must be an address like name@example.com, at most 254 characters")
	}
	return ValidatePortionFactor(m.PortionFactor)
}

var memberEmailShape = regexp.MustCompile(`^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>.]+$`)

// validMemberEmail accepts one local@domain.tld address of at most 254 characters.
func validMemberEmail(e string) bool {
	return len(e) <= 254 && memberEmailShape.MatchString(e) && !strings.Contains(e, "..")
}
