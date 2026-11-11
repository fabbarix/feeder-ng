// Package images is the one ingest path for every image field (Recipe photos, Step photos, later Ingredient
// images): a data URL or an https URL goes in, a stored WebP comes out (internal/imaging does the decoding, the
// 1600 px scale and the encoding). It also owns Discard (drop an upload that was never saved) and the orphan Sweep.
// No net/http and no SQL: HTTP is images/httpapi, the SQL that lists referenced ids is images/refs.
package images

import (
	"bytes"
	"context"
	"errors"
	"net/netip"
	"net/url"
	"strings"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/imaging"
	"github.com/fabbarix/feeder-ng/internal/recipefile/imagefetch"
)

// OrphanGrace is how long an unreferenced image is kept: an editor left open overnight must not lose its upload.
const OrphanGrace = 24 * time.Hour

// StaleTempAge is how old a ".tmp-*" file must be before the sweep removes it.
const StaleTempAge = time.Hour

// Errors of the URL path (errors.Is). Size, type and pixel errors are imaging's: imaging.ErrTooLarge, ErrUnsupportedFormat, ErrTooManyPixels, ErrEmpty.
var (
	ErrURLInvalid     = errors.New("the image link is not an https URL")         // not https, no host, or credentials in it
	ErrURLBlocked     = errors.New("the image link points to a private address") // SSRF guard
	ErrURLUnreachable = errors.New("the image could not be downloaded")          // status, network, timeout, too many redirects
	ErrInUse          = errors.New("the image is in use")                        // Discard of a referenced image
)

// Fetcher downloads an https image; imagefetch.Fetcher is the production one (same SSRF policy as Recipe File images).
type Fetcher interface {
	Fetch(ctx context.Context, rawURL string) (data []byte, contentType string, err error)
}

// Referencer lists the image ids some record still uses. A failure means "unknown", and callers must then delete nothing.
type Referencer interface {
	ReferencedIDs(ctx context.Context) (map[string]bool, error)
	// IsReferenced reports whether some record uses this one image (a targeted query, for the per-image guard).
	IsReferenced(ctx context.Context, id string) (bool, error)
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

// IngestDataURL processes a data URL (imaging.ProcessDataURL) and stores the WebP with SaveAt(now).
func (s *Service) IngestDataURL(dataURL string) (Stored, error) {
	res, err := imaging.ProcessDataURL(dataURL)
	if err != nil {
		return Stored{}, err
	}
	return s.save(res)
}

func (s *Service) save(res imaging.Result) (Stored, error) {
	id, err := s.store.SaveAt(res.WebP, s.clk.Now())
	if err != nil {
		return Stored{}, err
	}
	return Stored{ID: id, Width: res.Width, Height: res.Height}, nil
}

// IngestURL downloads rawURL with the Fetcher and stores it like IngestDataURL. A URL that is not https, has no
// host or carries credentials is ErrURLInvalid WITHOUT calling the Fetcher; imagefetch.ErrBlocked is ErrURLBlocked;
// ErrNotHTTPS (a redirect to http) is ErrURLInvalid; imagefetch.ErrTooLarge is imaging.ErrTooLarge; ErrContentType
// is imaging.ErrUnsupportedFormat; any other fetch error (status, network, timeout, redirects) is ErrURLUnreachable.
// The fetched bytes then go through the same imaging limits (8 MB, JPEG/PNG/WebP/HEIC, pixel caps). Nothing is stored on error.
func (s *Service) IngestURL(ctx context.Context, rawURL string) (Stored, error) {
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil {
		return Stored{}, ErrURLInvalid
	}
	// An address typed as a literal never reaches DNS, so refuse the private ones here too (the fetcher checks
	// again when it dials).
	if ip, perr := netip.ParseAddr(u.Hostname()); perr == nil && imagefetch.Blocked(ip.Unmap()) {
		return Stored{}, ErrURLBlocked
	}
	data, _, err := s.fetch.Fetch(ctx, u.String())
	if err != nil {
		switch {
		case errors.Is(err, imagefetch.ErrBlocked):
			return Stored{}, ErrURLBlocked
		case errors.Is(err, imagefetch.ErrNotHTTPS), errors.Is(err, imagefetch.ErrCredentials):
			return Stored{}, ErrURLInvalid
		case errors.Is(err, imagefetch.ErrTooLarge):
			return Stored{}, imaging.ErrTooLarge
		case errors.Is(err, imagefetch.ErrContentType):
			return Stored{}, imaging.ErrUnsupportedFormat
		}
		return Stored{}, ErrURLUnreachable
	}
	res, err := imaging.Process(bytes.NewReader(data))
	if err != nil {
		return Stored{}, err
	}
	return s.save(res)
}

// Discard deletes the image unless a record still references it (ErrInUse). A missing image is not an error; an
// id of the wrong shape is imaging.ErrNotFound. If the Referencer fails, nothing is deleted and the error is returned.
func (s *Service) Discard(ctx context.Context, id string) error {
	if !imaging.ValidID(id) {
		return imaging.ErrNotFound
	}
	return s.deleteIfUnreferenced(ctx, id)
}

// deleteIfUnreferenced reads the references immediately before the delete (a record may have saved the image since
// any earlier snapshot) and deletes only if none holds it. Fail closed: a Referencer error deletes nothing.
func (s *Service) deleteIfUnreferenced(ctx context.Context, id string) error {
	used, err := s.refs.ReferencedIDs(ctx)
	if err != nil {
		return err
	}
	if used[id] {
		return ErrInUse
	}
	return s.store.Delete(id)
}

// Sweep deletes every stored image that no record references and that is older than OrphanGrace (strictly), and
// removes ".tmp-*" files older than StaleTempAge. If the Referencer fails it deletes NOTHING and returns the error
// (fail closed: a missed reference would delete a live photo).
func (s *Service) Sweep(ctx context.Context) (SweepResult, error) {
	used, err := s.refs.ReferencedIDs(ctx)
	if err != nil {
		return SweepResult{}, err
	}
	list, err := s.store.List()
	if err != nil {
		return SweepResult{}, err
	}
	now := s.clk.Now()
	var res SweepResult
	for _, e := range list {
		if used[e.ID] || now.Sub(e.ModTime) <= OrphanGrace {
			res.Kept++
			continue
		}
		// The snapshot above may be stale by now: re-check this one image just before deleting it.
		if err := s.deleteIfUnreferenced(ctx, e.ID); err != nil {
			if errors.Is(err, ErrInUse) {
				res.Kept++
				continue
			}
			return res, err
		}
		res.Deleted = append(res.Deleted, e.ID)
	}
	res.TempRemoved, err = s.store.RemoveTemp(now.Add(-StaleTempAge))
	return res, err
}

// Guarded is the image file store as the record packages (Ingredients, Recipes, Members) see it: Exists, and a Delete
// that, like Discard, removes the file only when no table references it any more. A record's own "nobody of mine uses it"
// check is not enough: a hand-made request can give one table another table's image id.
type Guarded struct {
	store *imaging.Store
	refs  Referencer
}

// NewGuarded wraps store; refs lists every referenced id (refs.New over the database).
func NewGuarded(store *imaging.Store, refs Referencer) *Guarded {
	return &Guarded{store: store, refs: refs}
}

// Exists reports whether the image file is stored.
func (g *Guarded) Exists(id string) bool { return g.store.Exists(id) }

// Delete removes the file unless some record references it (then it does nothing and returns nil). Fail closed: if the
// references cannot be read, nothing is deleted and the error is returned.
func (g *Guarded) Delete(ctx context.Context, id string) error {
	used, err := g.refs.IsReferenced(ctx, id)
	if err != nil {
		return err
	}
	if used {
		return nil
	}
	return g.store.Delete(id)
}
