package recipefile

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"image/jpeg"

	"golang.org/x/image/draw"

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
func NewCandidate(jpegBytes []byte) (CandidatePhoto, error) {
	cfg, format, err := image.DecodeConfig(bytes.NewReader(jpegBytes))
	if err != nil || format != "jpeg" {
		return CandidatePhoto{}, errors.New("recipefile: candidate photo is not a JPEG")
	}
	if cfg.Width > imaging.MaxSidePixels || cfg.Height > imaging.MaxSidePixels || int64(cfg.Width)*int64(cfg.Height) > imaging.MaxPixels {
		return CandidatePhoto{}, imaging.ErrTooManyPixels
	}
	src, err := jpeg.Decode(bytes.NewReader(jpegBytes))
	if err != nil {
		return CandidatePhoto{}, errors.New("recipefile: candidate photo cannot be decoded")
	}
	b := src.Bounds()
	w, h := imaging.ScaledSize(b.Dx(), b.Dy(), CandidateMaxSide)
	var img image.Image = src
	if w != b.Dx() || h != b.Dy() {
		dst := image.NewRGBA(image.Rect(0, 0, w, h))
		draw.CatmullRom.Scale(dst, dst.Bounds(), src, b, draw.Over, nil)
		img = dst
	}
	var out bytes.Buffer
	if err := jpeg.Encode(&out, img, &jpeg.Options{Quality: candidateQuality}); err != nil {
		return CandidatePhoto{}, errors.New("recipefile: candidate photo cannot be encoded")
	}
	return CandidatePhoto{JPEG: out.Bytes(), Width: w, Height: h}, nil
}

// candidateQuality is the JPEG quality of stored candidates.
const candidateQuality = 85

// PhotoImageRef is the placeholder File.Recipes[i].Image holds after WithPhoto: the real bytes are in the ImageSet.
const PhotoImageRef = "feeder:candidate-photo"

// WithPhoto applies the User's choice: the candidate goes through imaging.Process (the normal Recipe image
// path) and becomes the image of Recipe ch.Recipe, at path "$.recipes[i].image" of the returned ImageSet
// and as a non-empty File.Recipes[i].Image reference so BuildPlan/BuildCommit treat it like a Recipe File
// image. It never mutates its arguments (maps and slices are copied). A Recipe that already has an image
// has it replaced. Errors wrap ErrPhotoChoice.
func WithPhoto(f File, images ImageSet, photos []CandidatePhoto, ch PhotoChoice) (File, ImageSet, error) {
	if ch.Index < 0 || ch.Index >= len(photos) || ch.Recipe < 0 || ch.Recipe >= len(f.Recipes) {
		return f, images, ErrPhotoChoice
	}
	res, err := imaging.Process(bytes.NewReader(photos[ch.Index].JPEG))
	if err != nil {
		return f, images, fmt.Errorf("%w: %v", ErrPhotoChoice, err)
	}
	path := fmt.Sprintf("$.recipes[%d].image", ch.Recipe)
	out := f
	out.Recipes = append([]Recipe(nil), f.Recipes...)
	out.Recipes[ch.Recipe].Image = PhotoImageRef
	set := ImageSet{Images: make(map[string]imaging.Result, len(images.Images)+1)}
	for k, v := range images.Images {
		set.Images[k] = v
	}
	set.Images[path] = res
	for _, w := range images.Warnings {
		if w.Path != path {
			set.Warnings = append(set.Warnings, w)
		}
	}
	return out, set, nil
}

// OpenWithPhotos is Open plus candidate photos, subject to MaxUserCandidateBytes.
func (s *Sessions) OpenWithPhotos(userID int64, f File, images ImageSet, photos []CandidatePhoto) Review {
	s.mu.Lock()
	defer s.mu.Unlock()
	rv := Review{ID: newReviewID(), UserID: userID, File: f, Images: images}
	if photoBytes(photos) <= MaxUserCandidateBytes {
		rv.Photos = photos
	}
	list := append(s.live(userID), &entry{review: rv, lastSeen: s.clk.Now()})
	if over := len(list) - MaxUserReviews; over > 0 {
		list = list[over:]
	}
	s.byUser[userID] = list
	enforcePhotoBound(list)
	return rv
}

// Photo returns candidate photo index (0-based) of the User's open Review. Like Get, a hit renews the idle timer.
func (s *Sessions) Photo(userID int64, id string, index int) (CandidatePhoto, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, e := range s.live(userID) {
		if e.review.ID == id {
			if index < 0 || index >= len(e.review.Photos) {
				return CandidatePhoto{}, false
			}
			e.lastSeen = s.clk.Now()
			return e.review.Photos[index], true
		}
	}
	return CandidatePhoto{}, false
}

func photoBytes(ps []CandidatePhoto) int {
	n := 0
	for _, p := range ps {
		n += len(p.JPEG)
	}
	return n
}

// enforcePhotoBound makes the User's candidate bytes fit MaxUserCandidateBytes by taking the photos of the oldest
// Reviews first (the Reviews stay open). The caller holds s.mu; list is oldest first.
func enforcePhotoBound(list []*entry) {
	total := 0
	for _, e := range list {
		total += photoBytes(e.review.Photos)
	}
	for _, e := range list {
		if total <= MaxUserCandidateBytes {
			return
		}
		total -= photoBytes(e.review.Photos)
		e.review.Photos = nil
	}
}
