package recipefile

import (
	"bytes"
	"context"
	"fmt"
	"strings"

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
	set := ImageSet{Images: map[string]imaging.Result{}}
	fetched := 0
	resolve := func(path, ref string) {
		if ref == "" {
			return
		}
		res, err := resolveOne(ctx, ref, fetch, &fetched)
		if err != nil {
			set.Warnings = append(set.Warnings, Warning{Path: path, Code: WarnImageFailed, Message: err.Error()})
			return
		}
		set.Images[path] = res
	}
	for i, r := range f.Recipes {
		resolve(fmt.Sprintf("$.recipes[%d].image", i), r.Image)
		for j, s := range r.Steps {
			resolve(fmt.Sprintf("$.recipes[%d].steps[%d].image", i, j), s.Image)
		}
	}
	return set
}

// resolveOne turns one image reference into a stored image.
func resolveOne(ctx context.Context, ref string, fetch Fetcher, fetched *int) (imaging.Result, error) {
	if strings.HasPrefix(ref, "data:") {
		res, err := imaging.ProcessDataURL(ref)
		if err != nil {
			return imaging.Result{}, fmt.Errorf("the photo could not be used: %v", err)
		}
		return res, nil
	}
	if fetch == nil {
		return imaging.Result{}, fmt.Errorf("the photo at this address cannot be downloaded")
	}
	if *fetched >= MaxImagesFetched {
		return imaging.Result{}, fmt.Errorf("more than %d photos are downloaded from one file", MaxImagesFetched)
	}
	if err := ctx.Err(); err != nil {
		return imaging.Result{}, fmt.Errorf("the photo was not downloaded: %v", err)
	}
	*fetched++
	data, _, err := fetch.Fetch(ctx, ref)
	if err != nil {
		return imaging.Result{}, fmt.Errorf("the photo could not be downloaded: %v", err)
	}
	res, err := imaging.Process(bytes.NewReader(data))
	if err != nil {
		return imaging.Result{}, fmt.Errorf("the photo could not be used: %v", err)
	}
	return res, nil
}
