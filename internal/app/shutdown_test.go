package app_test

import (
	"context"
	"io"
	"net"
	"net/http"
	"testing"
	"testing/fstest"
	"time"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/auth"
)

// An open SSE stream must not hold up a graceful shutdown: it ends promptly and Shutdown returns nil.
func TestShutdownWithOpenEventStreamIsPromptAndClean(t *testing.T) {
	h := build(t, fstest.MapFS{"index.html": {Data: []byte("<html></html>")}}, app.NewRegistry())
	token := h.token(t, "cook@example.test", false)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	srv := &http.Server{Handler: h.app.Handler, ReadHeaderTimeout: 5 * time.Second}
	h.app.BindServer(srv)
	go srv.Serve(ln)

	req, _ := http.NewRequest("GET", "http://"+ln.Addr().String()+"/api/events", nil)
	req.AddCookie(&http.Cookie{Name: auth.CookieName, Value: token})
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("status %d", resp.StatusCode)
	}
	buf := make([]byte, 16)
	if _, err := resp.Body.Read(buf); err != nil { // the stream is established
		t.Fatal(err)
	}

	start := time.Now()
	ctx, cancel := contextWithTimeout(10 * time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		t.Fatalf("Shutdown error: %v", err)
	}
	if d := time.Since(start); d > 2*time.Second {
		t.Fatalf("Shutdown took %v, want well under the 10 s grace", d)
	}
	io.Copy(io.Discard, resp.Body)
}

func contextWithTimeout(d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), d)
}
