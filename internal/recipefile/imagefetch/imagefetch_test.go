package imagefetch_test

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/recipefile/imagefetch"
)

func TestBlockedAddresses(t *testing.T) {
	blocked := []string{
		"127.0.0.1", "127.255.255.254", "::1", "0.0.0.0", "::",
		"10.0.0.1", "10.255.255.255", "172.16.0.1", "172.31.255.255", "192.168.1.1",
		"169.254.169.254", "169.254.0.1", "fe80::1", "fe80::abcd",
		"fc00::1", "fd12:3456::1", "100.64.0.1", "100.127.255.255",
		"224.0.0.1", "ff02::1",
		"::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", "::ffff:192.168.0.1",
	}
	for _, s := range blocked {
		if !imagefetch.Blocked(netip.MustParseAddr(s)) {
			t.Errorf("%s must be blocked", s)
		}
	}
	allowed := []string{"8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.255.255", "172.32.0.1", "100.63.255.255", "100.128.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"}
	for _, s := range allowed {
		if imagefetch.Blocked(netip.MustParseAddr(s)) {
			t.Errorf("%s must be allowed", s)
		}
	}
}

// png is a few bytes; the fetcher checks the Content-Type header, not the content.
var body = []byte("\x89PNG\r\n\x1a\n-fake-")

// server starts a TLS test server and returns a Fetcher that trusts it and may dial only that server's port.
func server(t *testing.T, h http.Handler, opts imagefetch.Options) (*httptest.Server, *imagefetch.Fetcher) {
	t.Helper()
	srv := httptest.NewTLSServer(h)
	t.Cleanup(srv.Close)
	return srv, newFetcher(t, srv, opts, srv)
}

func newFetcher(t *testing.T, trust *httptest.Server, opts imagefetch.Options, allowed ...*httptest.Server) *imagefetch.Fetcher {
	t.Helper()
	pool := x509.NewCertPool()
	pool.AddCert(trust.Certificate())
	opts.TLSConfig = &tls.Config{RootCAs: pool}
	ports := map[uint16]bool{}
	for _, s := range allowed {
		u, _ := url.Parse(s.URL)
		p, _ := strconv.Atoi(u.Port())
		ports[uint16(p)] = true
	}
	if opts.Allow == nil {
		opts.Allow = func(ap netip.AddrPort) bool { return ports[ap.Port()] && ap.Addr().IsLoopback() }
	}
	return imagefetch.New(opts)
}

func serve(ct string, payload []byte) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", ct)
		w.Write(payload)
	})
}

func TestFetchReturnsTheBodyAndContentType(t *testing.T) {
	srv, f := server(t, serve("image/png", body), imagefetch.Options{})
	data, ct, err := f.Fetch(context.Background(), srv.URL+"/a.png")
	if err != nil || ct != "image/png" || string(data) != string(body) {
		t.Fatalf("got %q %q %v", data, ct, err)
	}
	for _, c := range []string{"image/jpeg", "image/webp", "image/png; charset=binary"} {
		srv2, f2 := server(t, serve(c, body), imagefetch.Options{})
		if _, _, err := f2.Fetch(context.Background(), srv2.URL); err != nil {
			t.Errorf("%s must be accepted: %v", c, err)
		}
	}
}

func TestFetchRefusesOtherContentTypes(t *testing.T) {
	for _, c := range []string{"text/html", "image/svg+xml", "image/gif", "application/octet-stream", ""} {
		srv, f := server(t, serve(c, body), imagefetch.Options{})
		if _, _, err := f.Fetch(context.Background(), srv.URL); !errors.Is(err, imagefetch.ErrContentType) {
			t.Errorf("Content-Type %q: got %v, want ErrContentType", c, err)
		}
	}
}

func TestFetchRefusesNon200(t *testing.T) {
	srv, f := server(t, http.NotFoundHandler(), imagefetch.Options{})
	if _, _, err := f.Fetch(context.Background(), srv.URL); !errors.Is(err, imagefetch.ErrStatus) {
		t.Fatalf("got %v", err)
	}
}

func TestFetchEnforcesTheSizeLimit(t *testing.T) {
	t.Run("declared by Content-Length", func(t *testing.T) {
		srv, f := server(t, serve("image/png", make([]byte, 2048)), imagefetch.Options{MaxBytes: 1024})
		if _, _, err := f.Fetch(context.Background(), srv.URL); !errors.Is(err, imagefetch.ErrTooLarge) {
			t.Fatalf("got %v", err)
		}
	})
	t.Run("streamed without a length", func(t *testing.T) {
		var sent atomic.Int64
		h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "image/png")
			chunk := make([]byte, 512)
			for i := 0; i < 64; i++ {
				n, err := w.Write(chunk)
				sent.Add(int64(n))
				w.(http.Flusher).Flush()
				if err != nil {
					return
				}
			}
		})
		srv, f := server(t, h, imagefetch.Options{MaxBytes: 1024})
		if _, _, err := f.Fetch(context.Background(), srv.URL); !errors.Is(err, imagefetch.ErrTooLarge) {
			t.Fatalf("got %v", err)
		}
		if sent.Load() >= 64*512 {
			t.Fatal("the fetcher must stop reading at the limit")
		}
	})
	t.Run("exactly the limit is fine", func(t *testing.T) {
		srv, f := server(t, serve("image/png", make([]byte, 1024)), imagefetch.Options{MaxBytes: 1024})
		if _, _, err := f.Fetch(context.Background(), srv.URL); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("the default is 10 MB", func(t *testing.T) {
		if imagefetch.MaxBytes != 10<<20 || imagefetch.Timeout != 15*time.Second {
			t.Fatal("defaults changed")
		}
	})
}

func TestFetchTimesOut(t *testing.T) {
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(5 * time.Second):
		}
	})
	srv, f := server(t, h, imagefetch.Options{Timeout: 150 * time.Millisecond})
	start := time.Now()
	_, _, err := f.Fetch(context.Background(), srv.URL)
	if err == nil || time.Since(start) > 3*time.Second {
		t.Fatalf("err=%v after %v, want a quick timeout", err, time.Since(start))
	}
}

func TestFetchTimeoutAlsoCoversASlowBody(t *testing.T) {
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		w.Write([]byte("x"))
		w.(http.Flusher).Flush()
		select {
		case <-r.Context().Done():
		case <-time.After(5 * time.Second):
		}
	})
	srv, f := server(t, h, imagefetch.Options{Timeout: 150 * time.Millisecond})
	start := time.Now()
	if _, _, err := f.Fetch(context.Background(), srv.URL); err == nil || time.Since(start) > 3*time.Second {
		t.Fatalf("err=%v after %v", err, time.Since(start))
	}
}

// SSRF.

func TestFetchRefusesPlainHTTPAndOtherSchemes(t *testing.T) {
	f := imagefetch.New(imagefetch.Options{})
	for _, u := range []string{"http://example.com/a.png", "ftp://example.com/a.png", "file:///etc/passwd", "gopher://example.com/", "//example.com/a.png", "example.com/a.png", "data:image/png;base64,AAAA", ""} {
		if _, _, err := f.Fetch(context.Background(), u); !errors.Is(err, imagefetch.ErrNotHTTPS) {
			t.Errorf("%q: got %v, want ErrNotHTTPS", u, err)
		}
	}
}

func TestFetchRefusesPrivateLiteralAddressesUnderTheDefaultPolicy(t *testing.T) {
	var hits atomic.Int64
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { hits.Add(1); w.Header().Set("Content-Type", "image/png") }))
	defer srv.Close()
	f := newFetcher(t, srv, imagefetch.Options{Allow: func(ap netip.AddrPort) bool { return !imagefetch.Blocked(ap.Addr()) }})
	port := strings.TrimPrefix(srv.URL, "https://127.0.0.1:")
	for _, u := range []string{
		srv.URL + "/a.png",                     // the live loopback httptest server
		"https://localhost:" + port + "/a.png", // a name that resolves to loopback
		"https://[::1]:" + port + "/a.png",
		"https://169.254.169.254/latest/meta-data/",
		"https://10.0.0.5/a.png",
		"https://192.168.1.10:8443/a.png",
		"https://172.16.0.1/a.png",
		"https://0.0.0.0:" + port + "/a.png",
		"https://[::ffff:127.0.0.1]:" + port + "/a.png",
		"https://2130706433:" + port + "/a.png", // 127.0.0.1 as one decimal number
		"https://0x7f.0.0.1:" + port + "/a.png",
		"https://user:pass@127.0.0.1:" + port + "/a.png",
	} {
		_, _, err := f.Fetch(context.Background(), u)
		if err == nil {
			t.Errorf("%s must be refused", u)
		}
	}
	if hits.Load() != 0 {
		t.Fatalf("the loopback server received %d requests; nothing may be sent to a blocked address", hits.Load())
	}
	if _, _, err := f.Fetch(context.Background(), srv.URL); !errors.Is(err, imagefetch.ErrBlocked) {
		t.Fatalf("got %v, want ErrBlocked", err)
	}
}

func TestFetchChecksTheResolvedAddressNotTheName(t *testing.T) {
	var hits atomic.Int64
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { hits.Add(1) }))
	defer srv.Close()
	port := strings.TrimPrefix(srv.URL, "https://127.0.0.1:")
	look := func(_ context.Context, host string) ([]netip.Addr, error) {
		switch host {
		case "rebind.example.test":
			return []netip.Addr{netip.MustParseAddr("8.8.8.8"), netip.MustParseAddr("127.0.0.1")}, nil // one bad answer among good ones
		case "meta.example.test":
			return []netip.Addr{netip.MustParseAddr("::ffff:169.254.169.254")}, nil
		}
		return nil, errors.New("no such host")
	}
	f := newFetcher(t, srv, imagefetch.Options{LookupIP: look, Allow: func(ap netip.AddrPort) bool { return !imagefetch.Blocked(ap.Addr()) }})
	for _, host := range []string{"rebind.example.test", "meta.example.test"} {
		if _, _, err := f.Fetch(context.Background(), "https://"+host+":"+port+"/a.png"); !errors.Is(err, imagefetch.ErrBlocked) {
			t.Errorf("%s: got %v, want ErrBlocked (every resolved address must pass)", host, err)
		}
	}
	if _, _, err := f.Fetch(context.Background(), "https://nxdomain.example.test/a.png"); err == nil || errors.Is(err, imagefetch.ErrBlocked) {
		t.Errorf("an unresolvable name is an ordinary failure, got %v", err)
	}
	if hits.Load() != 0 {
		t.Fatal("nothing may reach the server")
	}
}

func TestFetchChecksEveryRedirectHop(t *testing.T) {
	var secretHits atomic.Int64
	secret := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		secretHits.Add(1)
		w.Header().Set("Content-Type", "image/png")
		w.Write(body)
	}))
	defer secret.Close()

	redirect := func(to string) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, to, http.StatusFound) })
	}
	tests := map[string]struct {
		to   func() string
		want error
	}{
		"to a blocked server":     {func() string { return secret.URL + "/x.png" }, imagefetch.ErrBlocked},
		"to the metadata address": {func() string { return "https://169.254.169.254/latest/meta-data/" }, imagefetch.ErrBlocked},
		"to plain http":           {func() string { return "http://example.com/a.png" }, imagefetch.ErrNotHTTPS},
	}
	for name, tc := range tests {
		t.Run(name, func(t *testing.T) {
			front := httptest.NewTLSServer(nil)
			defer front.Close()
			front.Config.Handler = redirect(tc.to())
			pool := x509.NewCertPool()
			pool.AddCert(front.Certificate())
			pool.AddCert(secret.Certificate())
			if _, _, err := imagefetch.New(imagefetch.Options{
				TLSConfig: &tls.Config{RootCAs: pool},
				Allow:     func(ap netip.AddrPort) bool { return ap.Port() == portOf(front) },
			}).Fetch(context.Background(), front.URL); !errors.Is(err, tc.want) {
				t.Fatalf("got %v, want %v", err, tc.want)
			}
			if secretHits.Load() != 0 {
				t.Fatal("the redirect target must never be contacted")
			}
		})
	}
}

func portOf(s *httptest.Server) uint16 {
	u, _ := url.Parse(s.URL)
	p, _ := strconv.Atoi(u.Port())
	return uint16(p)
}

func TestFetchFollowsAllowedRedirectsUpToALimit(t *testing.T) {
	final := httptest.NewTLSServer(serve("image/webp", body))
	defer final.Close()
	hops := 0
	var h http.Handler
	front := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { h.ServeHTTP(w, r) }))
	defer front.Close()
	pool := x509.NewCertPool()
	pool.AddCert(front.Certificate())
	pool.AddCert(final.Certificate())
	f := imagefetch.New(imagefetch.Options{
		TLSConfig: &tls.Config{RootCAs: pool},
		Allow:     func(ap netip.AddrPort) bool { return ap.Port() == portOf(front) || ap.Port() == portOf(final) },
	})

	h = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, final.URL, http.StatusMovedPermanently)
	})
	if data, ct, err := f.Fetch(context.Background(), front.URL); err != nil || ct != "image/webp" || string(data) != string(body) {
		t.Fatalf("one allowed redirect: %q %q %v", data, ct, err)
	}
	h = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hops++
		http.Redirect(w, r, front.URL+"/again", http.StatusFound)
	})
	if _, _, err := f.Fetch(context.Background(), front.URL); !errors.Is(err, imagefetch.ErrTooManyRedirects) {
		t.Fatalf("got %v, want ErrTooManyRedirects", err)
	}
	if hops > imagefetch.MaxRedirects+1 {
		t.Fatalf("followed %d hops", hops)
	}
}

func TestFetchSendsNoCredentialsOrCookies(t *testing.T) {
	var got http.Header
	srv, f := server(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Clone()
		w.Header().Set("Content-Type", "image/png")
	}), imagefetch.Options{})
	if _, _, err := f.Fetch(context.Background(), srv.URL); err != nil {
		t.Fatal(err)
	}
	if got.Get("Cookie") != "" || got.Get("Authorization") != "" {
		t.Fatalf("headers = %v", got)
	}
}
