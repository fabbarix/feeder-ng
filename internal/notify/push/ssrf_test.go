package push_test

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/notify"
	"github.com/fabbarix/feeder-ng/internal/notify/push"
)

// PublicOnlyControl is the net.Dialer.Control hook: it sees the resolved
// address at connect time, so DNS rebinding cannot reach the Feeder's network.
func TestPublicOnlyControlRefusesNonPublicAddresses(t *testing.T) {
	refused := []string{
		"127.0.0.1:443", "127.8.8.8:443", "0.0.0.0:443",
		"10.0.0.1:443", "172.16.5.4:443", "172.31.255.255:443", "192.168.1.10:443",
		"169.254.169.254:80", "169.254.0.1:443", // link-local, cloud metadata
		"100.64.0.1:443", "100.100.100.100:443", "100.127.255.254:443", // CGNAT 100.64.0.0/10
		"224.0.0.1:443",
		"[::1]:443", "[::]:443",
		"[fc00::1]:443", "[fd12:3456::1]:443", // unique local
		"[fe80::1]:443",                // link-local
		"[ff02::1]:443",                // multicast
		"[::ffff:127.0.0.1]:443",       // IPv4-mapped loopback
		"[::ffff:169.254.169.254]:443", // IPv4-mapped metadata
		"[::ffff:10.1.2.3]:443",        // IPv4-mapped private
		"[::ffff:100.64.0.1]:443",      // IPv4-mapped CGNAT
	}
	for _, addr := range refused {
		if err := push.PublicOnlyControl("tcp", addr, nil); err == nil {
			t.Errorf("PublicOnlyControl(%s) = nil, want a refusal", addr)
		}
	}
	allowed := []string{
		"8.8.8.8:443", "142.250.74.78:443", "100.63.255.255:443", "100.128.0.1:443", // just outside CGNAT
		"172.15.0.1:443", "172.32.0.1:443", "169.253.1.1:443",
		"[2606:4700:4700::1111]:443", "[2a00:1450:4002::65]:443",
	}
	for _, addr := range allowed {
		if err := push.PublicOnlyControl("tcp", addr, nil); err != nil {
			t.Errorf("PublicOnlyControl(%s) = %v, want nil", addr, err)
		}
	}
}

// A host name that resolves to loopback (DNS rebinding) is refused when the
// connection is made, whatever ValidateEndpoint saw earlier.
func TestClientRefusesAHostNameThatResolvesToLoopback(t *testing.T) {
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { hits.Add(1) }))
	defer srv.Close()
	_, port, _ := net.SplitHostPort(srv.Listener.Addr().String())

	for name, ip := range map[string]string{"loopback": "127.0.0.1", "metadata": "169.254.169.254", "private": "10.0.0.5", "cgnat": "100.64.1.1", "v6 loopback": "::1"} {
		lookup := func(context.Context, string) ([]string, error) { return []string{ip}, nil }
		c := push.NewHTTPClient(lookup)
		resp, err := c.Get("http://rebind.example.test:" + port + "/")
		if err == nil {
			resp.Body.Close()
			t.Errorf("%s: request to a host resolving to %s succeeded", name, ip)
			continue
		}
		// The injected lookup must be used and the refusal must come from the dialer.
		var dnsErr *net.DNSError
		if errors.As(err, &dnsErr) {
			t.Errorf("%s: got a DNS error %v; the injected lookup was not used, so the dial guard is untested", name, err)
		}
	}
	if hits.Load() != 0 {
		t.Errorf("the loopback server was reached %d times", hits.Load())
	}
}

func TestClientNeverFollowsRedirects(t *testing.T) {
	c := push.NewHTTPClient(nil)
	if c.CheckRedirect == nil {
		t.Fatal("CheckRedirect is nil: redirects would be followed")
	}
	req, _ := http.NewRequest(http.MethodPost, "https://push.example.test/next", nil)
	if err := c.CheckRedirect(req, []*http.Request{req}); err != http.ErrUseLastResponse {
		t.Errorf("CheckRedirect = %v, want http.ErrUseLastResponse", err)
	}
	if c.Timeout <= 0 {
		t.Errorf("Timeout = %v, want a positive timeout", c.Timeout)
	}
}

// NewSender is the production constructor (used by the notify module): its
// default client is the SSRF-safe one, so a push endpoint on loopback is refused.
func TestNewSenderUsesTheSafeClient(t *testing.T) {
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits.Add(1)
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()
	v, err := push.LoadOrCreateVAPID(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	s := push.NewSender(v, "mailto:admin@example.test")
	err = s.Send(context.Background(), target(t, srv.URL), notify.Payload{Title: "x"})
	if err == nil {
		t.Fatal("Send to a loopback endpoint succeeded")
	}
	if err == notify.ErrGone {
		t.Errorf("a refused connection must be a plain error, not ErrGone")
	}
	if hits.Load() != 0 {
		t.Errorf("the loopback server was reached")
	}
}

// A Sender with no Client also defaults to the safe one.
func TestSenderWithoutAClientDefaultsToTheSafeClient(t *testing.T) {
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { hits.Add(1) }))
	defer srv.Close()
	v, _ := push.LoadOrCreateVAPID(t.TempDir())
	s := &push.Sender{VAPID: v, Subject: "mailto:admin@example.test"}
	if err := s.Send(context.Background(), target(t, srv.URL), notify.Payload{Title: "x"}); err == nil || hits.Load() != 0 {
		t.Errorf("Send = %v, hits = %d; want a refusal before any request", err, hits.Load())
	}
}
