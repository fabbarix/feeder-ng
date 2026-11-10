// Package images is the one ingest path for every image field (Recipe photos, Step photos, later Ingredient
// images): a data URL or an https URL goes in, a stored WebP comes out (internal/imaging does the decoding, the
// 1600 px scale and the encoding). It also owns Discard (drop an upload that was never saved) and the orphan Sweep.
// No net/http and no SQL: HTTP is images/httpapi, the SQL that lists referenced ids is images/refs.
//
// IP1 stubs: the Developer implements them (docs/dev/design/ip1-imagepicker.md).
package images

import (
	"context"
	"errors"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/imaging"
)

// OrphanGrace is how long an unreferenced image is kept: an editor left open overnight must not lose its upload.
const OrphanGrace = 24 * time.Hour

// StaleTempAge is how old a ".tmp-*" file must be before the sweep removes it.
const StaleTempAge = time.Hour

// Errors of the URL path (errors.Is). Size, type and pixel errors are imaging's: imaging.ErrTooLarge, ErrUnsupportedFormat, ErrTooManyPixels, ErrEmpty.
var (
	ErrURLInvalid     = errors.New("the image link is not an https URL")      // not https, no host, or credentials in it
	ErrURLBlocked     = errors.New("the image link points to a private address") // SSRF guard
	ErrURLUnreachable = errors.New("the image could not be downloaded")         // status, network, timeout, too many redirects
	ErrInUse          = errors.New("the image is in use")                      // Discard of a referenced image
)

// Fetcher downloads an https image; imagefetch.Fetcher is the production one (same SSRF policy as Recipe File images).
type Fetcher interface {
	Fetch(ctx context.Context, rawURL string) (data []byte, contentType string, err error)
}

// Referencer lists the image ids some record still uses. A failure means "unknown", and callers must then delete nothing.
type Referencer interface {
	ReferencedIDs(ctx context.Context) (map[string]bool, error)
}

// Stored is a freshly ingested image.
type Stored struct {
	ID            string
	Width, Height int
}

// SweepResult reports one orphan sweep.
type SweepResult struct {
	Deleted     []string // ids removed: unreferenced and older than OrphanGrace
	Kept        int      // stored images left alone (referenced or within the grace period)
	TempRemoved int      // stale .tmp-* files removed
}

// Service ingests, discards and sweeps images.
type Service struct {
	store *imaging.Store
	fetch Fetcher
	refs  Referencer
	clk   clock.Clock
}

// NewService returns a Service over store.
func NewService(store *imaging.Store, fetch Fetcher, refs Referencer, clk clock.Clock) *Service {
	return &Service{store: store, fetch: fetch, refs: refs, clk: clk}
}

var errTodo = errors.New("images: not implemented")

// IngestDataURL processes a data URL (imaging.ProcessDataURL) and stores the WebP with SaveAt(now).
func (s *Service) IngestDataURL(dataURL string) (Stored, error) { return Stored{}, errTodo }

// IngestURL downloads rawURL with the Fetcher and stores it like IngestDataURL. A URL that is not https, has no
// host or carries credentials is ErrURLInvalid WITHOUT calling the Fetcher; imagefetch.ErrBlocked is ErrURLBlocked;
// ErrNotHTTPS (a redirect to http) is ErrURLInvalid; imagefetch.ErrTooLarge is imaging.ErrTooLarge; ErrContentType
// is imaging.ErrUnsupportedFormat; any other fetch error (status, network, timeout, redirects) is ErrURLUnreachable.
// The fetched bytes then go through the same imaging limits (8 MB, JPEG/PNG/WebP, pixel caps). Nothing is stored on error.
func (s *Service) IngestURL(ctx context.Context, rawURL string) (Stored, error) {
	return Stored{}, errTodo
}

// Discard deletes the image unless a record still references it (ErrInUse). A missing image is not an error; an
// id of the wrong shape is imaging.ErrNotFound. If the Referencer fails, nothing is deleted and the error is returned.
func (s *Service) Discard(ctx context.Context, id string) error { return errTodo }

// Sweep deletes every stored image that no record references and that is older than OrphanGrace (strictly), and
// removes ".tmp-*" files older than StaleTempAge. If the Referencer fails it deletes NOTHING and returns the error
// (fail closed: a missed reference would delete a live photo).
func (s *Service) Sweep(ctx context.Context) (SweepResult, error) { return SweepResult{}, errTodo }
