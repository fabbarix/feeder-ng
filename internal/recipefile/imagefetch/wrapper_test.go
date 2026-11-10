package imagefetch_test

import (
	"context"
	"errors"
	"net/netip"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/recipefile/imagefetch"
	"github.com/fabbarix/feeder-ng/internal/safehttp"
)

// imagefetch is a thin wrapper over safehttp: its public API and the existing
// tests stay as they are; these tests pin that the guard is the shared one.

func TestSentinelErrorsAreTheSharedOnes(t *testing.T) {
	for name, pair := range map[string][2]error{
		"ErrNotHTTPS":         {imagefetch.ErrNotHTTPS, safehttp.ErrNotHTTPS},
		"ErrBlocked":          {imagefetch.ErrBlocked, safehttp.ErrBlocked},
		"ErrTooLarge":         {imagefetch.ErrTooLarge, safehttp.ErrTooLarge},
		"ErrContentType":      {imagefetch.ErrContentType, safehttp.ErrContentType},
		"ErrStatus":           {imagefetch.ErrStatus, safehttp.ErrStatus},
		"ErrTooManyRedirects": {imagefetch.ErrTooManyRedirects, safehttp.ErrTooManyRedirects},
	} {
		if !errors.Is(pair[0], pair[1]) {
			t.Errorf("imagefetch.%s must be (or wrap) safehttp.%s so one errors.Is works for both", name, name)
		}
	}
}

func TestBlockedIsTheSharedPredicate(t *testing.T) {
	for _, s := range []string{"127.0.0.1", "169.254.169.254", "::ffff:10.0.0.1", "64:ff9b::a00:1", "100.64.0.1", "8.8.8.8", "2606:4700:4700::1111"} {
		a := netip.MustParseAddr(s)
		if imagefetch.Blocked(a) != safehttp.Blocked(a) {
			t.Errorf("%s: imagefetch.Blocked and safehttp.Blocked disagree", s)
		}
	}
	if !safehttp.Blocked(netip.MustParseAddr("169.254.169.254")) {
		t.Error("the metadata address must be blocked")
	}
}

func TestLimitsStayTheImagePolicy(t *testing.T) {
	if imagefetch.MaxBytes != 10<<20 || imagefetch.Timeout != 15*time.Second || imagefetch.MaxRedirects != safehttp.MaxRedirects {
		t.Fatalf("limits changed: %d %v %d", imagefetch.MaxBytes, imagefetch.Timeout, imagefetch.MaxRedirects)
	}
}

func TestCredentialsInImageURLsAreRefusedWithTheSharedError(t *testing.T) {
	_, _, err := imagefetch.New(imagefetch.Options{}).Fetch(context.Background(), "https://user:pw@example.com/a.png")
	if !errors.Is(err, safehttp.ErrCredentials) {
		t.Fatalf("got %v, want safehttp.ErrCredentials", err)
	}
}

// ---- user-visible wording stays as it was before the safehttp extraction -----
//
// Import Review shows these messages to people. They are the old texts, and
// errors.Is still matches both the imagefetch and the safehttp sentinels.

func TestErrorTextsAreTheOriginalImageWording(t *testing.T) {
	for name, tc := range map[string]struct {
		err  error
		want string
	}{
		"ErrNotHTTPS":         {imagefetch.ErrNotHTTPS, "only https URLs are fetched"},
		"ErrBlocked":          {imagefetch.ErrBlocked, "address is private, loopback or link-local"},
		"ErrTooLarge":         {imagefetch.ErrTooLarge, "image is larger than 10 MB"},
		"ErrContentType":      {imagefetch.ErrContentType, "response is not a JPEG, PNG or WebP image"},
		"ErrStatus":           {imagefetch.ErrStatus, "unexpected HTTP status"},
		"ErrTooManyRedirects": {imagefetch.ErrTooManyRedirects, "too many redirects"},
	} {
		if got := tc.err.Error(); got != tc.want {
			t.Errorf("%s text = %q, want %q", name, got, tc.want)
		}
	}
}

func TestFetchErrorsReadAsBeforeAndStillMatchBothSentinels(t *testing.T) {
	// Too large (declared).
	srv, f := server(t, serve("image/png", []byte("0123456789")), imagefetch.Options{MaxBytes: 4})
	_, _, err := f.Fetch(context.Background(), srv.URL)
	checkWording(t, "too large", err, "image is larger than 10 MB", imagefetch.ErrTooLarge, safehttp.ErrTooLarge)

	// Wrong content type.
	srv, f = server(t, serve("text/html", []byte("<html>")), imagefetch.Options{})
	_, _, err = f.Fetch(context.Background(), srv.URL)
	checkWording(t, "content type", err, "response is not a JPEG, PNG or WebP image", imagefetch.ErrContentType, safehttp.ErrContentType)

	// Credentials in the URL.
	_, _, err = imagefetch.New(imagefetch.Options{}).Fetch(context.Background(), "https://user:pw@example.com/a.png")
	checkWording(t, "credentials", err, "credentials in image URLs are refused", safehttp.ErrCredentials)

	// Plain http.
	_, _, err = imagefetch.New(imagefetch.Options{}).Fetch(context.Background(), "http://example.com/a.png")
	checkWording(t, "not https", err, "only https URLs are fetched", imagefetch.ErrNotHTTPS, safehttp.ErrNotHTTPS)
}

func checkWording(t *testing.T, name string, err error, want string, sentinels ...error) {
	t.Helper()
	if err == nil {
		t.Fatalf("%s: no error", name)
	}
	if !strings.Contains(err.Error(), want) {
		t.Errorf("%s: message %q does not read %q", name, err.Error(), want)
	}
	if strings.Contains(err.Error(), "response is larger than the limit") || strings.Contains(err.Error(), "content type is not allowed") || strings.Contains(err.Error(), "credentials in URLs") {
		t.Errorf("%s: the generic safehttp wording leaked into an image message: %q", name, err.Error())
	}
	for _, s := range sentinels {
		if !errors.Is(err, s) {
			t.Errorf("%s: errors.Is(%v, %v) is false", name, err, s)
		}
	}
}
