package imagefetch_test

import (
	"context"
	"errors"
	"net/netip"
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
