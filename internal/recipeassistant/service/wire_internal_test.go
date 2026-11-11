package service

import (
	"context"
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/imaging"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
	"github.com/fabbarix/feeder-ng/internal/safehttp"
)

// An https photo over 8 MB must come out of the real SSRF-guarded fetcher as photo_too_large, not photo_unavailable.
func TestAnOversizeHTTPSPhotoIsTooLargeThroughTheRealFetcher(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		_, _ = w.Write(make([]byte, 9<<20))
	}))
	defer srv.Close()
	dir := t.TempDir()
	SetTestHooks(t, dir, Hooks{Safehttp: safehttp.Options{
		LookupIP: func(context.Context, string) ([]netip.Addr, error) {
			return []netip.Addr{netip.MustParseAddr("127.0.0.1")}, nil
		},
		Allow:     func(netip.AddrPort) bool { return true },
		TLSConfig: &tls.Config{InsecureSkipVerify: true},
	}})
	u, _ := url.Parse(srv.URL)
	_, err := lazyPhotos{dataDir: dir}.Prepare(context.Background(), []PhotoInput{{URL: "https://photos.example:" + u.Port() + "/big.jpg"}})
	if got := recipeassistant.CodeOf(err); got != recipeassistant.CodePhotoTooLarge {
		t.Fatalf("code = %q (%v), want photo_too_large (limit %d)", got, err, imaging.MaxBytes)
	}
}
