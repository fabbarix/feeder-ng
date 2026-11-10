package safehttp_test

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

	"github.com/fabbarix/feeder-ng/internal/safehttp"
)

// ---- Blocked --------------------------------------------------------------

func TestBlockedRefusesPrivateLoopbackLinkLocalAndMetadata(t *testing.T) {
	blocked := []string{
		"127.0.0.1", "::1", "0.0.0.0", "::", "0.1.2.3",
		"10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1",
		"169.254.169.254", "fe80::1", "fc00::1", "fd12:3456::1",
		"100.64.0.1", "224.0.0.1", "ff02::1",
		"::ffff:127.0.0.1", "::ffff:169.254.169.254", "::ffff:10.0.0.1",
		"64:ff9b::7f00:1", "2002:7f00:1::1", "::7f00:1", "fec0::1",
		"fd00:ec2::254", // AWS IPv6 metadata endpoint (unique-local)
	}
	for _, s := range blocked {
		if !safehttp.Blocked(netip.MustParseAddr(s)) {
			t.Errorf("%s must be blocked", s)
		}
	}
	for _, s := range []string{"8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.255.255", "172.32.0.1", "100.63.255.255", "100.128.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"} {
		if safehttp.Blocked(netip.MustParseAddr(s)) {
			t.Errorf("%s must be allowed", s)
		}
	}
	if !safehttp.Blocked(netip.Addr{}) {
		t.Error("the zero Addr must be blocked")
	}
}

// ---- helpers --------------------------------------------------------------

var imagePolicy = safehttp.Policy{
	AllowedTypes: []string{"image/png"},
	MaxBytes:     1 << 10,
	Timeout:      5 * time.Second,
}

func portOf(s *httptest.Server) uint16 {
	u, _ := url.Parse(s.URL)
	p, _ := strconv.Atoi(u.Port())
	return uint16(p)
}

// client trusts the given servers' certificates and may dial only their ports on loopback.
func client(t *testing.T, o safehttp.Options, servers ...*httptest.Server) *safehttp.Client {
	t.Helper()
	pool := x509.NewCertPool()
	ports := map[uint16]bool{}
	for _, s := range servers {
		pool.AddCert(s.Certificate())
		ports[portOf(s)] = true
	}
	o.TLSConfig = &tls.Config{RootCAs: pool}
	if o.Allow == nil {
		o.Allow = func(ap netip.AddrPort) bool { return ports[ap.Port()] && ap.Addr().IsLoopback() }
	}
	return safehttp.New(o)
}

func serve(t *testing.T, h http.Handler) *httptest.Server {
	t.Helper()
	s := httptest.NewTLSServer(h)
	t.Cleanup(s.Close)
	return s
}

func respond(ct string, payload []byte) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", ct)
		w.Write(payload)
	})
}

// ---- Fetch: policy --------------------------------------------------------

func TestFetchReturnsBodyContentTypeAndFinalURL(t *testing.T) {
	s := serve(t, respond("image/png; charset=binary", []byte("png!")))
	got, err := client(t, safehttp.Options{}, s).Fetch(context.Background(), s.URL+"/a.png", imagePolicy)
	if err != nil {
		t.Fatal(err)
	}
	if string(got.Body) != "png!" || got.ContentType != "image/png" || got.FinalURL != s.URL+"/a.png" {
		t.Fatalf("got %+v", got)
	}
}

func TestFetchHonoursThePolicysContentTypes(t *testing.T) {
	s := serve(t, respond("text/html", []byte("<p>")))
	c := client(t, safehttp.Options{}, s)
	if _, err := c.Fetch(context.Background(), s.URL, imagePolicy); !errors.Is(err, safehttp.ErrContentType) {
		t.Fatalf("got %v, want ErrContentType", err)
	}
	html := safehttp.Policy{AllowedTypes: []string{"text/html"}, MaxBytes: 100, Timeout: 5 * time.Second}
	if _, err := c.Fetch(context.Background(), s.URL, html); err != nil {
		t.Fatalf("the same server under an html policy: %v", err)
	}
}

func TestFetchEnforcesTheByteCapDeclaredAndStreamed(t *testing.T) {
	big := make([]byte, 2<<10)
	declared := serve(t, respond("image/png", big)) // Content-Length is set by net/http
	streamed := serve(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		f := w.(http.Flusher)
		for i := 0; i < 4; i++ {
			w.Write(make([]byte, 512))
			f.Flush()
		}
	}))
	for name, s := range map[string]*httptest.Server{"declared": declared, "streamed": streamed} {
		if _, err := client(t, safehttp.Options{}, s).Fetch(context.Background(), s.URL, imagePolicy); !errors.Is(err, safehttp.ErrTooLarge) {
			t.Errorf("%s: got %v, want ErrTooLarge", name, err)
		}
	}
	exact := serve(t, respond("image/png", make([]byte, 1<<10)))
	if _, err := client(t, safehttp.Options{}, exact).Fetch(context.Background(), exact.URL, imagePolicy); err != nil {
		t.Fatalf("a body of exactly MaxBytes is fine: %v", err)
	}
}

func TestFetchRefusesNon200(t *testing.T) {
	s := serve(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Error(w, "no", http.StatusNotFound) }))
	if _, err := client(t, safehttp.Options{}, s).Fetch(context.Background(), s.URL, imagePolicy); !errors.Is(err, safehttp.ErrStatus) {
		t.Fatalf("got %v, want ErrStatus", err)
	}
}

func TestFetchTimeoutCoversAStuckServerAndASlowBody(t *testing.T) {
	release := make(chan struct{})
	t.Cleanup(func() { close(release) })
	stuck := serve(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-release:
		}
	}))
	slowBody := serve(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		w.Write([]byte("x"))
		w.(http.Flusher).Flush()
		select {
		case <-r.Context().Done():
		case <-release:
		}
	}))
	p := imagePolicy
	p.Timeout = 300 * time.Millisecond
	for name, s := range map[string]*httptest.Server{"stuck": stuck, "slow body": slowBody} {
		errc := make(chan error, 1)
		go func() {
			_, err := client(t, safehttp.Options{}, s).Fetch(context.Background(), s.URL, p)
			errc <- err
		}()
		select {
		case err := <-errc:
			if !errors.Is(err, context.DeadlineExceeded) {
				t.Errorf("%s: got %v, want a deadline error", name, err)
			}
		case <-time.After(30 * time.Second):
			t.Fatalf("%s: Fetch did not return: the policy timeout is not enforced", name)
		}
	}
}

func TestFetchSendsThePolicyHeadersAndNoCookiesOrCredentials(t *testing.T) {
	var got http.Header
	s := serve(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Clone()
		w.Header().Set("Content-Type", "image/png")
	}))
	p := imagePolicy
	p.Header = http.Header{"Accept": {"image/png"}, "User-Agent": {"Test-UA"}}
	if _, err := client(t, safehttp.Options{}, s).Fetch(context.Background(), s.URL, p); err != nil {
		t.Fatal(err)
	}
	if got.Get("Accept") != "image/png" || got.Get("User-Agent") != "Test-UA" {
		t.Fatalf("policy headers not sent: %v", got)
	}
	if got.Get("Cookie") != "" || got.Get("Authorization") != "" {
		t.Fatalf("no cookies or credentials may be sent: %v", got)
	}
}

func TestFetchIgnoresProxyEnvironment(t *testing.T) {
	var proxied atomic.Int64
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { proxied.Add(1) }))
	defer proxy.Close()
	t.Setenv("HTTPS_PROXY", proxy.URL)
	t.Setenv("https_proxy", proxy.URL)
	t.Setenv("NO_PROXY", "")
	s := serve(t, respond("image/png", []byte("ok")))
	if _, err := client(t, safehttp.Options{}, s).Fetch(context.Background(), s.URL, imagePolicy); err != nil {
		t.Fatal(err)
	}
	if proxied.Load() != 0 {
		t.Fatal("the guard must never go through a proxy (it would hide the real destination)")
	}
}

// ---- Fetch: the guard -----------------------------------------------------

func TestFetchRefusesPlainHTTPOtherSchemesAndCredentials(t *testing.T) {
	c := safehttp.New(safehttp.Options{})
	for _, u := range []string{"http://example.com/a.png", "ftp://example.com/a.png", "file:///etc/passwd", "//example.com/a.png", "example.com/a.png", "javascript:alert(1)", ""} {
		if _, err := c.Fetch(context.Background(), u, imagePolicy); !errors.Is(err, safehttp.ErrNotHTTPS) {
			t.Errorf("%q: got %v, want ErrNotHTTPS", u, err)
		}
	}
	if _, err := c.Fetch(context.Background(), "https://user:pw@example.com/a.png", imagePolicy); !errors.Is(err, safehttp.ErrCredentials) {
		t.Errorf("credentials: got %v, want ErrCredentials", err)
	}
}

func TestFetchRefusesPrivateLiteralsUnderTheDefaultPolicy(t *testing.T) {
	var hits atomic.Int64
	s := serve(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { hits.Add(1) }))
	c := safehttp.New(safehttp.Options{TLSConfig: &tls.Config{InsecureSkipVerify: true}}) // default Allow
	for _, u := range []string{
		s.URL + "/", // 127.0.0.1:port, a real listening server
		"https://127.0.0.1/", "https://[::1]/", "https://10.1.2.3/", "https://192.168.0.1/",
		"https://172.16.0.9/", "https://169.254.169.254/latest/meta-data/", "https://[fd00:ec2::254]/",
		"https://[::ffff:169.254.169.254]/", "https://0.0.0.0/", "https://100.64.0.1/",
	} {
		if _, err := c.Fetch(context.Background(), u, imagePolicy); !errors.Is(err, safehttp.ErrBlocked) {
			t.Errorf("%s: got %v, want ErrBlocked", u, err)
		}
	}
	if hits.Load() != 0 {
		t.Fatal("nothing may reach the server")
	}
}

func TestFetchChecksTheResolvedAddressesNotTheName(t *testing.T) {
	var hits atomic.Int64
	s := serve(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { hits.Add(1) }))
	look := func(_ context.Context, host string) ([]netip.Addr, error) {
		switch host {
		case "rebind.example.test": // one bad answer among good ones
			return []netip.Addr{netip.MustParseAddr("8.8.8.8"), netip.MustParseAddr("127.0.0.1")}, nil
		case "meta.example.test":
			return []netip.Addr{netip.MustParseAddr("::ffff:169.254.169.254")}, nil
		case "private.example.test":
			return []netip.Addr{netip.MustParseAddr("10.0.0.5")}, nil
		}
		return nil, errors.New("no such host")
	}
	c := client(t, safehttp.Options{LookupIP: look, Allow: func(ap netip.AddrPort) bool { return !safehttp.Blocked(ap.Addr()) }}, s)
	port := strconv.Itoa(int(portOf(s)))
	for _, h := range []string{"rebind.example.test", "meta.example.test", "private.example.test"} {
		if _, err := c.Fetch(context.Background(), "https://"+h+":"+port+"/", imagePolicy); !errors.Is(err, safehttp.ErrBlocked) {
			t.Errorf("%s: got %v, want ErrBlocked", h, err)
		}
	}
	if _, err := c.Fetch(context.Background(), "https://nxdomain.example.test/", imagePolicy); err == nil || errors.Is(err, safehttp.ErrBlocked) {
		t.Errorf("an unresolvable name is an ordinary failure, got %v", err)
	}
	if hits.Load() != 0 {
		t.Fatal("nothing may reach the server")
	}
}

func TestFetchResolvesOnceAndDialsTheValidatedAddress(t *testing.T) {
	s := serve(t, respond("image/png", []byte("ok")))
	var lookups atomic.Int64
	look := func(_ context.Context, host string) ([]netip.Addr, error) {
		// First answer is fine; any later lookup would be a DNS-rebinding window.
		if lookups.Add(1) > 1 {
			return []netip.Addr{netip.MustParseAddr("10.0.0.1")}, nil
		}
		return []netip.Addr{netip.MustParseAddr("127.0.0.1")}, nil
	}
	c := client(t, safehttp.Options{LookupIP: look}, s)
	// The certificate is not valid for once.example.test, so the handshake may
	// fail; what matters is how many lookups happened.
	_, _ = c.Fetch(context.Background(), "https://once.example.test:"+strconv.Itoa(int(portOf(s)))+"/", imagePolicy)
	if lookups.Load() != 1 {
		t.Fatalf("the name was looked up %d times, want exactly 1", lookups.Load())
	}
}

func TestFetchChecksEveryRedirectHop(t *testing.T) {
	var secretHits atomic.Int64
	secret := serve(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		secretHits.Add(1)
		w.Header().Set("Content-Type", "image/png")
	}))
	cases := map[string]struct {
		to   string
		want error
	}{
		"to a blocked server":     {secret.URL + "/x.png", safehttp.ErrBlocked},
		"to the metadata address": {"https://169.254.169.254/latest/meta-data/", safehttp.ErrBlocked},
		"to a private literal":    {"https://10.0.0.1/", safehttp.ErrBlocked},
		"to plain http":           {"http://example.com/a.png", safehttp.ErrNotHTTPS},
		"to credentials":          {"https://u:p@example.com/", safehttp.ErrCredentials},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			front := serve(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, tc.to, http.StatusFound) }))
			c := client(t, safehttp.Options{Allow: func(ap netip.AddrPort) bool { return ap.Port() == portOf(front) }}, front, secret)
			if _, err := c.Fetch(context.Background(), front.URL, imagePolicy); !errors.Is(err, tc.want) {
				t.Fatalf("got %v, want %v", err, tc.want)
			}
			if secretHits.Load() != 0 {
				t.Fatal("the redirect target must never be contacted")
			}
		})
	}
}

func TestFetchFollowsAllowedRedirectsUpToTheLimitAndReportsTheFinalURL(t *testing.T) {
	final := serve(t, respond("image/png", []byte("ok")))
	var h http.Handler
	front := serve(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { h.ServeHTTP(w, r) }))
	c := client(t, safehttp.Options{Allow: func(ap netip.AddrPort) bool { return ap.Port() == portOf(front) || ap.Port() == portOf(final) }}, front, final)

	h = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, final.URL+"/done.png", http.StatusMovedPermanently)
	})
	got, err := c.Fetch(context.Background(), front.URL, imagePolicy)
	if err != nil || string(got.Body) != "ok" || got.FinalURL != final.URL+"/done.png" {
		t.Fatalf("one allowed redirect: %+v %v", got, err)
	}

	hops := 0
	h = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hops++
		http.Redirect(w, r, front.URL+"/again", http.StatusFound)
	})
	if _, err := c.Fetch(context.Background(), front.URL, imagePolicy); !errors.Is(err, safehttp.ErrTooManyRedirects) {
		t.Fatalf("got %v, want ErrTooManyRedirects", err)
	}
	if hops > safehttp.MaxRedirects+1 {
		t.Fatalf("followed %d hops, the limit is %d", hops, safehttp.MaxRedirects)
	}
}

// ---- FetchPage ------------------------------------------------------------

func TestPagePolicyConstants(t *testing.T) {
	p := safehttp.PagePolicy()
	if p.MaxBytes != 3<<20 || p.Timeout != 15*time.Second {
		t.Fatalf("page policy = %d bytes, %v; want 3 MB and 15 s", p.MaxBytes, p.Timeout)
	}
	want := map[string]bool{"text/html": true, "application/xhtml+xml": true, "text/plain": true}
	if len(p.AllowedTypes) != len(want) {
		t.Fatalf("allowed types = %v", p.AllowedTypes)
	}
	for _, ct := range p.AllowedTypes {
		if !want[ct] {
			t.Errorf("unexpected allowed type %q", ct)
		}
	}
	if p.Header.Get("User-Agent") != "Feeder (+recipe import)" || p.Header.Get("Accept-Language") != "en" {
		t.Fatalf("headers = %v", p.Header)
	}
}

func TestFetchPageAcceptsHTMLXHTMLAndPlainText(t *testing.T) {
	for _, ct := range []string{"text/html; charset=utf-8", "application/xhtml+xml", "text/plain", "TEXT/HTML"} {
		s := serve(t, respond(ct, []byte("<p>héllo</p>")))
		page, err := client(t, safehttp.Options{}, s).FetchPage(context.Background(), s.URL+"/r")
		if err != nil {
			t.Errorf("%s: %v", ct, err)
			continue
		}
		if string(page.Body) != "<p>héllo</p>" || page.FinalURL != s.URL+"/r" {
			t.Errorf("%s: %+v", ct, page)
		}
	}
}

func TestFetchPageRefusesOtherTypes(t *testing.T) {
	for _, ct := range []string{"image/png", "application/json", "application/pdf", "application/octet-stream", ""} {
		s := serve(t, respond(ct, []byte("x")))
		if _, err := client(t, safehttp.Options{}, s).FetchPage(context.Background(), s.URL); !errors.Is(err, safehttp.ErrContentType) {
			t.Errorf("%q: got %v, want ErrContentType", ct, err)
		}
	}
}

func TestFetchPageCapsAtThreeMegabytes(t *testing.T) {
	over := make([]byte, 3<<20+1)
	s := serve(t, respond("text/html", over))
	if _, err := client(t, safehttp.Options{}, s).FetchPage(context.Background(), s.URL); !errors.Is(err, safehttp.ErrTooLarge) {
		t.Fatalf("3 MB + 1: got %v, want ErrTooLarge", err)
	}
	exact := serve(t, respond("text/html", make([]byte, 3<<20)))
	if _, err := client(t, safehttp.Options{}, exact).FetchPage(context.Background(), exact.URL); err != nil {
		t.Fatalf("exactly 3 MB is fine: %v", err)
	}
}

func TestFetchPageSendsUserAgentAndAcceptLanguage(t *testing.T) {
	var got http.Header
	s := serve(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Clone()
		w.Header().Set("Content-Type", "text/html")
	}))
	if _, err := client(t, safehttp.Options{}, s).FetchPage(context.Background(), s.URL); err != nil {
		t.Fatal(err)
	}
	if got.Get("User-Agent") != "Feeder (+recipe import)" || got.Get("Accept-Language") != "en" {
		t.Fatalf("headers = %v", got)
	}
}

func TestFetchPageDecodesTheDeclaredCharsetToUTF8(t *testing.T) {
	latin1 := []byte("<p>caf\xe9 cr\xe8me</p>")
	s := serve(t, respond("text/html; charset=ISO-8859-1", latin1))
	page, err := client(t, safehttp.Options{}, s).FetchPage(context.Background(), s.URL)
	if err != nil {
		t.Fatal(err)
	}
	if string(page.Body) != "<p>café crème</p>" {
		t.Fatalf("body = %q", page.Body)
	}
	meta := serve(t, respond("text/html", []byte("<meta charset=\"windows-1252\"><p>cr\xe8me</p>")))
	page, err = client(t, safehttp.Options{}, meta).FetchPage(context.Background(), meta.URL)
	if err != nil || !strings.Contains(string(page.Body), "crème") {
		t.Fatalf("meta charset: %q %v", page.Body, err)
	}
}

func TestFetchPageAppliesTheGuardOnlyHTTPSAndRedirects(t *testing.T) {
	c := safehttp.New(safehttp.Options{})
	if _, err := c.FetchPage(context.Background(), "http://example.com/"); !errors.Is(err, safehttp.ErrNotHTTPS) {
		t.Errorf("http: got %v", err)
	}
	if _, err := c.FetchPage(context.Background(), "https://169.254.169.254/"); !errors.Is(err, safehttp.ErrBlocked) {
		t.Errorf("metadata: got %v", err)
	}
	front := serve(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "https://10.0.0.1/", http.StatusFound)
	}))
	cc := client(t, safehttp.Options{Allow: func(ap netip.AddrPort) bool { return ap.Port() == portOf(front) }}, front)
	if _, err := cc.FetchPage(context.Background(), front.URL); !errors.Is(err, safehttp.ErrBlocked) {
		t.Errorf("redirect to a private address: got %v", err)
	}
}

// ---- review send-back: more reserved ranges, unusable policy -----------------

func TestBlockedRefusesTheRemainingReservedRanges(t *testing.T) {
	blocked := map[string][]string{
		"64:ff9b:1::/48 (local-use NAT64)":  {"64:ff9b:1::", "64:ff9b:1::1", "64:ff9b:1:ffff:ffff:ffff:ffff:ffff", "64:ff9b:1::a00:1"},
		"2001::/32 (Teredo)":                {"2001::", "2001::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "2001:0:ffff:ffff:ffff:ffff:ffff:ffff"},
		"198.18.0.0/15 (benchmarking)":      {"198.18.0.0", "198.18.0.1", "198.19.255.255", "::ffff:198.18.5.5"},
		"240.0.0.0/4 (reserved)":            {"240.0.0.0", "240.0.0.1", "250.1.2.3", "255.255.255.254", "255.255.255.255", "::ffff:240.0.0.1"},
		"192.0.0.0/24 (IETF protocol assg)": {"192.0.0.0", "192.0.0.1", "192.0.0.255", "::ffff:192.0.0.8"},
	}
	for name, addrs := range blocked {
		for _, s := range addrs {
			if !safehttp.Blocked(netip.MustParseAddr(s)) {
				t.Errorf("%s: %s must be blocked", name, s)
			}
		}
	}
	// Neighbouring public space stays reachable.
	for _, s := range []string{
		"198.17.255.255", "198.20.0.0", "8.8.4.4",
		"192.0.1.1", "191.255.255.255", "193.0.0.1",
		"2001:1::1", "2001:4860:4860::8888", "2606:4700::1",
		"64:ff9b:2::1", "64:ff9a:1::1",
		"223.255.255.255",
	} {
		if safehttp.Blocked(netip.MustParseAddr(s)) {
			t.Errorf("%s must stay allowed", s)
		}
	}
}

// A zero-value (or half-filled) Policy is refused with ErrPolicy before any
// request is made: no unlimited body, no unlimited wait.
func TestFetchRefusesAnUnusablePolicyWithoutMakingARequest(t *testing.T) {
	var hits atomic.Int32
	s := serve(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.Header().Set("Content-Type", "image/png")
		w.Write([]byte("png!"))
	}))
	c := client(t, safehttp.Options{}, s)
	for name, p := range map[string]safehttp.Policy{
		"zero value":       {},
		"no byte cap":      {AllowedTypes: []string{"image/png"}, Timeout: time.Second},
		"no timeout":       {AllowedTypes: []string{"image/png"}, MaxBytes: 1 << 10},
		"negative cap":     {AllowedTypes: []string{"image/png"}, MaxBytes: -1, Timeout: time.Second},
		"negative timeout": {AllowedTypes: []string{"image/png"}, MaxBytes: 1 << 10, Timeout: -time.Second},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := c.Fetch(context.Background(), s.URL, p); !errors.Is(err, safehttp.ErrPolicy) {
				t.Fatalf("got %v, want ErrPolicy", err)
			}
		})
	}
	if hits.Load() != 0 {
		t.Fatalf("%d request(s) reached the server", hits.Load())
	}
	// A usable policy still works.
	if _, err := c.Fetch(context.Background(), s.URL, imagePolicy); err != nil {
		t.Fatal(err)
	}
}
