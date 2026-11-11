package recipeassistant

import (
	"context"
	"encoding/base64"
	"errors"
	"strings"

	"github.com/fabbarix/feeder-ng/internal/imaging"
)

// Photo limits and codes (design ai-recipe-import §3.5, ra-c-service §3).
const (
	MinPhotos = 1
	MaxPhotos = 4

	CodePhotosEmpty      = "photos_empty"
	CodeTooManyPhotos    = "too_many_photos"
	CodePhotoTooLarge    = "photo_too_large"
	CodePhotoUnsupported = "photo_unsupported"
	CodePhotoUnavailable = "photo_unavailable"
)

// Fetcher downloads an https image (the SSRF-guarded fetcher; recipefile.Fetcher satisfies it). It should stop
// reading a little past imaging.MaxBytes; PreparePhotos refuses what is larger than that.
type Fetcher interface {
	Fetch(ctx context.Context, rawURL string) (data []byte, contentType string, err error)
}

// PhotoSource is one photo of a request: a data URL or an https URL, never both.
type PhotoSource struct{ DataURL, URL string }

// PreparedPhoto is a photo ready for the model: JPEG, longest side at most 2,576 px, no metadata.
type PreparedPhoto struct {
	JPEG          []byte
	Width, Height int
}

// PreparePhotos checks and prepares 1..4 photos for the model, in order. Errors are *Error with CodePhotosEmpty,
// CodeTooManyPhotos, CodePhotoTooLarge (over 8 MB or too many pixels), CodePhotoUnsupported (not a picture
// Feeder can read, a declared type that differs from the bytes, both or neither of data URL and URL) or
// CodePhotoUnavailable (the URL could not be fetched: generic, the cause is not kept). A cancelled context
// returns ctx.Err().
func PreparePhotos(ctx context.Context, fetch Fetcher, in []PhotoSource) ([]PreparedPhoto, error) {
	if len(in) < MinPhotos {
		return nil, &Error{Code: CodePhotosEmpty}
	}
	if len(in) > MaxPhotos {
		return nil, &Error{Code: CodeTooManyPhotos}
	}
	out := make([]PreparedPhoto, 0, len(in))
	for _, p := range in {
		data, declared, err := photoBytes(ctx, fetch, p)
		if err != nil {
			return nil, err
		}
		m, err := imaging.PrepareForModelAs(data, declared)
		if err != nil {
			return nil, photoError(err)
		}
		out = append(out, PreparedPhoto{JPEG: m.JPEG, Width: m.Width, Height: m.Height})
	}
	return out, nil
}

func photoBytes(ctx context.Context, fetch Fetcher, p PhotoSource) (data []byte, declared string, err error) {
	if (p.DataURL == "") == (p.URL == "") {
		return nil, "", &Error{Code: CodePhotoUnsupported}
	}
	if p.URL != "" {
		if fetch == nil || !strings.HasPrefix(strings.ToLower(strings.TrimSpace(p.URL)), "https://") {
			return nil, "", &Error{Code: CodePhotoUnavailable}
		}
		data, _, err := fetch.Fetch(ctx, strings.TrimSpace(p.URL))
		if err != nil {
			if ctx.Err() != nil {
				return nil, "", ctx.Err()
			}
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return nil, "", err
			}
			return nil, "", &Error{Code: CodePhotoUnavailable}
		}
		return data, "", nil
	}
	const marker = ";base64,"
	i := strings.Index(p.DataURL, marker)
	if !strings.HasPrefix(p.DataURL, "data:") || i < 0 {
		return nil, "", &Error{Code: CodePhotoUnsupported}
	}
	declared = strings.ToLower(p.DataURL[len("data:"):i])
	payload := p.DataURL[i+len(marker):]
	if base64.StdEncoding.DecodedLen(len(payload)) > imaging.MaxBytes+3 {
		return nil, "", &Error{Code: CodePhotoTooLarge}
	}
	data, err = base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return nil, "", &Error{Code: CodePhotoUnsupported}
	}
	return data, declared, nil
}

func photoError(err error) error {
	switch {
	case errors.Is(err, imaging.ErrTooLarge), errors.Is(err, imaging.ErrTooManyPixels):
		return &Error{Code: CodePhotoTooLarge}
	default:
		return &Error{Code: CodePhotoUnsupported}
	}
}
