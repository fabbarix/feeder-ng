package service

import (
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/imaging"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
)

// A HEIC or HEIF data URL passes the synchronous checks; decoding happens later, in the preparing state.
func TestValidatePhotoAcceptsHEICAndHEIFDataURLs(t *testing.T) {
	for _, mime := range []string{"image/heic", "image/heif", "IMAGE/HEIC"} {
		p := PhotoInput{DataURL: "data:" + mime + ";base64,AAAA"}
		if err := validatePhoto(p); err != nil {
			t.Errorf("%s: validatePhoto = %v, want nil", mime, err)
		}
	}
}

// Types outside the allow-list are still refused synchronously.
func TestValidatePhotoStillRefusesUnlistedTypes(t *testing.T) {
	p := PhotoInput{DataURL: "data:image/gif;base64,R0lGODlhAQABAAAAACw="}
	if code := recipeassistant.CodeOf(validatePhoto(p)); code != recipeassistant.CodePhotoUnsupported {
		t.Fatalf("validatePhoto(gif) code = %q, want %s", code, recipeassistant.CodePhotoUnsupported)
	}
}

// A HEIC sent as it is keeps the 8 MB limit.
func TestValidatePhotoRefusesHEICOverTheLimit(t *testing.T) {
	p := PhotoInput{DataURL: "data:image/heic;base64," + strings.Repeat("A", (imaging.MaxBytes/3+2)*4)}
	if code := recipeassistant.CodeOf(validatePhoto(p)); code != recipeassistant.CodePhotoTooLarge {
		t.Fatalf("validatePhoto(big heic) code = %q, want %s", code, recipeassistant.CodePhotoTooLarge)
	}
}
