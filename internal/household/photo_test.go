package household_test

import (
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// IM2: a Member may have a photo (an image id). Avatar = photo, else emoji, else initials.
func TestMemberPhotoIsOptionalAndMustBeAWellFormedImageID(t *testing.T) {
	ok := household.MemberInput{Name: "Sam", Colour: "#e07a5f", PortionFactor: 0.5}
	if err := ok.Validate(); err != nil {
		t.Fatalf("no photo must stay valid: %v", err)
	}
	withPhoto := ok
	withPhoto.Photo = "0123456789abcdef0123456789abcdef"
	if err := withPhoto.Validate(); err != nil {
		t.Errorf("a photo id rejected: %v", err)
	}
	for _, bad := range []string{"sam.png", "../x", strings.Repeat("A", 32), strings.Repeat("a", 31), "https://x.test/a.png"} {
		m := ok
		m.Photo = bad
		if got := fieldOf(m.Validate()); got != "photo" {
			t.Errorf("Photo %q: error on field %q, want photo", bad, got)
		}
	}
}

func TestMemberPhotoAndEmojiMayBothBeStored(t *testing.T) {
	m := household.MemberInput{Name: "Sam", Colour: "#e07a5f", PortionFactor: 1, Avatar: "🦊", Photo: "0123456789abcdef0123456789abcdef"}
	if err := m.Normalized().Validate(); err != nil {
		t.Errorf("emoji and photo together: %v (the screen shows the photo; keeping the emoji lets it be the fallback)", err)
	}
}
