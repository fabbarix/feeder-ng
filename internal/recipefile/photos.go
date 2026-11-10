package recipefile

import (
	"errors"

	"github.com/fabbarix/feeder-ng/internal/imaging"
)

// Candidate photo limits (docs/dev/design/ra-c-service.md §3).
const (
	// CandidateMaxSide is the longest side a candidate photo is stored at: 1,600 px is all that is ever kept
	// (imaging.MaxSide), so the 2,576 px photos sent to the model are shrunk before they are held in memory.
	CandidateMaxSide = imaging.MaxSide
	// MaxUserCandidateBytes bounds the candidate photo bytes one User may hold across all open Reviews.
	// Past it the oldest Reviews lose their photos first (the Reviews stay open); a single Review that
	// is over the bound on its own opens without photos.
	MaxUserCandidateBytes = 16 << 20
)

// ErrPhotoChoice is returned by WithPhoto for a choice that cannot be applied: no candidates, an index or
// Recipe out of range, or a photo that imaging.Process refuses. The handler answers 422 validation_failed, field photo.
var ErrPhotoChoice = errors.New("recipefile: invalid photo choice")

// CandidatePhoto is one photo offered in Import Review after a photo read: JPEG, longest side at most CandidateMaxSide.
type CandidatePhoto struct {
	JPEG          []byte
	Width, Height int
}

// PhotoChoice is the User's pick at Confirm: Index into Review.Photos and Recipe index into the file, both 0-based.
type PhotoChoice struct{ Index, Recipe int }

// NewCandidate decodes a JPEG (the prepared photo of a read), shrinks it to CandidateMaxSide on the longest
// side (never upscales) and re-encodes it as JPEG without metadata.
// TODO(ra-c developer): implement.
func NewCandidate(jpeg []byte) (CandidatePhoto, error) {
	return CandidatePhoto{}, errors.New("not implemented")
}

// WithPhoto applies the User's choice: the candidate goes through imaging.Process (the normal Recipe image
// path) and becomes the image of Recipe ch.Recipe, at path "$.recipes[i].image" of the returned ImageSet
// and as a non-empty File.Recipes[i].Image reference so BuildPlan/BuildCommit treat it like a Recipe File
// image. It never mutates its arguments (maps and slices are copied). A Recipe that already has an image
// has it replaced. Errors wrap ErrPhotoChoice.
// TODO(ra-c developer): implement.
func WithPhoto(f File, images ImageSet, photos []CandidatePhoto, ch PhotoChoice) (File, ImageSet, error) {
	return f, images, errors.New("not implemented")
}

// OpenWithPhotos is Open plus candidate photos, subject to MaxUserCandidateBytes.
// TODO(ra-c developer): implement; the stub drops the photos.
func (s *Sessions) OpenWithPhotos(userID int64, f File, images ImageSet, photos []CandidatePhoto) Review {
	return s.Open(userID, f, images)
}

// Photo returns candidate photo index (0-based) of the User's open Review. Like Get, a hit renews the idle timer.
// TODO(ra-c developer): implement.
func (s *Sessions) Photo(userID int64, id string, index int) (CandidatePhoto, bool) {
	return CandidatePhoto{}, false
}
