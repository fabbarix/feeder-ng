package images_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"image"
	"image/png"
	"net/netip"
	"os"
	"path/filepath"
	"sort"
	"testing"
	"time"

	"golang.org/x/image/webp"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/images"
	"github.com/fabbarix/feeder-ng/internal/imaging"
	"github.com/fabbarix/feeder-ng/internal/recipefile/imagefetch"
)

var t0 = time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)

func pngBytes(t *testing.T, w, h int) []byte {
	t.Helper()
	var b bytes.Buffer
	if err := png.Encode(&b, image.NewRGBA(image.Rect(0, 0, w, h))); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func pngDataURL(t *testing.T, w, h int) string {
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngBytes(t, w, h))
}

type fakeFetcher struct {
	data  []byte
	ct    string
	err   error
	calls []string
}

func (f *fakeFetcher) Fetch(_ context.Context, u string) ([]byte, string, error) {
	f.calls = append(f.calls, u)
	return f.data, f.ct, f.err
}

type fakeRefs struct {
	ids map[string]bool
	err error
}

func (r *fakeRefs) ReferencedIDs(context.Context) (map[string]bool, error) { return r.ids, r.err }
func (r *fakeRefs) IsReferenced(_ context.Context, id string) (bool, error) {
	return r.ids[id], r.err
}

type env struct {
	svc   *images.Service
	store *imaging.Store
	clk   *clock.Fake
	fetch *fakeFetcher
	refs  *fakeRefs
	dir   string
}

func newEnv(t *testing.T) *env {
	t.Helper()
	dir := filepath.Join(t.TempDir(), "images")
	e := &env{store: imaging.NewStore(dir), clk: clock.NewFake(t0), fetch: &fakeFetcher{}, refs: &fakeRefs{ids: map[string]bool{}}, dir: dir}
	e.svc = images.NewService(e.store, e.fetch, e.refs, e.clk)
	return e
}

func mustWebP(t *testing.T, e *env, id string, w, h int) {
	t.Helper()
	f, err := e.store.Open(id)
	if err != nil {
		t.Fatalf("open %s: %v", id, err)
	}
	defer f.Close()
	cfg, err := webp.DecodeConfig(f)
	if err != nil {
		t.Fatalf("stored image is not a WebP: %v", err)
	}
	if cfg.Width != w || cfg.Height != h {
		t.Errorf("stored image is %dx%d, want %dx%d", cfg.Width, cfg.Height, w, h)
	}
}

func storedCount(t *testing.T, e *env) int {
	t.Helper()
	list, err := e.store.List()
	if err != nil {
		t.Fatal(err)
	}
	return len(list)
}

// ---- ingest ----

func TestIngestDataURLStoresAScaledWebP(t *testing.T) {
	e := newEnv(t)
	got, err := e.svc.IngestDataURL(pngDataURL(t, 3200, 1600))
	if err != nil {
		t.Fatal(err)
	}
	if !imaging.ValidID(got.ID) || got.Width != 1600 || got.Height != 800 {
		t.Fatalf("Stored = %+v, want a valid id and 1600x800", got)
	}
	mustWebP(t, e, got.ID, 1600, 800)
}

func TestIngestStampsTheUploadWithTheApplicationClock(t *testing.T) {
	e := newEnv(t)
	got, err := e.svc.IngestDataURL(pngDataURL(t, 10, 10))
	if err != nil {
		t.Fatal(err)
	}
	list, _ := e.store.List()
	if len(list) != 1 || list[0].ID != got.ID || !list[0].ModTime.Equal(t0) {
		t.Errorf("entries = %+v, want one stamped %v (the fake clock, not the wall clock)", list, t0)
	}
}

func TestIngestDataURLRefusals(t *testing.T) {
	e := newEnv(t)
	big := "data:image/png;base64," + base64.StdEncoding.EncodeToString(make([]byte, imaging.MaxBytes+1))
	cases := []struct {
		name string
		in   string
		want error
	}{
		{"not a data URL", "https://example.com/a.png", imaging.ErrUnsupportedFormat},
		{"text declared as png", "data:image/png;base64," + base64.StdEncoding.EncodeToString([]byte("hello")), imaging.ErrUnsupportedFormat},
		{"gif declared", "data:image/gif;base64," + base64.StdEncoding.EncodeToString(pngBytes(t, 4, 4)), imaging.ErrUnsupportedFormat},
		{"over 8 MB", big, imaging.ErrTooLarge},
		{"empty payload", "data:image/png;base64,", imaging.ErrEmpty},
	}
	for _, c := range cases {
		if _, err := e.svc.IngestDataURL(c.in); !errors.Is(err, c.want) {
			t.Errorf("%s: err = %v, want %v", c.name, err, c.want)
		}
	}
	if n := storedCount(t, e); n != 0 {
		t.Errorf("%d files stored after refusals, want 0", n)
	}
}

func TestIngestURLFetchesConvertsAndStores(t *testing.T) {
	e := newEnv(t)
	e.fetch.data, e.fetch.ct = pngBytes(t, 2400, 1200), "image/png"
	got, err := e.svc.IngestURL(context.Background(), "https://photos.example/soup.png")
	if err != nil {
		t.Fatal(err)
	}
	if len(e.fetch.calls) != 1 || e.fetch.calls[0] != "https://photos.example/soup.png" {
		t.Errorf("fetch calls = %v", e.fetch.calls)
	}
	if got.Width != 1600 || got.Height != 800 {
		t.Errorf("Stored = %+v, want 1600x800", got)
	}
	mustWebP(t, e, got.ID, 1600, 800)
}

func TestIngestURLRefusesBadURLsWithoutFetching(t *testing.T) {
	e := newEnv(t)
	for _, u := range []string{"", "not a url", "http://example.com/a.png", "ftp://example.com/a.png", "https://", "https://user:pw@example.com/a.png", "file:///etc/passwd", "data:image/png;base64,AAAA", "//example.com/a.png"} {
		if _, err := e.svc.IngestURL(context.Background(), u); !errors.Is(err, images.ErrURLInvalid) {
			t.Errorf("%q: err = %v, want ErrURLInvalid", u, err)
		}
	}
	if len(e.fetch.calls) != 0 {
		t.Errorf("the fetcher was called for refused URLs: %v", e.fetch.calls)
	}
}

func TestIngestURLMapsFetchErrors(t *testing.T) {
	e := newEnv(t)
	cases := []struct {
		name string
		err  error
		want error
	}{
		{"private address", fmt.Errorf("dial: %w", imagefetch.ErrBlocked), images.ErrURLBlocked},
		{"redirect to http", imagefetch.ErrNotHTTPS, images.ErrURLInvalid},
		{"too large to download", imagefetch.ErrTooLarge, imaging.ErrTooLarge},
		{"not an image content type", imagefetch.ErrContentType, imaging.ErrUnsupportedFormat},
		{"404", fmt.Errorf("%w: 404 Not Found", imagefetch.ErrStatus), images.ErrURLUnreachable},
		{"too many redirects", imagefetch.ErrTooManyRedirects, images.ErrURLUnreachable},
		{"timeout", context.DeadlineExceeded, images.ErrURLUnreachable},
		{"connection refused", errors.New("connection refused"), images.ErrURLUnreachable},
	}
	for _, c := range cases {
		e.fetch.data, e.fetch.err = nil, c.err
		if _, err := e.svc.IngestURL(context.Background(), "https://photos.example/a.png"); !errors.Is(err, c.want) {
			t.Errorf("%s: err = %v, want %v", c.name, err, c.want)
		}
	}
	if n := storedCount(t, e); n != 0 {
		t.Errorf("%d files stored after fetch errors, want 0", n)
	}
}

// The downloaded bytes go through the same limits as an upload: 8 MB, the real format, the pixel caps.
func TestIngestURLAppliesTheUploadLimits(t *testing.T) {
	e := newEnv(t)
	cases := []struct {
		name string
		data []byte
		want error
	}{
		{"9 MB body", bytes.Repeat([]byte{1}, 9<<20), imaging.ErrTooLarge},
		{"text served as image/png", []byte("<html>not an image</html>"), imaging.ErrUnsupportedFormat},
		{"empty body", nil, imaging.ErrEmpty},
	}
	for _, c := range cases {
		e.fetch.data, e.fetch.ct, e.fetch.err = c.data, "image/png", nil
		if _, err := e.svc.IngestURL(context.Background(), "https://photos.example/a.png"); !errors.Is(err, c.want) {
			t.Errorf("%s: err = %v, want %v", c.name, err, c.want)
		}
	}
	if n := storedCount(t, e); n != 0 {
		t.Errorf("%d files stored, want 0", n)
	}
}

// The production fetcher (the Recipe File one), with DNS answering a private address: refused before any connection.
func TestIngestURLThroughTheRealSSRFFetcherRefusesPrivateTargets(t *testing.T) {
	lookups := map[string]string{
		"internal.example": "10.0.0.5",
		"loopback.example": "127.0.0.1",
		"metadata.example": "169.254.169.254",
		"v6local.example":  "fd12:3456::1",
		"mapped.example":   "::ffff:192.168.1.10",
	}
	f := imagefetch.New(imagefetch.Options{LookupIP: func(_ context.Context, host string) ([]netip.Addr, error) {
		if ip, ok := lookups[host]; ok {
			return []netip.Addr{netip.MustParseAddr(ip)}, nil
		}
		return nil, errors.New("no such host")
	}})
	e := newEnv(t)
	e.svc = images.NewService(e.store, f, e.refs, e.clk)
	for host := range lookups {
		_, err := e.svc.IngestURL(context.Background(), "https://"+host+"/a.png")
		if !errors.Is(err, images.ErrURLBlocked) {
			t.Errorf("%s: err = %v, want ErrURLBlocked", host, err)
		}
	}
	for _, lit := range []string{"https://127.0.0.1/a.png", "https://[::1]/a.png", "https://169.254.169.254/latest/meta-data/", "https://10.1.2.3:8443/a.png", "https://0.0.0.0/a.png"} {
		if _, err := e.svc.IngestURL(context.Background(), lit); !errors.Is(err, images.ErrURLBlocked) {
			t.Errorf("%s: err = %v, want ErrURLBlocked", lit, err)
		}
	}
	if _, err := e.svc.IngestURL(context.Background(), "https://unknown.example/a.png"); !errors.Is(err, images.ErrURLUnreachable) {
		t.Errorf("unresolvable host: err = %v, want ErrURLUnreachable", err)
	}
	if n := storedCount(t, e); n != 0 {
		t.Errorf("%d files stored, want 0", n)
	}
}

// ---- discard ----

func TestDiscardDeletesAnUnreferencedImage(t *testing.T) {
	e := newEnv(t)
	got, _ := e.svc.IngestDataURL(pngDataURL(t, 8, 8))
	if err := e.svc.Discard(context.Background(), got.ID); err != nil {
		t.Fatal(err)
	}
	if e.store.Exists(got.ID) {
		t.Error("the image must be gone")
	}
	if err := e.svc.Discard(context.Background(), got.ID); err != nil {
		t.Errorf("discarding twice must be harmless, got %v", err)
	}
}

func TestDiscardKeepsAReferencedImage(t *testing.T) {
	e := newEnv(t)
	got, _ := e.svc.IngestDataURL(pngDataURL(t, 8, 8))
	e.refs.ids[got.ID] = true
	if err := e.svc.Discard(context.Background(), got.ID); !errors.Is(err, images.ErrInUse) {
		t.Errorf("err = %v, want ErrInUse", err)
	}
	if !e.store.Exists(got.ID) {
		t.Error("a referenced image must stay")
	}
}

func TestDiscardIsFailClosedAndRejectsBadIDs(t *testing.T) {
	e := newEnv(t)
	got, _ := e.svc.IngestDataURL(pngDataURL(t, 8, 8))
	e.refs.err = errors.New("db down")
	if err := e.svc.Discard(context.Background(), got.ID); err == nil || !e.store.Exists(got.ID) {
		t.Errorf("a failing Referencer must not delete: err = %v, exists = %v", err, e.store.Exists(got.ID))
	}
	e.refs.err = nil
	for _, bad := range []string{"", "../x", "ABC", "0123456789abcdef0123456789abcdeg"} {
		if err := e.svc.Discard(context.Background(), bad); !errors.Is(err, imaging.ErrNotFound) {
			t.Errorf("Discard(%q) = %v, want ErrNotFound", bad, err)
		}
	}
	if err := e.svc.Discard(context.Background(), "0123456789abcdef0123456789abcdef"); err != nil {
		t.Errorf("a well-formed but missing id is not an error, got %v", err)
	}
}

// ---- orphan sweep ----

func seed(t *testing.T, e *env, age time.Duration) string {
	t.Helper()
	id, err := e.store.SaveAt([]byte("webp"), e.clk.Now().Add(-age))
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func TestSweepDeletesOldUnreferencedImagesOnly(t *testing.T) {
	e := newEnv(t)
	oldOrphan := seed(t, e, 25*time.Hour)
	oldUsed := seed(t, e, 400*24*time.Hour)
	young := seed(t, e, 2*time.Hour)
	e.refs.ids[oldUsed] = true

	res, err := e.svc.Sweep(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Deleted) != 1 || res.Deleted[0] != oldOrphan || res.Kept != 2 {
		t.Errorf("result = %+v, want deleted [%s], kept 2", res, oldOrphan)
	}
	if e.store.Exists(oldOrphan) || !e.store.Exists(oldUsed) || !e.store.Exists(young) {
		t.Errorf("exists: orphan=%v used=%v young=%v, want false true true", e.store.Exists(oldOrphan), e.store.Exists(oldUsed), e.store.Exists(young))
	}
}

func TestSweepGraceBoundaryIsStrict(t *testing.T) {
	e := newEnv(t)
	exactly := seed(t, e, images.OrphanGrace)
	justOver := seed(t, e, images.OrphanGrace+time.Second)
	res, err := e.svc.Sweep(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !e.store.Exists(exactly) || e.store.Exists(justOver) || len(res.Deleted) != 1 {
		t.Errorf("exactly=%v justOver=%v result=%+v; an image exactly OrphanGrace old stays", e.store.Exists(exactly), e.store.Exists(justOver), res)
	}
}

func TestSweepFailsClosedWhenReferencesAreUnknown(t *testing.T) {
	e := newEnv(t)
	old := seed(t, e, 72*time.Hour)
	e.refs.err = errors.New("no such column: image")
	if _, err := e.svc.Sweep(context.Background()); err == nil {
		t.Fatal("Sweep must report the Referencer failure")
	}
	if !e.store.Exists(old) {
		t.Error("nothing may be deleted when the references could not be read")
	}
}

func TestSweepRemovesStaleTempFilesOnly(t *testing.T) {
	e := newEnv(t)
	seed(t, e, time.Minute) // makes the directory
	stale := filepath.Join(e.dir, ".tmp-stale")
	fresh := filepath.Join(e.dir, ".tmp-fresh")
	for _, p := range []string{stale, fresh} {
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	old := t0.Add(-2 * images.StaleTempAge)
	if err := os.Chtimes(stale, old, old); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(fresh, t0.Add(-time.Minute), t0.Add(-time.Minute)); err != nil {
		t.Fatal(err)
	}
	res, err := e.svc.Sweep(context.Background())
	if err != nil || res.TempRemoved != 1 {
		t.Fatalf("result = %+v, err = %v; want 1 temp file removed", res, err)
	}
	if _, err := os.Stat(stale); !os.IsNotExist(err) {
		t.Error("the stale temp file must be removed")
	}
	if _, err := os.Stat(fresh); err != nil {
		t.Error("the fresh temp file must stay")
	}
}

func TestSweepOnAnEmptyStoreIsHarmless(t *testing.T) {
	e := newEnv(t)
	res, err := e.svc.Sweep(context.Background())
	if err != nil || len(res.Deleted) != 0 || res.Kept != 0 {
		t.Errorf("result = %+v, err = %v", res, err)
	}
	sort.Strings(res.Deleted)
}

// lateRefs reports no references on the first call and `id` as referenced from the second call on: a record that
// saved the image between the snapshot and the delete.
type lateRefs struct {
	id    string
	calls int
}

func (r *lateRefs) ReferencedIDs(context.Context) (map[string]bool, error) {
	r.calls++
	if r.calls > 1 {
		return map[string]bool{r.id: true}, nil
	}
	return map[string]bool{}, nil
}

func (r *lateRefs) IsReferenced(ctx context.Context, id string) (bool, error) {
	m, err := r.ReferencedIDs(ctx)
	return m[id], err
}

func TestSweepRechecksReferencesRightBeforeEachDelete(t *testing.T) {
	e := newEnv(t)
	old := seed(t, e, 25*time.Hour)
	svc := images.NewService(e.store, e.fetch, &lateRefs{id: old}, e.clk)
	res, err := svc.Sweep(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !e.store.Exists(old) || len(res.Deleted) != 0 {
		t.Errorf("an image referenced after the snapshot must survive: exists=%v deleted=%v", e.store.Exists(old), res.Deleted)
	}
}

func TestDiscardRechecksReferencesRightBeforeDeleting(t *testing.T) {
	e := newEnv(t)
	got, _ := e.svc.IngestDataURL(pngDataURL(t, 8, 8))
	svc := images.NewService(e.store, e.fetch, &lateRefs{id: got.ID, calls: 1}, e.clk)
	if err := svc.Discard(context.Background(), got.ID); !errors.Is(err, images.ErrInUse) || !e.store.Exists(got.ID) {
		t.Errorf("Discard = %v, exists = %v; want ErrInUse and the image kept", err, e.store.Exists(got.ID))
	}
}

// ---- guarded store (IM2: file cleanup goes through the references) ----

func TestGuardedDeleteKeepsAnImageAnotherRecordReferences(t *testing.T) {
	e := newEnv(t)
	got, _ := e.svc.IngestDataURL(pngDataURL(t, 8, 8))
	g := images.NewGuarded(e.store, e.refs)
	e.refs.ids[got.ID] = true
	if err := g.Delete(context.Background(), got.ID); err != nil {
		t.Errorf("a referenced image is kept without an error, got %v", err)
	}
	if !g.Exists(got.ID) {
		t.Fatal("a referenced image must stay")
	}
	delete(e.refs.ids, got.ID)
	if err := g.Delete(context.Background(), got.ID); err != nil || g.Exists(got.ID) {
		t.Errorf("an unreferenced image is deleted: err = %v, exists = %v", err, g.Exists(got.ID))
	}
}

func TestGuardedDeleteIsFailClosed(t *testing.T) {
	e := newEnv(t)
	got, _ := e.svc.IngestDataURL(pngDataURL(t, 8, 8))
	g := images.NewGuarded(e.store, e.refs)
	e.refs.err = errors.New("db down")
	if err := g.Delete(context.Background(), got.ID); err == nil || !g.Exists(got.ID) {
		t.Errorf("a failing Referencer must delete nothing: err = %v, exists = %v", err, g.Exists(got.ID))
	}
}
