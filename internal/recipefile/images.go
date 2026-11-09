package recipefile

import (
	"context"

	"github.com/fabbarix/feeder-ng/internal/imaging"
)

// Fetcher downloads an https image. recipefile/imagefetch implements it with
// the SSRF guard; tests use fakes.
type Fetcher interface {
	Fetch(ctx context.Context, rawURL string) (data []byte, contentType string, err error)
}

// ImageSet is the outcome of resolving every image of a file: processed WebP
// images by JSON path, plus a Warning for each one that failed.
type ImageSet struct {
	Images   map[string]imaging.Result
	Warnings []Warning
}

// MaxImagesFetched caps how many https images one file may make the server
// download (the rest are dropped with a warning).
const MaxImagesFetched = 50

// ResolveImages decodes data URLs (imaging.ProcessDataURL, so the 8 MB, type
// and pixel caps apply) and downloads https URLs through fetch (a nil fetch
// refuses every URL). Every failure (bad data, wrong content type, refused
// address, anything not https, over MaxImagesFetched) drops that image and
// adds a WarnImageFailed warning with the image's JSON path
// ("$.recipes[0].image", "$.recipes[0].steps[1].image"). A cancelled context
// stops fetching and warns for the rest. Paths are returned for images that
// worked only.
func ResolveImages(ctx context.Context, f File, fetch Fetcher) ImageSet {
	panic("not implemented") // Developer
}
